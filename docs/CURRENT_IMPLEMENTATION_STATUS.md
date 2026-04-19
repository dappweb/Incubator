# 当前实现状态（2026-04-18）

本文档用于说明“当前代码已实现内容”与“仍待补齐内容”，避免将早期路线图误读为当前真实状态。

## 一、已实现（代码已落地）

### 1) Core（IncubatorCore）

- 矿机购买：`purchaseMachine(quantity)`（1-10）
- 推荐人绑定：`bindReferrer(referrer)`（一次绑定）
- 节点购买：`buyNode()`
- 超级节点购买：`buySuperNode()`（当前允许 `None -> SuperNode` 直购）
- 订单查询：`getMachineOrder(orderId)`、`getUserMachineOrders(user)`
- 角色查询：`roles(user)`、`getUserRole(user)`
- 暂停机制：`pause()` / `unpause()`
- 分账口径：矿机订单中的 60%/5%/5%/8%/20%/2% 会按业务池分别入账；其中排行榜池 2% 在日结时按 1.5%（日榜）+0.5%（幸运榜）分配。节点池和超级节点池只由矿机购买注资，不由节点/超级节点购买注资；节点池、超级节点池、排行榜池不再在购买路径中即时发放。
- 事件：`PoolAllocated`、`RewardSettled`

对应文件：`contracts/IncubatorCore.sol`

### 2) OTC（NodeOTCMarket）

- 挂单 / 撤单 / 成交：`createOrder`、`cancelOrder`、`fillOrder`
- 活跃订单查询：`getActiveOrderIds()`、`getOrder(orderId)`
- 防重复挂单：同一 `identityId` 仅允许一个活跃订单
- 价格下限：按 `role` 维度不低于上次成交价
- 手续费：默认 10%（`feeBps=1000`，可管理员更新）

对应文件：`contracts/NodeOTCMarket.sol`

### 3) Swap（SwapPoolManager）

- 双池模型：`USDT/ICO`（已下线，见下）+ `LIGHT/ICO`（主用）
- 方向限制：`LIGHT/ICO` 仅支持 `LIGHT -> ICO`
- 报价与成交：`quoteExactIn`、`swapExactIn`
- 风控：`minOut` 滑点保护 + `maxPriceImpactBps` 价格冲击保护
- LIGHT 手续费清算：
  - `settleLightFees()`：批结算口径 `60%` 销毁、`30%` 启动池、`7%` 节点池、`3%` 超级节点池
  - **新增 `lightRealtimeDistribute` 开关**（默认关闭）：开启后 `LIGHT -> ICO` 每笔交易实时按同样比例销毁/分账，无需 `settleLightFees`；公共逻辑统一抽到 `_distributeLightFees()`
  - 切换接口：`setLightRealtimeDistribute(bool)`
- **USDT/ICO 池下线（P6）**：`usdtIcoPoolEnabled` 默认 `false`；新增 `setUsdtIcoPoolEnabled(bool)` + `migrateUsdtIcoLiquidity(to)` 迁移历史 LP；测试夹具显式开启该池才可继续使用旧接口。生产侧由 `PrimarySwapController` 承接 USDT↔ICO 流量。
- 暂停机制：`pause()` / `unpause()`

对应文件：`contracts/SwapPoolManager.sol`

### 3.1) Primary Swap（PrimarySwapController）

承接 USDT↔ICO 主市场流量，对接外部 V2 Router；UUPS 可升级。

- 默认费率切片（**P0**）：`superNode = 100 bps`、`nodePool = 200 bps`、`platform = 200 bps`（合计 5%）
- 卖出闸门：`sellEnabled` + `sellEnablerThresholdUsdt`；**新增 `tryAutoEnableSellUsdt()`**（**P3**），任何人在累计 USDT 达阈值后可触发开闸，无需 owner
- 平台累计池视图（**P1**）：
  - 状态：`contractUsdtAccumulated` / `contractIcoAccumulated`
  - 视图：`getContractPoolStats()`
  - 事件：`ContractPoolAccrued(token, amount, totalAfter)`
- 底池注资（**P2**）：
  - 配置：`bottomPoolLpRecipient`、`bottomPoolAutoInjectBps`
  - 接口：`updateBottomPoolConfig(lp, bps)`、`injectBottomPool(usdt, ico, minU, minI)`（owner）
  - `sellIcoForUsdt` 末尾自动注资钩子：`bottomPoolAutoInjectBps>0` 时按比例从契约池抽 ICO 切片，按当前 pair 储备配比 USDT，调用 `IRouterV2Like.addLiquidity` 加入主池；余额不足时安全跳过；累计器按 `min(used, accrued)` 递减
  - 事件：`BottomPoolInjected`、`BottomPoolConfigUpdated`

对应文件：`contracts/PrimarySwapController.sol`

### 4) ICO 代币（IncubatorToken）

- 标准 ERC20 + 持币人自助燃烧：继承 `ERC20Burnable`
- 未售出库存销毁：`burnUnsold(amount)` 仅允许 `owner` 或授权执行者调用，并且只会从 `saleAllocationWallet` 扣减
- 销毁治理：`setBurnExecutor()`、`setSaleAllocationWallet()`
- 销毁统计：链上记录 `totalBurned`

