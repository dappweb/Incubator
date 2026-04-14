# 用户注册绑定推荐人购买矿机的业务逻辑

**文档日期**: 2026-04-05  
**版本**: 1.0  

---

## 一、整体业务流程架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      【用户生命周期】                              │
└─────────────────────────────────────────────────────────────────┘

     ┌────────────┐       ┌────────────┐       ┌────────────┐
     │  第1步     │       │  第2步     │       │  第3步     │
     │ 连接钱包   │──────▶│ 绑定推荐人  │──────▶│  购买矿机   │
     │            │       │            │       │            │
     └────────────┘       └────────────┘       └────────────┘
     状态：未连接        状态：未绑定          状态：已购买
     必需：MetaMask      必需：推荐人地址       必需：USDT授权

                    ┌─────────────────────────┐
                    │    后续操作分支          │
                    └─────────────────────────┘
                    ▼                         ▼
              ┌───────────────┐         ┌──────────────┐
              │  购买更多矿机  │         │  升级身份     │
              │ (可重复多次)  │         │              │
              └───────────────┘         └──────────────┘
                                        ├─→ 购买节点
                                        └─→ 购买超级节点
```

---

## 二、详细流程说明

### 2.1 第1步：连接钱包（用户初始化）

#### 前置条件
- 用户本地安装了 MetaMask 或兼容的 EIP-1193 钱包
- 用户网络已切换到 **CNC Mainnet 测试网**（自动检查或手动切换）
- 钱包中有足够的 USDT（用于后续购买）

#### 关键代码实现
**前端** - [src/App.tsx](src/App.tsx#L487-L505)
```typescript
// 自动触发首次连接引导
if (isWalletConnected && !firstConnectGuideDone) {
  setFirstConnectGuideDone(true);
  setActiveTab("overview");
}
```

**钱包检查** - [src/lib/wallet.ts](src/lib/wallet.ts)
```typescript
export async function isOnCncMainnet(): Promise<boolean> {
  if (!window.ethereum) return false;
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  return chainId === "0xc61c"; // CNC Mainnet chain ID
}
```

#### 发生的事件
1. 用户点击 RainbowKit 的 `ConnectButton` 组件
2. 钱包弹窗请求用户授权
3. 成功后获取：
   - 用户地址（钱包地址）
   - NetworkProvider（用于后续链上交互）
4. 系统自动验证网络是否为 CNC Mainnet；若不是，提示切换

#### 数据流
```
用户钱包
    ↓ (MetaMask)
连接许可请求
    ↓ (EIP-1193)
前端获得: { address, provider }
    ↓
App.tsx 初始化推荐人来源（URL / 链上 / Owner / 手动）
    ↓
【状态已就绪，等待推荐人绑定】
```

---

### 2.2 第2步：绑定推荐人（Referrer Binding）

#### 业务规则

| 条件 | 规则 |
|------|------|
| **绑定次数** | **一次性**，不可修改或重新绑定 |
| **默认推荐人** | 合约 Owner 地址 |
| **推荐人来源** | 邀请链接 / 链上已绑定 / Owner / 手动输入 |
| **自邀请处理** | 若用户输入自己的地址，自动切换为合约 Owner |
| **相同用户检查** | 不允许推荐人 = 用户地址（防止自邀请）|

#### 推荐人优先级（按 [src/App.tsx](src/App.tsx) 当前实现确定）

1. **URL 邀请链接** (优先级最高)
   - 格式：`?referrer=0x...`
   - 来源标记：`source: "link"`

2. **链上已绑定**
   - 读取合约 `referralOf[userAddress]`
   - 若已绑定，直接使用历史记录
   - 来源标记：`source: "onchain"`

3. **合约 Owner**（默认）
   - 读取合约 `owner()`
   - 若以上均不存在，默认使用 Owner
   - 来源标记：`source: "owner"`

4. **手动输入**（最低优先级）
   - 用户在 UI 手动输入推荐人地址
   - 来源标记：`source: "manual"`

#### 前端实现流程

**推荐人验证** - [src/App.tsx](src/App.tsx#L1097-L1125)
```typescript
const onBindReferrer = async () => guardedAction(async () => {
  if (!provider || !userAddress) throw new Error("钱包未连接");
  
  // 1. 确定最终的推荐人地址
  let finalReferrer = referrer.address;
  if (!finalReferrer || !isAddress(finalReferrer)) {
    throw new Error("推荐人地址无效");
  }

  // 2. 调用链上 bindReferrer 函数
  await bindReferrer(provider, finalReferrer);
  
  setStatus("推荐人绑定成功。");
  
  // 3. 刷新推荐人状态
  await refreshReferrer();
});
```

#### 智能合约逻辑 - [IncubatorCore.sol L212-216](contracts/IncubatorCore.sol#L212-L216)

```solidity
function bindReferrer(address referrer) external whenNotPaused {
    require(referralOf[msg.sender] == address(0), "already bound");
    require(_isValidReferrer(msg.sender, referrer), "invalid referrer");
    _bindReferrer(msg.sender, referrer);
}
```

#### 链上存储结构

在 **IncubatorCore** 合约中：

```solidity
mapping(address => address) public referralOf;  // user -> referrer
mapping(address => uint256) public directReferralCount;
mapping(address => uint256) public teamTotalMemberCount;
mapping(address => uint256) public directReferralVolume;
mapping(address => uint256) public teamTotalVolume;
```

绑定后效果：
- `referralOf[userAddress]` 永久记录为推荐人地址
- 推荐人的 `directReferralCount` 自动 +1
- 推荐人的 `teamTotalMemberCount` 自动 +1

#### UI 状态表示

```
未绑定状态：
┌─────────────────────────────┐
│  绑定推荐人                  │
├─────────────────────────────┤
│  推荐人地址: [输入框]         │
│  来源: 默认 (合约 Owner)      │
│                              │
│  [绑定推荐人] (蓝色按钮)      │
└─────────────────────────────┘

