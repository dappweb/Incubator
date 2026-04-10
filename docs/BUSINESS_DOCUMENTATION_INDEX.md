# 用户矿机购买业务逻辑 - 完整文档指南

**编制日期**: 2026-04-05  
**文档版本**: 1.0  

---

## 📋 文档总览

本库包含了**用户注册、推荐人绑定、购买矿机**的完整业务逻辑文档，分为三个互补层次：

### 📄 三份核心文档

| 文档 | 路径 | 适合读者 | 内容 |
|------|------|--------|------|
| **业务逻辑完整版** | [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) | 产品经理、业务分析师、项目管理人员 | 完整的业务规则、流程说明、数据结构、常见问题 |
| **流程可视化补充** | [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) | 所有人 (可视化理解) | 状态机、时序图、资金流、交互流、决策树等可视化 |
| **技术实现参考** | [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) | 开发工程师、架构师 | 合约 ABI、前端 API、配置参数、代码示例、错误处理 |

---

## 🎯 快速导航

### 我是产品经理/业务人员，想了解整体流程 ➡️
**阅读顺序**:
1. 先看 [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) 中的概览图
2. 再读 [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) 的 **一、二、三** 章节
3. 查看 [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) 的 **十、常见问题**

**关键术语速记**:
- **推荐人绑定**: 一次性、永久、基于生态激励的邀请关系
- **矿机购买**: 1-10 台灵活购买，支持多次下单，用于快速参与
- **资金池**: 6 个分配池 (流动性 60% + 推荐 5% + 超级节点 5% + 节点 8% + 平台 20% + 排行榜 2%)

### 我是QA/测试人员，想验证功能流程 ➡️
**阅读顺序**:
1. [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) - **第 7 节**: 错误处理决策树
2. [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) - **第 五、六、七** 章节: 异常场景、用户流程、数据查询
3. [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) - **附录**: 测试用例

**关键测试点**:
- 推荐人绑定一次性不可改
- 未绑定推荐人不能购买
- 购买数量范围 1-10
- USDT 授权和余额检查
- 多笔订单的精确性

### 我是开发工程师，想实现相关功能 ➡️
**阅读顺序**:
1. [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) - **第 一、二** 章节: 合约 ABI、前端 API
2. [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) - **第 四、五** 章节: 配置参数、状态管理
3. [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) - **第 六、七、八** 章节: 集成、错误处理、事件监听
4. [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) - **第 2、3、4、5** 节: 合约交互时序、资金分配、推荐人选择、授权流程

**核心代码位置**:
```
src/
  ├─ App.tsx (主体逻辑，绑定和购买)
  ├─ lib/
  │   ├─ coreContract.ts (智能合约交互)
  │   ├─ usdtContract.ts (USDT 授权和转账)
  │   ├─ otcContract.ts (OTC 交易合约交互)
  │   ├─ swapContract.ts (Swap 池报价和执行)
  │   └─ wallet.ts (钱包连接和网络检查)
  └─ components/
      └─ Common.tsx (UI 组件库)

contracts/
  └─ IncubatorCore.sol (核心合约，包含所有业务逻辑)
```

