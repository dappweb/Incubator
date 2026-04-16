# P0-3 前端授权+购买双步骤实施方案

## 📍 当前状态分析

### 现有代码结构

- `App.tsx`: 主应用组件，包含`onBuyMachine`函数
- `lib/usdtContract.ts`: USDT操作库
- `lib/coreContract.ts`: Core合约交互

### 现有流程

```
onBuyMachine()
  ├─ ensureReferrerReady()  // 绑定推荐人
  ├─ ensureUsdtApproval()   // 授权(内部处理)
  └─ purchaseMachine()      // 购买矿机
```

**问题**: 授权过程对用户是黑盒，需要拆分成用户可见的两步

---

## 🎯 改动目标

### 改动前

- 单步购买：一键完成授权+购买
- 用户看不到授权进度

### 改动后

- 双步购买：
  1. **授权步骤**: 用户明确看到"授权USDT"按钮
  2. **购买步骤**: 授权后显示"购买矿机"按钮
- 风险确认弹窗：购买前展示详细信息

---

## 📝 具体改动项

### 1. 后端数据结构

位置: `src/App.tsx`

```typescript
// 新增状态变量
const [usdtApprovalInProgress, setUsdtApprovalInProgress] = useState(false);
const [machineApprovalConfirmed, setMachineApprovalConfirmed] = useState(false);
const [showMachineRiskModal, setShowMachineRiskModal] = useState(false);

// 计算属性
const needsUsdtApproval = coreAllowance < machineTotal;
```

### 2. UI组件改动

位置: `src/components/Common.tsx`

新增组件:

```typescript
// RiskConfirmationModal - 风险确认弹窗
interface RiskConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  details: {
    quantity: number;
    unitPrice: bigint;
    totalAmount: bigint;
    feePreview: {
      lpPool: bigint;
      referralPool: bigint;
      superNodePool: bigint;
      nodePool: bigint;
      platformPool: bigint;
      leaderboardPool: bigint;
    };
    network: string;
    address: string;
  };
}

export function RiskConfirmationModal(props: RiskConfirmationModalProps) {
  // 显示数量、价格、分账预览、网络、地址
  // 有"确认"和"取消"两个按钮
}
```

### 3. 购买流程改动

位置: `src/App.tsx`

```typescript
// 步骤 1: USDT授权
const onApproveUsdt = async () =>
  guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    if (usdtBalance < machineTotal) throw new Error(t.insufficientUsdtBalance);

    setUsdtApprovalInProgress(true);
    setStatus(t.approvingUsdtCore);

    await approveUsdt(
      provider!,
      CORE_CONTRACT_ADDRESS,
      parseUsdt("1000000000"),
    );

    setMachineApprovalConfirmed(true);
    setStatus(t.approvedCoreSuccess);
    setUsdtApprovalInProgress(false);
  });

// 步骤 2: 风险确认
const onConfirmMachineRisk = async () => {
  setShowMachineRiskModal(false);

  await onPurchaseMachine();
};

// 步骤 3: 购买矿机
const onPurchaseMachine = async () =>
  guardedAction(async () => {
    if (machineQty < 1 || machineQty > 10) throw new Error(t.invalidMachineQty);
    await ensureReferrerReady();
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);

    setStatus(t.buyingMachine);
    await purchaseMachine(provider!, machineQty);
    setStatus(t.buyMachineSuccess);
  });

// 新增: 获取分账预览
const getMachineAllocationPreview = () => {
  const total = machineTotal;
  return {
    lpPool: (total * 60n) / 100n,
    referralPool: (total * 5n) / 100n,
    superNodePool: (total * 5n) / 100n,
    nodePool: (total * 8n) / 100n,
    platformPool: (total * 20n) / 100n,
    leaderboardPool: (total * 2n) / 100n,
  };
};
```

### 4. UI渲染改动

位置: `src/App.tsx` 购买矿机卡片部分

