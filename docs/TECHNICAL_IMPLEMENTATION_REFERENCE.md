# 技术实现细节参考

**文档日期**: 2026-04-05

---

## 一、智能合约接口 (ABI)

### 核心函数签名

#### 推荐人相关

```solidity
// 绑定推荐人（一次性，不可修改）
function bindReferrer(address referrer) external whenNotPaused

// 查询用户的推荐人
function referralOf(address user) view returns (address)

// 查询合约所有者（默认推荐人）
function owner() view returns (address)
```

#### 矿机购买相关

```solidity
// 购买矿机
function purchaseMachine(uint256 quantity) external whenNotPaused

// 查询矿机单价
function machineUnitPrice() view returns (uint256)

// 查询单个矿机订单详情
function getMachineOrder(uint256 orderId)
  view returns (
    uint256 id,
    address user,
    uint256 quantity,
    uint256 amountUSDT,
    address referrer,
    uint256 createdAt
  )

// 查询用户的所有矿机订单 ID
function getUserMachineOrders(address user)
  view returns (uint256[] memory)
```

#### 身份相关

```solidity
// 查询用户的身份 ID
function getUserIdentityId(address user)
  view returns (uint256)

// 查询身份信息
function getIdentity(uint256 identityId)
  view returns (
    uint256 id,
    address owner,
    Role role,
    uint256 updatedAt
  )

// 查询用户角色 (0=None, 1=Node, 2=SuperNode)
function getUserRole(address user)
  view returns (uint8)

// 购买节点
function buyNode() external whenNotPaused

// 购买超级节点
function buySuperNode() external whenNotPaused
```

#### 团队统计相关

```solidity
// 当前实现使用 4 个只读 mapping
function directReferralCount(address user) view returns (uint256)
function teamTotalMemberCount(address user) view returns (uint256)
function directReferralVolume(address user) view returns (uint256)
function teamTotalVolume(address user) view returns (uint256)
```

#### 事件定义

```solidity
// 矿机购买事件
event MachinePurchased(
  address indexed user,
  uint256 indexed orderId,
  uint256 quantity,
  uint256 amountUSDT,
  address indexed referrer
)

// 推荐人绑定事件
event ReferralBound(
  address indexed user,
  address indexed referrer
)

// 资金池分配事件
event PoolAllocated(
  uint256 indexed orderId,
  uint8 indexed poolType,
  address indexed recipient,
  address token,
  uint256 amountUSDT
)

// 奖励结算事件
event RewardSettled(
  uint256 indexed orderId,
  uint8 indexed poolType,
  address indexed beneficiary,
  uint256 amountUSDT
)

// 节点购买事件
event NodePurchased(
  address indexed user,
  uint256 amountUSDT,
  uint256 indexed identityId
)

// 超级节点购买事件
event SuperNodePurchased(
  address indexed user,
  uint256 amountUSDT,
  uint256 indexed identityId
)
```

---

## 二、前端 API 实现

### 环境变量配置

**文件**: `.env.local` 或 `vite.config.ts`

```typescript
# 智能合约地址（CNC Mainnet）
VITE_CORE_CONTRACT_ADDRESS=0x...
VITE_OTC_CONTRACT_ADDRESS=0x...
VITE_SWAP_POOL_ADDRESS=0x...

# Token 地址（CNC Mainnet）
VITE_USDT_CONTRACT_ADDRESS=0x...
VITE_ICO_TOKEN_ADDRESS=0x...
VITE_LIGHT_TOKEN_ADDRESS=0x...
```

### 核心库函数

**文件**: `src/lib/coreContract.ts`