### 我想快速查找特定问题 ➡️
**按关键词快速定位**:
- **"推荐人"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **2.2 节** + [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 4 节**
- **"授权"** → [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 5 节** + [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) **第 二节** (`approveUsdt`)
- **"订单"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **2.3 节** + [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) **第 二、三节**
- **"错误"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **第 五节** + [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 8 节** + [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) **第 七节**
- **"资金分配"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **2.3.5 节** + [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 3 节**
- **"团队数据"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **第 七节**
- **"测试"** → [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **附录**

---

## 🔑 核心业务规则一览

### 用户生命周期三步

```
第 1 步：连接钱包
├─ 需要: MetaMask 钱包
├─ 需要: 切换到 Sepolia 网络
└─ 结果: 获得 provider 和 userAddress

    ↓

第 2 步：绑定推荐人 ⭐ 关键
├─ 需要: 推荐人地址（4 个来源：URL → 链上 → Owner → 手动）
├─ 特点: 一次性绑定，永久不可修改
├─ 链上调用: bindReferrer(referrer_address)
└─ 结果: referralOf[user] 永久记录推荐人

    ↓

第 3 步：购买矿机
├─ 前置: 已绑定推荐人（重要！）
├─ 前置: USDT 余额充足
├─ 前置: USDT 授权完成
├─ 数量: 1-10 台（每笔订单）
├─ 价格: 100 USDT/台（可由 Owner 调整）
├─ 链上调用: purchaseMachine(quantity)
└─ 结果: 订单创建，资金分配到 6 个池
```

### 推荐人来源优先级（自动检测）

```
优先级 1: URL 参数         ← ?referrer=0x...
          (最可信)

优先级 2: 链上历史绑定      ← 用户之前绑定过
          (已确认)

优先级 3: 合约 Owner        ← 默认推荐人
          (生态起点)

优先级 4: 用户手动输入      ← 最后机会
          (易出错)
```

### 资金分配八八分原则

```
订单金额 = 数量 × 100 USDT

分配规则 (BPS basis points):
├─ 流动性池    60%  ─▶ 维持生态流动性
├─ 推荐奖励    5%   ─▶ 推荐人获得业绩
├─ 超级节点    5%   ─▶ 超级节点持有人奖励
├─ 节点        8%   ─▶ 节点持有人奖励
├─ 平台        20%  ─▶ 平台开发运营
└─ 排行榜      2%   ─▶ 日排行前 10 名

示例: 购买 5 台 = 500 USDT
├─ 流动性池: 300 USDT
├─ 推荐奖励: 25 USDT  ─ 推荐人直得
├─ 超级节点: 25 USDT
├─ 节点: 40 USDT
├─ 平台: 100 USDT
└─ 排行榜: 10 USDT
```

---

## 📊 三文档内容对标表

| 功能需求 | 业务逻辑版 | 可视化版 | 技术版 |
|---------|-----------|--------|-------|
| **了解推荐人机制** | ✅ 2.2 节详细 | ✅ 第 4 节流程 | ✅ 第二节 API |
| **理解资金分配** | ✅ 2.3.5 节表格 | ✅ 第 3 节图 | ✅ 四八节参数 |
| **实现购买流程** | ✅ 2.3 节逻辑 | ✅ 第 6 节序列图 | ✅ 二五八节代码 |
| **处理授权** | ✅ 附录常见问题 | ✅ 第 5 节决策树 | ✅ 二七节实现 |
| **查询订单数据** | ✅ 七节数据查询 | ✅ 第 6 节 DB 流 | ✅ 二三节 API |
| **测试验证** | ✅ 附录用例 | ✅ 第 8 节错误 | ✅ 七九十节 |

---

## 🎓 学习路径推荐

### 初级（入门理解）- 30 分钟
1. 阅读 [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 1 节**（状态机）
2. 阅读 [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md) **一、二、三** 节概览
3. 查看本文件的**核心业务规则一览**

### 中级（深入理解）- 2 小时
1. 完整阅读 [USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md](USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md)
2. 阅读 [BUSINESS_FLOW_VISUALIZATION.md](BUSINESS_FLOW_VISUALIZATION.md) **第 2-6 节**
3. 查看 [TECHNICAL_IMPLEMENTATION_REFERENCE.md](TECHNICAL_IMPLEMENTATION_REFERENCE.md) **第 一、二** 节

### 高级（实现掌握）- 4 小时
1. 完整学习所有三份文档
2. 查看代码实现：`src/App.tsx`, `src/lib/coreContract.ts`, `contracts/IncubatorCore.sol`
3. 做一遍 **附录测试用例**

---

## 🔍 关键概念速查表

| 概念 | 定义 | 关键属性 | 链上存储 |
|------|------|--------|--------|
| **推荐人** | 邀请用户进入生态的账户，基础为激励分配 | 一次性，永不修改，可为 Owner | `referralOf[user]` |
| **矿机订单** | 用户购买矿机创建的链上记录 | 包含数量、金额、推荐人 | `machineOrders[orderId]` |
| **身份** | 用户在生态中的等级 (None/Node/SuperNode) | 关系到奖励和交易权限 | `ownedIdentityId[user]` |
| **资金池** | 订单金额的分配目的地 (6 种) | 按百分比自动分配 | 各池接收地址 |
| **团队数据** | 用户作为推荐人的统计 | 直推数/人数/业绩 | `directRefCount`, `teamVolume` 等 |
| **排行榜** | 日排名竞争，按业绩排序 | 前 10 名获得额外奖励 | `leaderboards[dayId]` |

---

## ✅ 完整检查清单

### 文档完整性检查
- [x] 业务逻辑文档涵盖完整流程
- [x] 可视化补充包含多种图示
- [x] 技术参考提供代码示例
- [x] 三份文档互补，无重复

### 内容准确性检查
- [x] 推荐人规则 (一次性，不可修改)
- [x] 购买数量限制 (1-10)
- [x] 资金池分配 (6 池，共 100%)
- [x] 身份升级路径 (None → Node → SuperNode)
- [x] 链上存储位置准确

### 代码参考准确性检查
- [x] 合约 ABI 与实际部署一致
- [x] 前端函数调用示例有效
- [x] 环境变量配置完整
- [x] 数据类型定义准确

---

## 🚀 快速开始

### 对于产品人员
```
1. 读本文件的"核心业务规则一览"
2. 打开 BUSINESS_FLOW_VISUALIZATION.md 看图
3. 用 USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md 作参考手册
→ 可以清楚解释给任何人整个流程
```

### 对于开发人员
```
1. 从 TECHNICAL_IMPLEMENTATION_REFERENCE.md 第二节开始
2. 对照 src/lib/coreContract.ts 看实际代码
3. 用 BUSINESS_FLOW_VISUALIZATION.md 的时序图理解调用顺序
4. 在 IncubatorCore.sol 中验证合约逻辑
→ 可以独立实现或深化功能
```

### 对于测试人员
```
1. 从 BUSINESS_FLOW_VISUALIZATION.md 第8节错误处理开始
2. 用 USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md 附录的测试用例
3. 参考 TECHNICAL_IMPLEMENTATION_REFERENCE.md 的错误代码
4. 逐个验证所有场景
→ 能够系统地覆盖全部业务分支
```

---

## 📞 技术支持

遇到疑问时：
1. 先在对应文档中搜索关键词
2. 查看相关章节的"常见问题"
3. 参考代码示例部分
4. 查看错误处理决策树

---

## 📝 更新日志

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| 1.0 | 2026-04-05 | Dev Team | 初始版本发布，涵盖用户注册、推荐人绑定、矿机购买完整流程 |

---

## 文档归属

```
📂 docs/
  ├─ USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md (核心业务文档)
  ├─ BUSINESS_FLOW_VISUALIZATION.md (可视化补充)
  ├─ TECHNICAL_IMPLEMENTATION_REFERENCE.md (技术参考)
  ├─ BUSINESS_DOCUMENTATION_INDEX.md (本文 - 导航指南)
  ├─ CURRENT_IMPLEMENTATION_STATUS.md (实现状态快照)
  └─ ... (其他文档)
```

---

**最后更新**: 2026-04-05  
**维护职责**: Development Team  
**问题报告**: 请在项目 Issues 中提报

---

**感谢你的使用！祝工作顺利！** 🎉
