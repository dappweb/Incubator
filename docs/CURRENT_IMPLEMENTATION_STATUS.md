# 当前实现状态（2026-03-29）

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
- 分账口径：矿机订单中的 60%/5%/5%/8%/20%/2% 会按业务池分别入账；其中排行榜池 2% 在日结时按 1.5%（日榜）+0.5%（幸运榜）分配。节点池、超级节点池、排行榜池不再在购买路径中即时发放。
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

- 双池模型：`USDT/ICO` + `LIGHT/ICO`
- 方向限制：`LIGHT/ICO` 仅支持 `LIGHT -> ICO`
- 报价与成交：`quoteExactIn`、`swapExactIn`
- 风控：`minOut` 滑点保护 + `maxPriceImpactBps` 价格冲击保护
- LIGHT 手续费清算：新增 `settleLightFees()`，支持按 `60%` 销毁、`30%` 启动池、`7%` 节点池、`3%` 超级节点池清算
- 暂停机制：`pause()` / `unpause()`

对应文件：`contracts/SwapPoolManager.sol`

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

对应文件：`src/App.tsx`、`src/lib/*.ts`

---

## 二、当前不一致点（需要业务确认）

1. **SuperNode 规则**

- 代码现状：允许 `None -> SuperNode` 直购，也支持 `Node -> SuperNode` 升级。
- 历史不一致来源：部分旧文档 / 旧前端文案曾写成“需先购买节点”。
- 当前处理：以前端与实现口径统一为“可直购超级节点”，若后续业务要改回升级制，需要同步调整合约、前端和测试。

2. **推荐人规则**

- 代码现状：`purchaseMachine`、`buyNode`、`buySuperNode` 均要求链上已绑定推荐人。
- 实施口径：前端允许使用默认 `Owner` 作为推荐人，且自邀请时自动回退到 `Owner`；“已有节点/超级节点身份”本身不等于“推荐人已绑定”。
- 风险点：OTC 获得身份的地址若未绑定推荐人，后续购买行为仍会被 Core 合约拒绝，因此 UI 不能跳过绑定步骤。

3. **身份资产形态**

- 当前方案：OTC 使用 Core 内部 identity 账本，不采用 `IdentityNFT.sol`
- 建议：明确测试网阶段唯一口径，避免双轨并存认知偏差。

4. **日结奖励**

- 代码现状：节点池、超级节点池、排行榜池已改为先入指定池地址，避免在购买矿机时按错误公式即时发放。
- 待补能力：按业务图执行“每日一次”的节点/超级节点/排行榜结算与昨日榜单发奖流程。

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