已绑定状态：
┌─────────────────────────────┐
│  ✓ 已绑定推荐人              │
├─────────────────────────────┤
│  推荐人: 0x1234...5678       │
│  来源: 链上已绑定             │
│  状态: 【已固定，无法修改】   │
└─────────────────────────────┘
```

---

### 2.3 第3步：购买矿机（Machine Purchase）

#### 业务规则

| 条件 | 规则 |
|------|------|
| **前置条件** | 必须已绑定推荐人 |
| **购买数量** | 1-10 台，单笔订单最多购买 10 台 |
| **重复购买** | 支持多次购买，可累积订单 |
| **单价** | 默认 100 USDT/台，合约 Owner 可调整 |
| **支付方式** | USDT 转账 |
| **手续费分配** | 自动分配到 6 个资金池 |

#### 矿机订单结构

在区块链上记录的数据 - [IncubatorCore.sol L32-37](contracts/IncubatorCore.sol#L32-37)：

```solidity
struct MachineOrder {
    uint256 id;              // 订单唯一ID，自增
    address user;            // 购买者钱包地址
    uint256 quantity;        // 购买的矿机数量 (1-10)
    uint256 amountUSDT;      // 订单总金额 = qty × unitPrice
    address referrer;        // 推荐人地址（确定奖励分配）
    uint256 createdAt;       // 交易时间戳
}

event MachinePurchased(
    address indexed user,
    uint256 indexed orderId,
    uint256 quantity,
    uint256 amountUSDT,
    address indexed referrer
);
```

#### 前端购买流程

**购买界面** - [src/App.tsx](src/App.tsx#L1500-L1600)
```typescript
// 1. 用户输入购买数量
const [machineQty, setMachineQty] = useState(1);

// 2. 计算订单金额
const orderTotal = useMemo(() => {
  return toSafeBigInt(machineUnitPrice * BigInt(machineQty));
}, [machineUnitPrice, machineQty]);

// 3. 检查 USDT 余额和授权
const usdtBalance = await getUsdtBalance(provider, userAddress);
const usdtAllowance = await getUsdtAllowance(provider, userAddress, CORE_CONTRACT_ADDRESS);

if (usdtBalance < orderTotal) {
  setStatus("USDT 余额不足");
  return;
}

if (usdtAllowance < orderTotal) {
  // 自动授权
  await approveUsdt(provider, CORE_CONTRACT_ADDRESS, orderTotal);
}

