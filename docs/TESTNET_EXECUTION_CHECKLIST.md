# 测试网执行清单（文件级）

本清单用于把 [docs/PRODUCTION_ROADMAP.md](docs/PRODUCTION_ROADMAP.md) 进一步落到“改哪些文件、先做什么、怎么验收”。

---

## 1. 默认决策建议（未被产品推翻前先按此执行）

为避免实现阻塞，建议先采用以下默认口径：

### 身份规则
- `Node` 限购 1 个。
- `SuperNode` 限购 1 个。
- **默认要求 `Node -> SuperNode`，不允许 `None -> SuperNode` 直升。**

理由：
- 更符合身份升级路径。
- 前端文案更好解释。
- 后续团队权益和烧伤规则更容易扩展。

### OTC 标的
- **默认采用“身份 NFT”方案**，而不是单纯地址角色映射交易。

理由：
- 交易对象清晰。
- 与 `IERC721` 兼容，现有 OTC 合约改造成本最低。
- 后续上架、撤单、成交、所有权追踪更标准。

### 奖励范围
- 测试网首版**不做复杂奖励结算**。
- 仅做矿机分账事件、身份购买状态、OTC 手续费闭环。

理由：
- 先把“可买、可卖、可查”做通。
- 避免奖励规则未冻结时反复重构。

---

## 2. 文件级改造清单

## 2.1 合约

### [contracts/IncubatorCore.sol](contracts/IncubatorCore.sol)

#### 必改项
- 引入 `Pausable`。
- 增加矿机分账配置：
  - LP 池地址
  - 直推池地址
  - 超级节点池地址
  - 节点池地址
  - 平台池地址
  - 榜单池地址
- 增加比例配置与总和校验（固定 10000 bps）。
- `purchaseMachine()` 中执行分账并输出 `PoolAllocated` 事件。
- 增加 `getMachineOrder(uint256)`。
- 保留 `getUserMachineOrders(address)`，必要时再补批量详情查询。
- 增加 `pause()` / `unpause()`。
- 增加价格更新上限保护。

#### 建议新增事件
- `PoolRecipientUpdated`
- `PoolShareUpdated`
- `PoolAllocated`
- `CorePaused`
- `CoreUnpaused`

#### 验收点
- 购买 1 台矿机后，6 个池子金额之和等于订单支付金额。
- 暂停后所有购买交易失败。
- 价格设置到异常值时被拒绝。

---

### [contracts/NodeOTCMarket.sol](contracts/NodeOTCMarket.sol)

#### 必改项
- 增加激活订单枚举能力：
  - `activeOrderIds`
  - `getActiveOrderIds()` 或分页查询
- 增加资产唯一挂单约束：
  - 同一个 `nftContract + tokenId` 仅允许一个活跃订单
- 下单时校验：
  - `ownerOf(tokenId) == seller`
  - 市场已获 `approve` 或 `setApprovalForAll`
- 成交后清理资产挂单映射
- 撤单后清理资产挂单映射

#### 建议新增 view
- `getOrder(uint256)`
- `getActiveOrderIds()`
- `getAssetActiveOrder(address nftContract, uint256 tokenId)`

#### 验收点
- 同一 NFT 不能重复上架。
- 成交后 NFT 所有权转移正确。
- 新挂单价格不能低于该市场上次成交价。

---

### 建议新增 [contracts/IdentityNFT.sol](contracts/IdentityNFT.sol)

#### 最小能力
- 基于 `ERC721`。
- 支持两类身份：`Node`、`SuperNode`。
- 节点购买成功时铸造节点 NFT。
- 超级节点升级时：
  - 方案 A：销毁 Node NFT，铸造 SuperNode NFT
  - 方案 B：保留旧 NFT 并铸造新 NFT

#### 建议
- 测试网先走**方案 A**，状态最清晰。

#### 验收点
- 节点购买后钱包可看到身份 NFT。
- OTC 市场能正确读取并交易该 NFT。

---

### 建议新增 [contracts/MockUSDT.sol](contracts/MockUSDT.sol)

#### 最小能力
- 6 位小数。
- 管理员可给测试地址铸币。
- 用于本地与 Sepolia 演示环境。

#### 验收点
- 本地测试无需依赖真实 USDT 地址。

---

## 2.2 部署与脚本

### [scripts/deploy.ts](scripts/deploy.ts)

#### 必改项
- 支持按顺序部署：
  1. MockUSDT（可选）
  2. IdentityNFT
  3. IncubatorCore
  4. NodeOTCMarket
- 支持部署后做初始化：
  - 池子地址
  - 分账比例
  - OTC 手续费接收地址
  - Core 与 IdentityNFT 权限绑定
- 部署结果输出为结构化文本，便于抄到环境变量

#### 验收点
- 一次脚本执行后，前端所需地址可以完整拿到。

---

## 2.3 前端

### [src/lib/coreContract.ts](src/lib/coreContract.ts)