```jsx
{
  hasConnected && isOnCncMainnet && (
    <Card>
      <h2>{t.buyingMachiness}</h2>

      {/* 数量输入 */}
      <input
        type="number"
        value={machineQty}
        onChange={(e) => setMachineQty(Number(e.target.value))}
        max="10"
      />

      {/* 显示总价 */}
      <KVRow label={t.totalPrice} value={formatUsdt(machineTotal)} />

      {/* 步骤 1: 授权 */}
      {needsUsdtApproval ? (
        <button
          onClick={onApproveUsdt}
          disabled={usdtApprovalInProgress}
          className="primary-btn"
        >
          {usdtApprovalInProgress ? t.approving : "授权 USDT"}
        </button>
      ) : (
        <div className="approved-badge">✓ 已授权</div>
      )}

      {/* 步骤 2&3: 购买 */}
      {machineApprovalConfirmed && (
        <button
          onClick={() => setShowMachineRiskModal(true)}
          disabled={usdtApprovalInProgress}
          className="primary-btn"
        >
          {t.confirmAndBuy}
        </button>
      )}

      {/* 风险确认弹窗 */}
      <RiskConfirmationModal
        isOpen={showMachineRiskModal}
        details={{
          quantity: machineQty,
          unitPrice: machineUnitPrice,
          totalAmount: machineTotal,
          feePreview: getMachineAllocationPreview(),
          network: t.cncMainnet,
          address: address || "",
        }}
        onConfirm={onConfirmMachineRisk}
        onCancel={() => setShowMachineRiskModal(false)}
      />
    </Card>
  );
}
```

---

## 🔄 开发步骤

### Step 1: 创建风险弹窗组件 (30 mins)

- [ ] 新增 `RiskConfirmationModal` in `src/components/Common.tsx`
- [ ] 包含分账预览表格
- [ ] 验证按钮正常工作

### Step 2: 修改App.tsx购买流程 (1 hour)

- [ ] 添加新状态变量
- [ ] 拆分`onBuyMachine`为三个函数: `onApproveUsdt`、`onConfirmMachineRisk`、`onPurchaseMachine`
- [ ] 添加`getMachineAllocationPreview`函数

### Step 3: 更新UI渲染 (45 mins)

- [ ] 修改购买卡片HTML结构
- [ ] 添加三步按钮逻辑
- [ ] 添加样式（已批准徽章、按钮状态等）

### Step 4: 测试 (30 mins)

- [ ] 本地测试两步流程
- [ ] 验证弹窗显示正确信息
- [ ] 验证交易成功后重置状态

### Step 5: 国际化 (15 mins)

- [ ] 添加新的多语言字符串

**总计**: 2.5-3 小时

---

## 📚 相关文件

### 需要修改的文件

1. `src/App.tsx` - 核心逻辑改动
2. `src/components/Common.tsx` - 新增弹窗组件
3. `src/App.css` - 弹窗样式

### 不需要修改

- `src/lib/` - 后端库无需改动
- `contracts/` - 合约无需改动

---

## ✅ 完成标准

- [x] 用户可看到清晰的"授权USDT"按钮
- [x] 授权后显示"购买矿机"按钮
- [x] 点击购买按钮显示风险确认弹窗
- [x] 弹窗显示数量、价格、分账预览、网络、地址
- [x] 确认后成功购买
- [x] 流程中任何步骤失败都有清晰的错误提示
- [x] 国际化文本完整

---

## 🎨 UI设计参考

### 授权状态

```
[授权 USDT] (蓝紫色按钮)
```

### 已授权状态

```
✓ 已授权 (绿色徽章)
[购买矿机] (蓝紫色按钮)
```

### 风险确认弹窗

```
┌─────────────────────────────┐
│ 确认购买矿机                 │
├─────────────────────────────┤
│ 数量: 2                    │
│ 单价: 100 USDT             │
│ 总计: 200 USDT             │
├─────────────────────────────┤
│ 分账预览:                   │
│ - LP池: 120 USDT           │
│ - 直推: 10 USDT            │
│ - 超级节点: 10 USDT         │
│ - 节点: 16 USDT            │
│ - 平台: 40 USDT            │
│ - 榜单: 4 USDT             │
├─────────────────────────────┤
│ 网络: CNC Mainnet          │
│ 地址: 0x1234...            │
├─────────────────────────────┤
│ [取消]  [确认购买]         │
└─────────────────────────────┘
```

---

**状态**: 📋 准备就绪  
**估计工作量**: 2.5-3 小时  
**优先级**: P0 (阻塞测试网上线)
