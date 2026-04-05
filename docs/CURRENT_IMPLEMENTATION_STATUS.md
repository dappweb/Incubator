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
- 分账与事件：`PoolAllocated`、`RewardSettled`

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
- 暂停机制：`pause()` / `unpause()`

对应文件：`contracts/SwapPoolManager.sol`

### 4) 前端（React）
- Tab 页面：Overview / Team / OTC / Swap / Mine / Admin(owner)
- 钱包连接 + Sepolia 校验 + 授权流程提示
- Core / OTC / Swap 核心交互已接入
- Appwrite 仅用于公告读取

对应文件：`src/App.tsx`、`src/lib/*.ts`

---

## 二、当前不一致点（需要业务确认）

1. **SuperNode 规则**
- 代码现状：已固定 `Node -> SuperNode`，不允许 `None -> SuperNode`
- 早期文档默认：要求 `Node -> SuperNode`
- 建议：确认后统一“文档 + 合约 + 前端文案”。

2. **身份资产形态**
- 当前方案：OTC 使用 Core 内部 identity 账本，不采用 `IdentityNFT.sol`
- 建议：明确测试网阶段唯一口径，避免双轨并存认知偏差。

---

## 三、测试现状（本次修正后）

- 已将测试与校验脚本迁移到 UUPS/initialize 口径：
  - `test/IncubatorCore.test.ts`
  - `test/NodeOTCMarket.test.ts`
  - `test/SwapPoolManager.test.js`
  - `scripts/validate-contracts.ts`

如后续合约接口再次调整，请同步更新上述四处。

---

## 四、结论

当前仓库已超出“仅骨架”阶段，具备测试网 MVP 的核心链路能力；但“规则口径文档”和“个别业务决策项”仍需冻结，避免对外验收时出现解释不一致。