#### 必改项
- 增加读方法：
  - `machineUnitPrice()`
  - `nodePrice()`
  - `superNodePrice()`
  - `roles(address)`
  - `getUserMachineOrders(address)`
  - `getMachineOrder(orderId)`
- 增加写方法：
  - `buyNode()`
  - `buySuperNode()`

#### 验收点
- 前端不再靠写死文案显示关键链上数据。

---

### 建议新增 [src/lib/otcContract.ts](src/lib/otcContract.ts)

#### 必改项
- 封装：
  - 创建挂单
  - 撤单
  - 成交
  - 查询挂单
  - 查询活跃订单
  - 查询上次成交价

---

### 建议新增 [src/lib/usdtContract.ts](src/lib/usdtContract.ts)

#### 必改项
- 封装 `allowance()`
- 封装 `approve()`
- 供矿机购买、节点购买、超级节点购买、OTC 成交统一复用

---

### [src/App.tsx](src/App.tsx)

#### 必改项
- 从单页演示改成最小业务分区：
  - 首页 / 概览
  - 矿机
  - 节点
  - OTC
  - 我的
- 增加授权状态展示。
- 增加角色状态展示。
- 增加最近订单展示。
- 增加风险确认弹窗。

#### 测试网 V1 可接受的简化
- 可以先不用完整路由。
- 允许用标签页切换。
- 允许先不做复杂图表。

#### 验收点
- 用户不需要看源码，就能在页面上完成 4 条核心流程。

---

### [src/config.ts](src/config.ts)

#### 必改项
- 增加：
  - `VITE_USDT_CONTRACT_ADDRESS`
  - `VITE_OTC_CONTRACT_ADDRESS`
  - `VITE_IDENTITY_NFT_ADDRESS`
- 必要时增加 `VITE_CHAIN_ID`

---

## 2.4 测试

### 建议新增目录 [test/](test)

#### 建议文件
- `IncubatorCore.test.ts`
- `NodeOTCMarket.test.ts`
- `IdentityNFT.test.ts`
- `TestnetFlow.test.ts`

#### 最低覆盖场景
- 矿机购买成功
- 矿机分账正确
- 节点限购 1 个
- 超级节点升级路径正确
- OTC 创建/撤单/成交成功
- OTC 价格下限约束
- 暂停后购买失败

---

## 3. 直接开工顺序

建议按以下顺序实现，避免返工：

### 第一步：合约骨架补齐
1. `MockUSDT.sol`
2. `IdentityNFT.sol`
3. `IncubatorCore.sol` 分账与暂停
4. `NodeOTCMarket.sol` 查询与唯一挂单约束

### 第二步：部署与联调
1. 改 `scripts/deploy.ts`
2. 补环境变量
3. 本地部署跑通

### 第三步：前端最小闭环
1. `usdtContract.ts`
2. `coreContract.ts`
3. `otcContract.ts`
4. `App.tsx` 标签页改造

### 第四步：自动化测试
1. 合约单测
2. 最小联调测试
3. 验收清单签字

---

## 4. 测试网上线验收单

## 4.1 部署前
- [ ] 合约可编译通过
- [ ] 所有环境变量已准备
- [ ] 池子地址已确认
- [ ] 测试钱包已准备足量 ETH 与 USDT

## 4.2 链上验收
- [ ] 可购买矿机
- [ ] 可查询矿机订单
- [ ] 分账事件正确
- [ ] 可购买节点
- [ ] 可升级超级节点
- [ ] 身份 NFT 正确铸造/升级
- [ ] 可创建 OTC 挂单
- [ ] 可撤单
- [ ] 可成交
- [ ] OTC 手续费正确收取

## 4.3 前端验收
- [ ] 钱包连接正常
- [ ] Sepolia 校验正常
- [ ] 授权流正常
- [ ] 风险确认弹窗正常
- [ ] 节点/超级节点状态正常显示
- [ ] 订单列表可查询
- [ ] OTC 列表可查询
- [ ] Appwrite 异常不影响主业务

## 4.4 失败场景验收
- [ ] 授权不足时报错清晰
- [ ] 余额不足时报错清晰
- [ ] 错误网络时报错清晰
- [ ] 暂停状态时报错清晰
- [ ] OTC 价格违规时报错清晰

---

## 5. 交付标准

满足以下 6 项，视为可对外开放 Sepolia 联调：

1. 四条主流程可跑通。
2. 订单、身份、OTC 都可链上验证。
3. 前端不依赖 Appwrite 承载业务账本。
4. 至少一轮自动化测试通过。
5. 已有部署记录与环境变量清单。
6. 已有失败场景回归记录。

---

## 6. 下一步建议

如果继续往下做，建议直接进入代码改造阶段，优先顺序：

1. 先补 `MockUSDT + IdentityNFT + Core 分账`
2. 再补 `OTC 查询与资产唯一挂单`
3. 最后补前端最小闭环

这样能最快把项目推进到“可真正上 Sepolia 验证”的状态。