```typescript
// ============ 价格查询 ============

export async function getMachineUnitPrice(
  provider: BrowserProvider,
): Promise<bigint>;

export async function getNodePrice(provider: BrowserProvider): Promise<bigint>;

export async function getSuperNodePrice(
  provider: BrowserProvider,
): Promise<bigint>;

// ============ 推荐人查询 ============

export async function getReferrer(
  provider: BrowserProvider,
  user: string,
): Promise<string>;

export async function getContractOwner(
  provider: BrowserProvider,
): Promise<string>;

// ============ 订单查询 ============

export async function getMachineOrder(
  provider: BrowserProvider,
  orderId: bigint,
): Promise<MachineOrder>;

export async function getUserMachineOrderIds(
  provider: BrowserProvider,
  user: string,
): Promise<bigint[]>;

export async function getUserIdentityId(
  provider: BrowserProvider,
  user: string,
): Promise<bigint>;

export async function getIdentity(
  provider: BrowserProvider,
  identityId: bigint,
): Promise<IdentityAccount>;

// ============ 用户角色 ============

export async function getUserRole(
  provider: BrowserProvider,
  user: string,
): Promise<number>; // 0=None, 1=Node, 2=SuperNode

// ============ 团队统计 ============

export async function getTeamStats(
  provider: BrowserProvider,
  user: string,
): Promise<TeamStats>;

// ============ 执行交易 ============

export async function bindReferrer(provider: BrowserProvider, referrer: string);

export async function purchaseMachine(
  provider: BrowserProvider,
  quantity: number,
);

export async function buyNode(provider: BrowserProvider);

export async function buySuperNode(provider: BrowserProvider);

// ============ 奖励查询 ============

export async function getRewardRecordsByBeneficiary(
  provider: BrowserProvider,
  beneficiary: string,
  maxRecords?: number,
  lookbackBlocks?: number,
): Promise<RewardRecord[]>;
```

### USDT 授权库

**文件**: `src/lib/usdtContract.ts`

```typescript
// ============ 余额和授权 ============

export async function getUsdtBalance(
  provider: BrowserProvider,
  user: string,
): Promise<bigint>;

export async function getUsdtAllowance(
  provider: BrowserProvider,
  user: string,
  spender: string, // 通常是 CORE_CONTRACT_ADDRESS
): Promise<bigint>;

export async function getUsdtDecimals(
  provider: BrowserProvider,
): Promise<number>; // 返回 6 (USDT 有 6 位小数)

// ============ 授权操作 ============

export async function approveUsdt(
  provider: BrowserProvider,
  spender: string,
  amount: bigint,
  allowUnlimited: boolean = false,
): Promise<TransactionResponse>;

// ============ 助手函数 ============

export function parseUsdt(value: number | string): bigint;
// 1 USDT = 1000000 (1e6)

export function formatUsdt(value: bigint): string;
// 1000000 (1e6) = "1"
```

### 推荐人管理实现

**文件**: `src/App.tsx`

```typescript
// 当前版本已将推荐人状态与优先级策略整合在 App.tsx
// 优先级：URL 参数 -> 链上 referralOf -> owner 默认 -> 手动输入
// 并在执行购买前通过 ensureReferrerReady() 做链上最终校验/绑定
```

---

## 三、数据类型定义

### 订单类型

```typescript
type MachineOrder = {
  id: bigint; // 订单 ID
  user: string; // 购买者地址
  quantity: bigint; // 矿机数量
  amountUSDT: bigint; // 支付金额 (USDT, 6 decimals)
  referrer: string; // 推荐人地址
  createdAt: bigint; // 创建时间戳
};
```

### 身份类型

```typescript
type IdentityAccount = {
  id: bigint; // 身份 ID
  owner: string; // 所有者地址
  role: number; // 0=None, 1=Node, 2=SuperNode
  updatedAt: bigint; // 更新时间戳
};
```

### 团队统计类型

```typescript
type TeamStats = {
  directCount: bigint; // 直推人数
  teamCount: bigint; // 团队总人数
  directVolume: bigint; // 直推业绩 (USDT, 6 decimals)
  teamVolume: bigint; // 团队业绩 (USDT, 6 decimals)
};
```

### 奖励记录类型

```typescript
type RewardRecord = {
  orderId: bigint; // 相关的订单 ID
  poolType: number; // 0-5 对应 6 个资金池
  beneficiary: string; // 受益人地址
  amountUSDT: bigint; // 奖励金额 (USDT)
  blockNumber: number; // 区块号
  txHash: string; // 交易哈希
};
```

---

## 四、配置参数

### 网络配置

```javascript
// CNC Mainnet 参数
const CNC_MAINNET_CONFIG = {
  chainId: 97,
  chainName: "CNC Mainnet",
  chainIdHex: "0xc61c",
  rpcUrls: [
    "https://rpc.cncchainpro.com",
    "https://rpc.cncchainpro.com",
    "https://rpc.cncchainpro.com",
  ],
  blockExplorerUrls: ["https://cncchainpro.com"],
  nativeCurrency: {
    name: "Testnet BNB",
    symbol: "BNB",
    decimals: 18,
  },
};
```