// 4. 提交购买交易
const result = await purchaseMachine(provider, machineQty);
```

**执行函数** - [src/lib/coreContract.ts#L177-183](src/lib/coreContract.ts#L177-183)
```typescript
export async function purchaseMachine(
  provider: BrowserProvider,
  quantity: number,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.purchaseMachine(quantity);
  return tx.wait();
}
```

#### 链上交易执行流程

**Smart Contract 核心逻辑** - [IncubatorCore.sol L187-238](contracts/IncubatorCore.sol#L187-238)

```solidity
function purchaseMachine(uint256 quantity) external whenNotPaused {
    // 1. 参数验证
    require(quantity > 0 && quantity <= MAX_MACHINE_PER_ORDER, "invalid qty");
    require(referralOf[msg.sender] != address(0), "bind referrer first");

    // 2. 计算订单金额
    uint256 amountUSDT = machineUnitPrice * quantity;
    
    // 3. 转账 USDT
    usdt.safeTransferFrom(msg.sender, address(this), amountUSDT);

    // 4. 创建订单记录
    uint256 orderId = nextMachineOrderId;
    address currentReferrer = referralOf[msg.sender];
    
    machineOrders[orderId] = MachineOrder({
        id: orderId,
        user: msg.sender,
        quantity: quantity,
        amountUSDT: amountUSDT,
        referrer: currentReferrer,
        createdAt: block.timestamp
    });
    
    // 5. 更新用户订单列表
    userOrderIds[msg.sender].push(orderId);
    nextMachineOrderId = orderId + 1;

    // 6. 更新用户矿机算力
    uint256 newPower = personalPower[msg.sender] + quantity;
    personalPower[msg.sender] = newPower;

    // 7. 更新推荐人业绩
    directReferralVolume[currentReferrer] += amountUSDT;
    _updateTeamVolume(currentReferrer, amountUSDT);

    // 8. 注册参与者
    _registerParticipant(msg.sender);

    // 9. 更新排行榜
    _updateLeaderboard(currentDay(), msg.sender, amountUSDT);

    // 10. 分配资金到各个资金池
    _allocateMachineOrder(orderId, amountUSDT, currentReferrer);

    // 11. 发送事件
    emit MachinePurchased(msg.sender, orderId, quantity, amountUSDT, currentReferrer);
}
```

#### 资金池分配机制

订单金额按比例分配到 6 个资金池 - [IncubatorCore.sol L638-658](contracts/IncubatorCore.sol#L638-658)

```
订单金额: amountUSDT
    │
    ├─▶ 流动性池 (Liquidity): 60%
    │   用途: 维持生态流动性和交易对
    │
    ├─▶ 推荐奖励池 (Referral): 5%
    │   用途: 推荐人奖励
    │
    ├─▶ 超级节点池 (SuperNode): 5%
    │   用途: 超级节点持有人奖励
    │
    ├─▶ 节点池 (Node): 8%
    │   用途: 节点持有人奖励
    │
    ├─▶ 平台池 (Platform): 20%
    │   用途: 平台运营和开发
    │
    └─▶ 排行榜池 (Leaderboard): 2%
        用途: 日排行榜前 10 名奖励
```

#### 订单关键信息

| 字段 | 说明 | 例示 |
|------|------|------|
| **orderId** | 订单唯一 ID，自增 | `1, 2, 3, ...` |
| **user** | 购买者地址 | `0x1234...` |
| **quantity** | 矿机数量 | `5` (最多 10) |
| **amountUSDT** | 总支付 | `500` (100 × 5) |
| **referrer** | 推荐人地址 | `0xabcd...` |
| **createdAt** | 交易时间戳 | `1712335200` |

#### 后置效果

订单成功提交后：

1. **用户侧**
   - 个人矿机数量 +5
   - 个人算力 (personalPower) +5
   - 订单历史记录存链

2. **推荐人侧**
   - 直推业绩 (directReferralVolume) +500 USDT
   - 团队业绩 (teamTotalVolume) +500 USDT
   - 可获得 referral pool 中的奖励

3. **平台侧**
   - 500 USDT 被分配到 6 个资金池
   - 日排行榜数据更新
   - 事件 `MachinePurchased` 被发出

---

## 三、核心数据结构与存储

### 3.1 用户身份映射

```
address (钱包地址) 
    ↓ (1:1 映射)
IdentityAccount {
    id: uint256,           // 身份 ID（Node/SuperNode 时创建）
    owner: address,        // 身份所有人
    role: Role,            // 无 / 节点 / 超级节点
    updatedAt: uint256     // 最后更新时间
}
```

**三种身份状态**

```
Role.None (0)
    │
    └─▶ 购买节点 ─▶ Role.Node (1)
                      │
                      └─▶ 购买超级节点 ─▶ Role.SuperNode (2)

    或