对应文件：`contracts/IncubatorToken.sol`

### 5) 前端（React）

- Tab 页面：Overview / Team / OTC / Swap / Mine / Admin(owner)
- 钱包连接 + CNC Mainnet 校验 + 授权流程提示
- Core / OTC / Swap 核心交互已接入
- Appwrite 仅用于公告读取
- **Admin 新增 4 张卡片**（与本轮 P0/P1/P2/P3/P6 配套，用户端 UI 无改动）：
  - 「契约池累计」只读视图（P1）
  - 「自动开闸 + LIGHT 实时分配」开关（P3）
  - 「USDT/ICO 旧池迁移」（P6，含 `setUsdtIcoPoolEnabled` / `migrateUsdtIcoLiquidity`）
  - 「底池注资」（P2，含配置 + 手动注资）
- `src/lib/swapContract.ts` 同步暴露：`getContractPoolStats`、`tryAutoEnableSellUsdt`、`getLightRealtimeDistribute` / `setLightRealtimeDistribute`、`getUsdtIcoPoolEnabled` / `setUsdtIcoPoolEnabled` / `migrateUsdtIcoLiquidity`、`getBottomPoolConfig` / `updateBottomPoolConfig` / `injectBottomPool`

对应文件：`src/App.tsx`、`src/components/Admin.tsx`、`src/lib/*.ts`

---

## 二、当前不一致点（需要业务确认）

1. **SuperNode 规则**

- 代码现状：允许 `None -> SuperNode` 直购，也支持 `Node -> SuperNode` 升级。
- 历史不一致来源：部分旧文档 / 旧前端文案曾写成“需先购买节点”。
- 当前处理：以前端与实现口径统一为“可直购超级节点”，若后续业务要改回升级制，需要同步调整合约、前端和测试。

2. **推荐人规则**

- 代码现状：`purchaseMachine`、`buyNode`、`buySuperNode` 均要求链上已绑定推荐人。
- 当前口径：前端不再自动回退默认 `Owner`，用户必须先手动绑定上级推荐人；“已有节点/超级节点身份”本身不等于“推荐人已绑定”。
- 当前口径：推节点统一按 `30% -> 20% -> 50%` 循环发放，不区分推荐人是节点还是超级节点；推超级节点统一固定 `20%`。
- 风险点：OTC 获得身份的地址若未绑定推荐人，后续购买行为仍会被 Core 合约拒绝，因此 UI 不能跳过绑定步骤。

3. **身份资产形态**

- 当前方案：OTC 使用 Core 内部 identity 账本，不采用 `IdentityNFT.sol`
- 建议：明确测试网阶段唯一口径，避免双轨并存认知偏差。

4. **日结奖励**

- 代码现状：节点池、超级节点池、排行榜池已改为先入指定池地址，避免在购买矿机时按错误公式即时发放。
- 新增能力：`scripts/settle-core-pools.ts` 已支持自动拉取链上矿机购买事件、推荐关系和当前角色，按“小区业绩 = 直属各支线业绩之和 - 最大支线业绩”计算节点 / 超级节点结算 shares，并发起每日一次的池子结算。
- 兼容方式：若运维显式提供 `NODE_REWARD_RECIPIENTS/NODE_REWARD_SHARES` 或 `SUPER_NODE_REWARD_RECIPIENTS/SUPER_NODE_REWARD_SHARES`，脚本仍按手工口径执行，便于应急覆盖。
- 可观测性：结算脚本默认会输出结构化审计文件到 `artifacts/settlement-runs/`（可用 `SETTLEMENT_WRITE_AUDIT=false` 关闭，`SETTLEMENT_AUDIT_DIR` 指定目录），记录执行参数、步骤结果、错误信息和关键预览数据。

5. **LIGHT 燃烧**

- 代码现状：`MockToken` 已支持真实 `burn()`；`SwapPoolManager` 可对 `LIGHT/ICO` 费池执行真实燃烧与分账清算。
- 限制条件：生产环境中的 LIGHT 代币也必须实现兼容的 `burn(uint256)` 接口，否则 `settleLightFees()` 无法执行真实燃烧。

6. **ICO 未售出库存销毁**

- 代码现状：ICO 主币已从通用 `MockToken` 切换为 `IncubatorToken`，支持专门的销售库存钱包与未售出销毁入口。
- 当前口径：若 ICO 待售库存集中保存在 `saleAllocationWallet`，项目方可在销售结束后调用 `burnUnsold()` 做真实销毁。
- 注意事项：`burnUnsold()` 会直接减少 `totalSupply`；若待售库存分散在多个地址，需要先归集或扩展合约策略。

---

## 三、测试现状（本次修正后）

- 已将测试与校验脚本迁移到 UUPS/initialize 口径：
  - `test/IncubatorToken.test.js`
  - `test/IncubatorCore.test.ts`
  - `test/NodeOTCMarket.test.ts`
  - `test/SwapPoolManager.test.js`
  - `scripts/validate-contracts.ts`

如后续合约接口再次调整，请同步更新上述四处。

---

## 四、结论

当前仓库已超出“仅骨架”阶段，具备测试网 MVP 的核心链路能力；但“规则口径文档”和“个别业务决策项”仍需冻结，避免对外验收时出现解释不一致。
