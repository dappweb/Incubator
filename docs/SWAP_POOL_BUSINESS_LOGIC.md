# USDT/ICO 与 LIGHT/ICO Swap 兑换池业务逻辑（V1）

## 1. 目标与范围
本规范定义两类兑换池：
- `USDT/ICO`：作为主价格池（主流动性）
- `LIGHT/ICO`：作为子币兑换池（高波动池）

该规范用于：
1. 合约实现口径统一
2. 前端报价与风控口径统一
3. 结算与分账口径统一

---

## 2. 角色与资产
- 资产：`USDT`、`ICO`、`LIGHT`
- 角色：普通用户、节点、超级节点、协议管理员
- 协议模块：
  - `SwapPoolManager`（建议新合约）：管理池参数、路由、事件
  - `IncubatorCore`：接收并分发部分手续费池（节点/超节/平台）

---

## 3. 池模型
两池均采用常数乘积做市（CPMM）：

$$x \cdot y = k$$

- `x`：池内 TokenA 储备
- `y`：池内 TokenB 储备
- `k`：常数

### 3.1 报价规则（卖入 tokenIn）
- 输入数量：`amountIn`
- 手续费率：`feeBps`（可配置）
- 实际入池：

$$amountInAfterFee = amountIn \cdot \frac{(10000-feeBps)}{10000}$$

- 输出数量：

$$amountOut = \frac{reserveOut \cdot amountInAfterFee}{reserveIn + amountInAfterFee}$$

---

## 4. 交易路径

### 4.1 USDT -> ICO
1. 用户输入 `amountInUSDT`
2. 计算 `amountOutICO`
3. 校验滑点：`amountOutICO >= minOut`
4. 转入 USDT，转出 ICO
5. 累加手续费并按规则分账

### 4.2 ICO -> USDT
流程同上，方向相反。

### 4.3 LIGHT -> ICO（单向）
1. 用户输入 `amountInLIGHT`
2. 使用 `LIGHT/ICO` 池计算 `amountOutICO`
3. 滑点校验与结算
4. 用户收到 `ICO`
5. 收到的 `LIGHT` 进入手续费池 / 销毁池 / 回流池分账

> `LIGHT/ICO` 池为**单向回收池**，只允许 `LIGHT -> ICO`，不支持 `ICO -> LIGHT`。

---

## 5. 手续费与分账

> 注：具体费率和比例建议全部上链可配置，不要硬编码。

## 5.1 USDT/ICO 池手续费
建议拆分为：
- LP 再注入（提升池深）
- 平台池
- 节点/超级节点激励池（可打到 `IncubatorCore` 对应池）

推荐实现：
- `swapFeeBpsUsdtIco`：默认 30~100 bps（0.3%~1%）
- `feeSplitUsdtIco`：`lpBps / platformBps / nodeBps / superNodeBps`，总和 10000

### 5.2 LIGHT/ICO 池手续费
文档有“LIGHT 兑换手续费池（3% / 7%）”描述，建议采用以下可配置映射：
- `lightSwapNodeBps = 7000`
- `lightSwapSuperNodeBps = 3000`
- 作为 **LIGHT 池手续费的内部分配比例**（不是交易费率本身）

交易费率建议单独参数：
- `swapFeeBpsLightIco`（例如 100~300 bps）

建议将 `LIGHT` 实际到账后的总分流也做成可配置：
- `burnBps`
- `bootstrapPoolBps`
- `nodeRewardBps`
- `superNodeRewardBps`

默认可按业务图口径：
- `60%` 销毁
- `30%` 回流启动池 / 算力池
- `7%` 节点池
- `3%` 超级节点池

---

## 6. 风控与限制

### 6.1 滑点保护
- 每笔交易必须传入 `minOut`
- 若 `amountOut < minOut`，交易回滚

### 6.2 价格冲击限制
- 可配置 `maxPriceImpactBps`
- 超阈值拒绝交易，防止大额冲击和夹子攻击

### 6.3 暂停机制
- `pausePool(pairId)` / `unpausePool(pairId)`
- 极端行情或预言机异常时可快速止损

### 6.4 地址白名单（可选）
- 测试网阶段可选开启，生产建议关闭

---

## 7. 流动性管理

### 7.1 添加流动性
- 管理员或 LP 提供双边资产（USDT+ICO / LIGHT+ICO）
- 记录 LP 份额（可选 LP Token，或内部份额映射）

### 7.2 移除流动性
- 按份额赎回两边资产
- 提取比例与当前池储备一致

---

## 8. 关键状态变量（建议）
- `reserves[pairId].token0`
- `reserves[pairId].token1`
- `swapFeeBps[pairId]`
- `feeVault[pairId][token]`
- `maxPriceImpactBps[pairId]`
- `lastPriceX96[pairId]`（可选，用于前端展示与风控）

---

## 9. 关键事件（建议）
- `SwapExecuted(pairId, trader, tokenIn, amountIn, tokenOut, amountOut, fee)`
- `LiquidityAdded(pairId, provider, amount0, amount1, share)`
- `LiquidityRemoved(pairId, provider, amount0, amount1, share)`
- `FeeDistributed(pairId, token, to, amount, feeType)`
- `PoolConfigUpdated(pairId, key, value)`

---

## 10. 与现有系统对接建议
1. `IncubatorCore` 保持“身份与收益分发核心”定位
2. `SwapPoolManager` 只做兑换与手续费累计
3. 结算时调用 `IncubatorCore` 的池分账入口（或定时批量结算）
4. OTC 与 Swap 分离，避免业务耦合

---

## 11. 测试网验收标准（最小集）
1. 两个池都可初始化并注入流动性
2. `USDT/ICO` 双向可成交，`LIGHT/ICO` 仅 `LIGHT -> ICO` 可成交
3. `minOut` 生效，滑点超限回滚
4. 手续费分账到账正确（节点/超级节点/平台）
5. 暂停后交易失败，恢复后可继续
6. `ICO -> LIGHT` 调用被正确拒绝
7. 大额交易价格冲击限制生效

---

## 12. 实施顺序（建议）
1. 先实现 `USDT/ICO`（主池）
2. 再实现 `LIGHT/ICO`（子池）
3. 最后接入 `IncubatorCore` 分账入口与前端报价面板

如果后续需要，我可以按本规范直接补 `contracts/SwapPoolManager.sol` 与 `scripts/validate-swap.ts` 的最小可运行版本。