Role.None (0) ─▶ 直接购买超级节点 ─▶ Role.SuperNode (2)
```

### 3.2 推荐关系图

```
Contract Owner (根推荐人)
    │
    ├─▶ User A (直推 1 级)
    │   ├─▶ User A1 (直推 2 级)
    │   ├─▶ User A2 (直推 2 级)
    │   └─▶ User A3 (直推 2 级)
    │
    ├─▶ User B (直推 1 级)
    │   └─▶ User B1 (直推 2 级)
    │
    └─▶ User C (直推 1 级)

User A 的视角：
├─ 直推人数: 3 (A1, A2, A3)
├─ 团队人数: 3 (包括直推)
├─ 直推业绩: A1订单 + A2订单 + A3订单
└─ 团队业绩: 同上
```

### 3.3 订单数据流

```
┌──────────────────────────────────────────────────┐
│        User submits purchaseMachine(qty=5)       │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│   Smart Contract validates & transfers USDT      │
│   - Check qty in range [1, 10]                   │
│   - Check referrer bound                         │
│   - Transfer amountUSDT from user -> contract    │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│   Create MachineOrder & emit event               │
│   - machineOrders[orderId] = { ... }             │
│   - userOrderIds[user].push(orderId)             │
│   - emit MachinePurchased(...)                   │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│   Update user & referrer stats                   │
│   - personalPower[user] += qty                   │
│   - directReferralVolume[referrer] += amount     │
│   - teamTotalVolume[referrer] += amount          │
└──────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│   Allocate funds to 6 pools & settle rewards     │
│   - Pool[0] += amount * 60%                      │
│   - Pool[1] += amount * 5%                       │
│   - ... (emit RewardSettled for each pool)       │
└──────────────────────────────────────────────────┘
```

---

## 四、关键函数映射

### 智能合约函数

| 函数名 | 文件 | 行号 | 描述 |
|--------|------|------|------|
| `bindReferrer(address)` | IncubatorCore.sol | 212-216 | 绑定推荐人 |
| `purchaseMachine(uint256)` | IncubatorCore.sol | 187-238 | 购买矿机 |
| `buyNode()` | IncubatorCore.sol | 218-239 | 购买节点 |
| `buySuperNode()` | IncubatorCore.sol | 241-272 | 购买超级节点 |
| `referralOf(address)` | IncubatorCore.sol | 线性查询 | 查询推荐人 |
| `getMachineOrder(uint256)` | IncubatorCore.sol | 319-320 | 查询订单 |
| `getUserMachineOrders(address)` | IncubatorCore.sol | 322-323 | 用户订单列表 |

### 前端函数

| 函数名 | 文件 | 用途 |
|--------|------|------|
| `bindReferrer(provider, referrer)` | src/lib/coreContract.ts | 调用链上绑定 |
| `purchaseMachine(provider, qty)` | src/lib/coreContract.ts | 调用链上购买 |
| `getReferrer(provider, user)` | src/lib/coreContract.ts | 查询链上推荐人 |
| `ensureReferrerReady()` | src/App.tsx | 购买前推荐人校验与必要绑定 |
| `approveUsdt()` | src/lib/usdtContract.ts | USDT 授权 |
| `getUsdtBalance()` | src/lib/usdtContract.ts | 查询 USDT 余额 |
| `getUsdtAllowance()` | src/lib/usdtContract.ts | 查询授权额度 |

---

## 五、异常场景处理

### 常见错误与解决方案

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| "bind referrer first" | 未绑定推荐人 | 先执行 `bindReferrer()` |
| "invalid qty" | 购买数量不在 1-10 范围 | 调整数量范围 |
| "already bound" | 已绑定过推荐人 | 无法修改，使用现有推荐人 |
| "insufficient balance" | USDT 余额不足 | 充值更多 USDT |
| "insufficient allowance" | USDT 授权不足 | 调用 `approveUsdt()` |
| "wrong network" | 网络不是 CNC Mainnet | 切换到 CNC Mainnet 测试网 |
| "wallet not connected" | 未连接钱包 | 连接 MetaMask 钱包 |

### 事务失败重试策略

```
1. 检查网络连接
   └─▶ 是否为 CNC Mainnet? 否 → 切换网络

2. 检查钱包
   └─▶ MetaMask 是否聚焦? 否 → 打开 MetaMask

3. 检查授权
   └─▶ USDT 授权足够? 否 → 重新授权

4. 检查前置条件
   └─▶ 推荐人是否已绑定? 否 → 绑定推荐人

5. 重试交易
   └─▶ 使用相同参数重新提交