### 代币配置

```javascript
const TOKEN_CONFIGS = {
  USDT: {
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
  },
  ICO: {
    decimals: 18,
    symbol: "ICO",
    name: "Incubator Token",
  },
  LIGHT: {
    decimals: 18,
    symbol: "LIGHT",
    name: "Light Token",
  },
};
```

### 值常量

```javascript
const MACHINE_CONFIG = {
  MIN_QTY: 1,
  MAX_QTY: 10,
  UNIT_PRICE: 100 * 1e6, // 100 USDT (with 6 decimals)
  MAX_UNIT_PRICE: 10000 * 1e6, // 10,000 USDT
};

const IDENTITY_CONFIG = {
  NODE_PRICE: 1000 * 1e6, // 1,000 USDT
  MAX_NODE_PRICE: 100000 * 1e6, // 100,000 USDT
  SUPER_NODE_PRICE: 3000 * 1e6, // 3,000 USDT
  MAX_SUPER_NODE_PRICE: 300000 * 1e6, // 300,000 USDT
};

const POOL_CONFIG = {
  LIQUIDITY: 6000, // 60%
  REFERRAL: 500, // 5%
  SUPER_NODE: 500, // 5%
  NODE: 800, // 8%
  PLATFORM: 2000, // 20%
  LEADERBOARD: 200, // 2%
};

// BPS = basis point (万分之一)
const BPS_DENOMINATOR = 10000;
```

---

## 五、前端状态管理

### App.tsx 关键状态

```typescript
// 1. 连接状态
const [userAddress, setUserAddress] = useState<string | null>(null);
const [provider, setProvider] = useState<BrowserProvider | null>(null);
const [isConnected, setIsConnected] = useState(false);

// 2. 推荐人状态（当前在 App.tsx 内集中管理）
const [machineReferrer, setMachineReferrer] = useState("");
const [referrerSource, setReferrerSource] = useState<
  "none" | "link" | "onchain" | "owner" | "manual"
>("none");
const [contractOwner, setContractOwner] = useState("");

// 3. 矿机购买状态
const [machineQty, setMachineQty] = useState(1);
const [machineUnitPrice, setMachineUnitPrice] = useState(0n);

// 4. USDT 授权状态
const [usdtBalance, setUsdtBalance] = useState(0n);
const [usdtAllowance, setUsdtAllowance] = useState(0n);

// 5. 订单数据
const [machineOrders, setMachineOrders] = useState<MachineOrder[]>([]);
const [teamStats, setTeamStats] = useState<TeamStats | null>(null);

// 6. 操作状态
const [loading, setLoading] = useState(false);
const [status, setStatus] = useState("");
const [error, setError] = useState("");

// 7. UI 状态
const [activeTab, setActiveTab] = useState<TabKey>("overview");
const [theme, setTheme] = useState<"dark" | "light">("dark");
const [lang, setLang] = useState<"zh" | "en">("zh");
```

### 关键计算

```typescript
// 订单总额
const orderTotal = useMemo(() => {
  return toSafeBigInt(machineUnitPrice) * BigInt(machineQty);
}, [machineUnitPrice, machineQty]);

// 需要的授权额度
const needApproval = useMemo(() => {
  return orderTotal > usdtAllowance;
}, [orderTotal, usdtAllowance]);

// 是否可以购买
const canPurchase = useMemo(() => {
  return (
    isConnected &&
    hasEffectiveReferrer &&
    usdtBalance >= orderTotal &&
    !needApproval
  );
}, [isConnected, hasEffectiveReferrer, usdtBalance, orderTotal, needApproval]);
```

---

## 六、 RainbowKit 集成

### 配置文件

**文件**: `src/wagmi.ts`

```typescript
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

const cncMainnet = defineChain({
  id: 50716,
  name: "CNC Mainnet",
  nativeCurrency: { name: "CNC", symbol: "CNC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.cncchainpro.com"] },
    public: { http: ["https://rpc.cncchainpro.com"] },
  },
  blockExplorers: {
    default: { name: "CNC Explorer", url: "https://cncchainpro.com" },
  },
});

export const config = getDefaultConfig({
  appName: "Incubator",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID",
  chains: [cncMainnet],
  ssr: false,
});
```

### App 入口配置

**文件**: `src/main.tsx`

