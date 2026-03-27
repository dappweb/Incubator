# Appwrite + Sepolia 实施蓝图（修订版）

## 1. 最终架构边界（按你的最新要求）

- Appwrite Database：只用于公告（Announcement）功能。
- 业务功能：全部链上实现与读取。
- 结论：订单、身份、奖励、OTC、池子余额、排行榜等都不入 Appwrite。

唯一可信业务数据源是 Sepolia 链上合约状态与事件。

---

## 2. 系统架构

1) 前端 DApp
- 钱包连接（MetaMask）
- 发起链上交易（购买矿机、升级节点/超级节点、OTC 挂单/成交等）
- 直接读取合约 view 与事件日志
- 只从 Appwrite 读取公告列表

2) 智能合约（Sepolia）
- Core：矿机、节点、超级节点、分账与规则
- Reward：奖励结算与领取（如适用）
- OTC：身份 NFT 交易、手续费、价格约束

3) Appwrite
- Database：公告集合（Announcement）
- Auth（可选）：后台运营账号登录
- Functions（可选）：公告定时发布、过期下线

---

## 3. Appwrite 数据库（仅公告）

建议 Database: dapp_content

### 集合：announcements

字段建议：
- announcementId (string, unique)
- title (string, required)
- summary (string, required)
- content (string, required)
- lang (enum: zh-CN, en-US)
- category (enum: system, campaign, maintenance, risk)
- status (enum: draft, published, archived)
- priority (integer, default 0)  // 数值越高越靠前
- startAt (datetime, nullable)    // 生效时间
- endAt (datetime, nullable)      // 失效时间
- pin (boolean, default false)    // 是否置顶
- tags (string[])                 // 标签
- coverUrl (string, nullable)
- createdBy (string)
- createdAt (datetime)
- updatedAt (datetime)

索引建议：
- status + startAt + endAt
- pin + priority + createdAt
- lang + category

---

## 4. 公告权限模型

- 前端公开只读：published 且在时间窗内的公告。
- 后台运营可写：draft/published/archived 管理。
- 普通钱包用户：不允许写入公告集合。

建议策略：
- 前台查询条件固定为：
  - status = published
  - (startAt 为空 或 startAt <= 当前时间)
  - (endAt 为空 或 endAt > 当前时间)
- 排序：pin desc, priority desc, createdAt desc

---

## 5. 链上数据读取策略（业务全链上）

前端页面数据来源统一如下：

- 资产与身份：合约 view（余额、角色、NFT 所有权）
- 订单与奖励明细：合约事件日志（按钱包地址过滤）
- 池子与分账：合约 view + 事件回放
- OTC 列表/成交：OTC 合约事件 + 当前挂单状态读取

说明：不在 Appwrite 缓存任何业务账本，避免中心化口径偏差。

---

## 6. 合约设计约束（为前端可读性服务）

建议所有关键动作发出标准化事件：
- MachinePurchased
- NodePurchased
- SuperNodePurchased
- RewardSettled
- OtcOrderCreated
- OtcOrderFilled
- OtcOrderCancelled

每个事件应包含：
- 用户地址
- 业务主键（orderId/rewardId/tokenId）
- 金额与代币类型
- 时间可推导信息（blockNumber）

这样前端可在不依赖数据库的前提下还原全量业务记录。

---

## 7. 前端实现建议（避免性能问题）

因为业务不落库，建议：
- 近期数据（如 7 天）实时从 RPC 拉取
- 历史数据采用分页按区块范围检索
- 对事件结果做本地缓存（浏览器 IndexedDB）
- 使用多 RPC 提高可用性

注意：本地缓存仅是加速层，不是业务真相层。

---

## 8. Sepolia 部署与环境变量

必要变量：
- SEPOLIA_RPC_URL
- SEPOLIA_RPC_FALLBACK_URL（可选）
- CHAIN_ID=11155111
- CORE_CONTRACT_ADDRESS
- REWARD_CONTRACT_ADDRESS
- OTC_CONTRACT_ADDRESS
- APPWRITE_ENDPOINT
- APPWRITE_PROJECT_ID
- APPWRITE_DB_ID=dapp_content
- APPWRITE_ANNOUNCEMENTS_COLLECTION_ID

---

## 9. 验收标准（修订）

- 公告：可发布、可定时生效、可置顶、可下线。
- 业务页面：在 Appwrite 不可用时，除公告模块外均可正常读取链上数据。
- 任意业务明细都可追溯到链上交易哈希或事件。
- 不存在把奖励、订单、身份写入 Appwrite 的代码路径。

---

## 10. 迁移说明（从旧设计到新设计）

如果你之前按旧方案准备了 Appwrite 业务集合：
- users、machine_orders、reward_ledger、otc_orders、otc_trades、pool_snapshots 等都可以废弃。
- 保留并新建 announcements 即可。

推荐做法：
- 后端索引服务可选（仅用于前端加速），但不写 Appwrite。
- 若未来需要分析报表，可另建离线数仓，不作为 DApp 业务依赖。

---

## 11. 下一步可直接执行

1) 我可以继续给你输出 Appwrite 公告集合初始化 JSON（字段+索引）。
2) 我可以给你一个前端数据层规范：哪些页面读 view，哪些页面读 event，统一 ABI 查询接口。
3) 我可以补一份链上事件命名与字段标准，方便合约和前端一次对齐。