```

---

## 六、用户交互流程图

```
╔═══════════════════════════════════════════════════════════════╗
║                      【完整用户流程】                            ║
╚═══════════════════════════════════════════════════════════════╝

开始
  │
  ▼
┌─────────────────────────┐
│ 【第一次访问应用】      │
│                         │
│ 1. 检查钱包连接        │
│    钱包已连接? ─────┐
│                     │ 否
│                     ▼
│              点击连接钱包
│              ▲   │
│              └───┘
│
│    是 ▼
│ 2. 检查网络
│    CNC Mainnet? ─────┐
│                  │ 否
│                  ▼
│            切换到 CNC Mainnet
│            │
│            ▼
│ 3. 显示首次连接引导
└─────────────────────────┘
              │
              ▼
┌─────────────────────────┐
│ 【绑定推荐人】          │
│                         │
│ 1. 读取推荐人来源       │
│    (URL / 链上 / Owner) │
│                         │
│ 2. 用户确认推荐人地址   │
│                         │
│ 3. 点击【绑定推荐人】   │
│    │                    │
│    ├─▶ 签名交易         │
│    │   │                │
│    │   ▼                │
│    │  交易确认          │
│    │   │                │
│    │   ▼                │
│    └─ 绑定成功 ✓        │
│       更新 UI           │
└─────────────────────────┘
              │
              ▼
┌─────────────────────────┐
│ 【购买矿机】            │
│                         │
│ 1. 输入购买数量(1-10)   │
│                         │
│ 2. 计算订单总额         │
│    数量 × 单价          │
│                         │
│ 3. 检查 USDT 余额       │
│    余额足够? ──┐        │
│              │ 否      │
│              ▼         │
│           充值 USDT     │
│              │         │
│              ▼         │
│    是 ▼                 │
│ 4. 检查 USDT 授权       │
│    授权足够? ──┐        │
│              │ 否      │
│              ▼         │
│          授权 USDT      │
│              │         │
│              ▼         │
│    是 ▼                 │
│ 5. 点击【确认购买】     │
│    │                    │
│    ├─▶ 签名交易         │
│    │   │                │
│    │   ▼                │
│    │  交易确认          │
│    │   │                │
│    │   ▼                │
│    └─ 购买成功 ✓        │
│       订单记录          │
│       更新矿机数        │
└─────────────────────────┘
              │
              ▼
        ┌─────────────┐
        │ 后续操作    │
        │             │
        ├─▶ 购买更多  │
        │   矿机      │
        │ ├─▶ repeat  │
        │             │
        ├─▶ 升级身份  │
        │   (Node)    │
        │ ├─▶ buyNode │
        │             │
        ├─▶ 升级身份  │
        │   (SuperNode)
        │ ├─▶ buySuper
        │             │
        └─▶ 查看团队  │
            和收益     │
```

---

## 七、数据查询接口

### 查询用户订单

```typescript
// 获取用户的所有矿机订单 ID
const orderIds = await getUserMachineOrderIds(provider, userAddress);

// 获取单个订单详情
for (const orderId of orderIds) {
  const order = await getMachineOrder(provider, orderId);
  console.log(order);
  // {
  //   id: 1n,
  //   user: '0x1234...',
  //   quantity: 5n,
  //   amountUSDT: 500000000n,  // 500 USDT (6 decimals)
  //   referrer: '0xabcd...',
  //   createdAt: 1712335200n
  // }
}
```

### 查询团队数据

```typescript
// 获取用户团队统计
const teamStats = await getTeamStats(provider, userAddress);
// {
//   directCount: 5n,          // 直推人数
//   teamCount: 15n,           // 团队总人数
//   directVolume: 5000000000n,// 直推业绩 (5000 USDT)
//   teamVolume: 15000000000n  // 团队业绩 (15000 USDT)
// }
```

### 查询推荐关系

```typescript
// 查询用户的推荐人
const referrerAddr = await getReferrer(provider, userAddress);
console.log(referrerAddr);  // '0xabcd...'

// 查询用户的身份 ID
const identityId = await getUserIdentityId(provider, userAddress);
console.log(identityId);  // 123n (Node/SuperNode) or 0n (None)