```typescript
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './wagmi'

const queryClient = new QueryClient()

ReactDOM.render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider>
        <App />
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>,
  document.getElementById('root')
)
```

### 连接按钮

```tsx
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header>
      <h1>Incubator</h1>
      <ConnectButton />
    </header>
  );
}
```

---

## 七、错误处理

### 常见错误代码映射

```typescript
const ERROR_CODES = {
  // 钱包错误
  4001: "User rejected the request",
  4100: "Unauthorized",
  4200: "Unsupported method",
  -32000: "Invalid input",
  -32001: "Server error",
  -32002: "Server busy",
  -32003: "Invalid params",
  -32700: "Parse error",

  // 合约错误（需要从 revert 信息中提取）
  "already bound": "推荐人已绑定，无法修改",
  "bind referrer first": "请先绑定推荐人",
  "invalid qty": "购买数量必须在 1-10 范围内",
  "invalid referrer": "推荐人地址无效",
  "insufficient balance": "USDT 余额不足",
}

export function parseContractError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      if (msg.includes(key)) {
        return value as string
      }
    }
  }
  return "交易执行失败，请检查参数或重试"
}
```

### 重试策略

```typescript
async function retryableCall<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

// 使用
const price = await retryableCall(() => getMachineUnitPrice(provider));
```

---

## 八、事件监听

### 订阅链上事件

```typescript
// 监听矿机购买事件
function setupMachinePurchasedListener() {
  const contract = getCoreContract(provider);

  contract.on("MachinePurchased", (user, orderId, qty, amount, referrer) => {
    console.log(`Order created: ${orderId}`);
    console.log(`User: ${user}`);
    console.log(`Quantity: ${qty}`);
    console.log(`Amount: ${formatUsdt(amount)} USDT`);

    // 刷新订单列表
    refreshUserOrders();

    // 刷新团队数据
    refreshTeamStats();
  });

  return () => {
    contract.off("MachinePurchased");
  };
}

// 监听推荐人绑定事件
function setupReferralBoundListener() {
  const contract = getCoreContract(provider);

  contract.on("ReferralBound", (user, referrer) => {
    console.log(`${user} bound to ${referrer}`);
    // 更新推荐人 UI
  });

  return () => {
    contract.off("ReferralBound");
  };
}
```

### 使用效果 Hook

```typescript
useEffect(() => {
  if (!provider) return;

  const unsubMachinePurchased = setupMachinePurchasedListener();
  const unsubReferralBound = setupReferralBoundListener();

  return () => {
    unsubMachinePurchased();
    unsubReferralBound();
  };
}, [provider]);
```

---

## 九、性能优化建议

### 1. 缓存策略

```typescript
// 缓存价格数据（5 分钟）
const cache = new Map<string, { value: any; time: number }>();

async function cachedGetMachineUnitPrice(provider: BrowserProvider) {
  const key = "machineUnitPrice";
  const cached = cache.get(key);

  if (cached && Date.now() - cached.time < 5 * 60 * 1000) {
    return cached.value;
  }

  const price = await getMachineUnitPrice(provider);
  cache.set(key, { value: price, time: Date.now() });
  return price;
}
```

### 2. 批量查询

```typescript
// 并行查询所有订单
async function getUserOrdersInfo(provider: BrowserProvider, user: string) {
  const orderIds = await getUserMachineOrderIds(provider, user);
  const orders = await Promise.all(
    orderIds.map((id) => getMachineOrder(provider, id)),
  );
  return orders;
}
```

### 3. 防抖和节流

```typescript
import { useCallback, useRef } from "react";

// 防抖：延迟执行，合并重复调用
function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300,
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    (...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay],
  );
}

// 用法
const debouncedRefresh = useDebounce(() => {
  refreshTeamStats();
}, 500);
```

---

## 十、测试检查清单

- [ ] 连接 MetaMask 成功
- [ ] 切换到 CNC Mainnet 网络成功
- [ ] 推荐人自动检测（URL/链上/Owner）
- [ ] 推荐人绑定成功且不可修改
- [ ] USDT 授权流程正常
- [ ] 矿机购买成功
- [ ] 订单数据正确保存
- [ ] 团队数据实时更新
- [ ] 错误提示清晰
- [ ] 移动端响应式设计正常
- [ ] 性能无明显拖累（首屏 < 2s）

---

**最后更新**: 2026-04-05  
**维护者**: Dev Team