// 查询用户的身份等级
const role = await getUserRole(provider, userAddress);
console.log(role);  // 0=None, 1=Node, 2=SuperNode
```

---

## 八、价格与参数配置

### 默认价格表

| 项目 | 价格 | 单位 | 说明 |
|------|------|------|------|
| 矿机单价 | 100 | USDT | 可由 Owner 调整，最高 10,000 USDT |
| 节点价格 | 1,000 | USDT | 可由 Owner 调整，最高 100,000 USDT |
| 超级节点价格 | 3,000 | USDT | 可由 Owner 调整，最高 300,000 USDT |

### 资金池分配表

| 池名 | 比例 | 用途 |
|------|------|------|
| Liquidity | 60% | 流动性维持 |
| Referral | 5% | 推荐人奖励 |
| SuperNode | 5% | 超级节点奖励 |
| Node | 8% | 节点奖励 |
| Platform | 20% | 平台运营 |
| Leaderboard | 2% | 排行榜奖励 |

### 排行榜奖励分配

```
排行榜分配规则（Leaderboard）：
前 10 名按排名分配奖励

第 1 名: 40%
第 2 名: 20%
第 3-9 名: 各 5%
第 10 名: 5%
```

---

## 九、安全注意事项

### 安全检查清单

- [x] 推荐人绑定一次性，防止修改诈骗
- [x] 购买金额明确显示，防止误操作
- [x] 授权额度限制，防止过度授权
- [x] 网络验证，防止切换错误网络
- [x] 签名要求，防止自动转账

### 用户需要注意

1. **推荐人地址确认**
   - 绑定前多次确认推荐人地址
   - 绑定后不可修改
   - 建议从邀请链接获取推荐人

2. **矿机购买前**
   - 确认钱包所有权
   - 确认 USDT 余额充足
   - 确认网络为 CNC Mainnet

3. **授权管理**
   - 仅在必要时授权
   - 授权额度适度不过量
   - 定期检查已授权的合约

---

## 十、常见问题解答

### Q1: 为什么必须绑定推荐人？

**A:** 推荐人是生态激励分配的基础，系统通过推荐人关系确定各级奖励分配。每个新用户必须指定一个推荐人（至少是生态的始点 Owner），才能进入激励系统。

### Q2: 绑定错误的推荐人怎么办？

**A:** 绑定是一次性的、永久的，无法修改。因此在绑定前要多次确认推荐人地址。建议尽量从邀请链接获取，避免手动输入导致地址错误。

### Q3: 一个钱包可以购买多少台矿机？

**A:** 单笔订单限制 1-10 台，但用户可以多次下单，理论上无上限。系统会逐笔记录所有订单。

### Q4: 矿机与节点的区别是什么？

**A:** 
- **矿机**：轻量级参与，1-10 台灵活购买，用于快速建立仓位
- **节点**：身份升级，一次性购买，获得更高权益和奖励
- **超级节点**：最高身份，可从"无"或"节点"升级

### Q5: 购买矿机后能做什么？

**A:** 
- 继续购买更多矿机
- 升级身份为节点
- 进一步升级为超级节点
- 在 OTC 市场交易节点/超级节点身份
- 参与排行榜竞争和奖励分配

---

## 附录：测试用例

### 测试场景 1：新用户完整流程

```
Step 1: 连接钱包
  ✓ MetaMask 已安装
  ✓ 切换到 CNC Mainnet
  ✓ 钱包余额 >= 500 USDT
  
Step 2: 绑定推荐人
  ✓ 推荐人地址有效
  ✓ 绑定成功
  ✓ 链上记录保存
  
Step 3: 购买矿机
  ✓ 输入数量 5
  ✓ 订单金额 = 500 USDT
  ✓ USDT 授权完成
  ✓ 购买成功
  
结果: 用户拥有 5 台矿机，推荐人获得业绩 500 USDT
```

### 测试场景 2：推荐人链对账

```
Owner (根推荐人)
  │
  ├─ User A (5 × 100 = 500 USDT)
  │   directCount = 1,  directVolume = 500
  │
  ├─ User B (3 × 100 = 300 USDT)
  │   directCount = 1,  directVolume = 300
  │
  └─ User C (推荐人为 A）
      directReferrer = A,  amountUSDT = 200

Owner 的统计:
  directCount = 2 (A, B)
  directVolume = 800 (500 + 300)
  teamCount = 3 (A, B, C)
  teamVolume = 1000 (500 + 300 + 200)

User A 的统计:
  directCount = 1 (C)
  directVolume = 200
  teamVolume = 200
```

---

## 版本历史

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| 1.0 | 2026-04-05 | System | 初始版本，完整文档化用户注册、推荐人绑定、矿机购买流程 |

---

**文档完成时间**: 2026-04-05 15:30 (UTC+8)
