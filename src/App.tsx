import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, isAddress } from "ethers";
import "./App.css";
import "./types/ethereum";
import { fetchPublishedAnnouncements, type Announcement } from "./lib/announcements";
import {
  buyNode,
  buySuperNode,
  getMachineOrder,
  getMachineUnitPrice,
  getNodePrice,
  getSuperNodePrice,
  getUserMachineOrderIds,
  getUserRole,
  purchaseMachine,
  type MachineOrder,
} from "./lib/coreContract";
import { getActiveOrderIds, getOrder, fillOtcOrder, cancelOtcOrder, createOtcOrder, type OtcOrder } from "./lib/otcContract";
import { connectWallet, ensureSepoliaNetwork, isOnSepolia } from "./lib/wallet";
import { approveUsdt, formatUsdt, getUsdtAllowance, getUsdtBalance, parseUsdt } from "./lib/usdtContract";
import { approveIdentityForOtc, getTokenOfOwner, isIdentityApproved } from "./lib/identityContract";
import { CORE_CONTRACT_ADDRESS, OTC_CONTRACT_ADDRESS, SWAP_POOL_ADDRESS } from "./config";
import { approveToken, formatTokenAmount, getTokenAllowance, getTokenBalance, getTokenMeta, parseTokenAmount } from "./lib/tokenContract";
import { getSwapPool, quoteSwapExactIn, swapExactIn } from "./lib/swapContract";

type TabKey = "overview" | "machine" | "node" | "otc" | "swap" | "mine";
type SwapDirection = "forward" | "reverse";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "首页" },
  { key: "machine", label: "矿机" },
  { key: "node", label: "节点" },
  { key: "otc", label: "OTC" },
  { key: "swap", label: "Swap" },
  { key: "mine", label: "我的" },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [status, setStatus] = useState("");

  const [machineQty, setMachineQty] = useState(1);
  const [machineReferrer, setMachineReferrer] = useState("");
  const [machinePrice, setMachinePrice] = useState<bigint>(0n);
  const [nodePrice, setNodePrice] = useState<bigint>(0n);
  const [superPrice, setSuperPrice] = useState<bigint>(0n);
  const [role, setRole] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState<bigint>(0n);
  const [coreAllowance, setCoreAllowance] = useState<bigint>(0n);
  const [otcAllowance, setOtcAllowance] = useState<bigint>(0n);
  const [orders, setOrders] = useState<MachineOrder[]>([]);

  const [identityId, setIdentityId] = useState<bigint | null>(null);
  const [identityApproved, setIdentityApproved] = useState(false);
  const [newOtcPrice, setNewOtcPrice] = useState("100");
  const [activeOrders, setActiveOrders] = useState<OtcOrder[]>([]);

  const [swapPairId, setSwapPairId] = useState(0);
  const [swapDirection, setSwapDirection] = useState<SwapDirection>("forward");
  const [swapAmountIn, setSwapAmountIn] = useState("10");
  const [swapSlippageBps, setSwapSlippageBps] = useState(200);
  const [swapTokenInAddress, setSwapTokenInAddress] = useState("");
  const [swapTokenOutAddress, setSwapTokenOutAddress] = useState("");
  const [swapTokenInSymbol, setSwapTokenInSymbol] = useState("-");
  const [swapTokenOutSymbol, setSwapTokenOutSymbol] = useState("-");
  const [swapTokenInDecimals, setSwapTokenInDecimals] = useState(6);
  const [swapTokenOutDecimals, setSwapTokenOutDecimals] = useState(18);
  const [swapPoolFeeBps, setSwapPoolFeeBps] = useState(0);
  const [swapPoolImpactLimitBps, setSwapPoolImpactLimitBps] = useState(0);
  const [swapTokenInBalance, setSwapTokenInBalance] = useState<bigint>(0n);
  const [swapTokenInAllowance, setSwapTokenInAllowance] = useState<bigint>(0n);
  const [swapQuoteOut, setSwapQuoteOut] = useState<bigint>(0n);
  const [swapQuoteFee, setSwapQuoteFee] = useState<bigint>(0n);
  const [swapQuoteImpactBps, setSwapQuoteImpactBps] = useState(0);

  const [loading, setLoading] = useState(false);

  const networkLabel = useMemo(() => {
    if (!chainId) return "未连接";
    return isOnSepolia(chainId) ? "Sepolia" : `错误网络（chainId=${chainId})`;
  }, [chainId]);

  const maskedAddress = useMemo(() => {
    if (!address) return "-";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const machineTotal = useMemo(() => machinePrice * BigInt(machineQty || 0), [machinePrice, machineQty]);
  const roleLabel = useMemo(() => (role === 2 ? "超级节点" : role === 1 ? "节点" : "普通用户"), [role]);

  useEffect(() => {
    void (async () => {
      try {
        setAnnouncements(await fetchPublishedAnnouncements());
      } catch {
        setAnnouncements([]);
      }
    })();
  }, []);

  const refreshSwapPanel = async (
    connectedProvider: BrowserProvider,
    wallet: string,
    pairId = swapPairId,
    direction = swapDirection,
    amountInput = swapAmountIn,
  ) => {
    if (!SWAP_POOL_ADDRESS) return;

    const pool = await getSwapPool(connectedProvider, pairId);
    if (!pool.exists) {
      setSwapQuoteOut(0n);
      setSwapQuoteFee(0n);
      setSwapQuoteImpactBps(0);
      return;
    }

    const tokenInAddress = direction === "forward" ? pool.token0 : pool.token1;
    const tokenOutAddress = direction === "forward" ? pool.token1 : pool.token0;

    const [tokenInMeta, tokenOutMeta, tokenInBalance, tokenInAllowance] = await Promise.all([
      getTokenMeta(connectedProvider, tokenInAddress),
      getTokenMeta(connectedProvider, tokenOutAddress),
      getTokenBalance(connectedProvider, tokenInAddress, wallet),
      getTokenAllowance(connectedProvider, tokenInAddress, wallet, SWAP_POOL_ADDRESS),
    ]);

    setSwapTokenInAddress(tokenInAddress);
    setSwapTokenOutAddress(tokenOutAddress);
    setSwapTokenInSymbol(tokenInMeta.symbol);
    setSwapTokenOutSymbol(tokenOutMeta.symbol);
    setSwapTokenInDecimals(tokenInMeta.decimals);
    setSwapTokenOutDecimals(tokenOutMeta.decimals);
    setSwapTokenInBalance(tokenInBalance);
    setSwapTokenInAllowance(tokenInAllowance);
    setSwapPoolFeeBps(pool.feeBps);
    setSwapPoolImpactLimitBps(pool.maxPriceImpactBps);

    if (!amountInput.trim() || Number(amountInput) <= 0) {
      setSwapQuoteOut(0n);
      setSwapQuoteFee(0n);
      setSwapQuoteImpactBps(0);
      return;
    }

    const amountInRaw = parseTokenAmount(amountInput, tokenInMeta.decimals);
    const quote = await quoteSwapExactIn(connectedProvider, pairId, tokenInAddress, amountInRaw);
    setSwapQuoteOut(quote.amountOut);
    setSwapQuoteFee(quote.fee);
    setSwapQuoteImpactBps(quote.priceImpactBps);
  };

  const refreshAll = async (connectedProvider: BrowserProvider, wallet: string) => {
    const [nextMachinePrice, nextNodePrice, nextSuperPrice, nextRole, balance, allowanceCore, allowanceOtc] = await Promise.all([
      getMachineUnitPrice(connectedProvider),
      getNodePrice(connectedProvider),
      getSuperNodePrice(connectedProvider),
      getUserRole(connectedProvider, wallet),
      getUsdtBalance(connectedProvider, wallet),
      CORE_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, CORE_CONTRACT_ADDRESS) : Promise.resolve(0n),
      OTC_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, OTC_CONTRACT_ADDRESS) : Promise.resolve(0n),
    ]);

    setMachinePrice(nextMachinePrice);
    setNodePrice(nextNodePrice);
    setSuperPrice(nextSuperPrice);
    setRole(nextRole);
    setUsdtBalance(balance);
    setCoreAllowance(allowanceCore);
    setOtcAllowance(allowanceOtc);

    const orderIds = await getUserMachineOrderIds(connectedProvider, wallet);
    const nextOrders = await Promise.all(orderIds.slice(Math.max(0, orderIds.length - 8)).map((id) => getMachineOrder(connectedProvider, id)));
    setOrders(nextOrders.reverse());

    const nextIdentityId = await getTokenOfOwner(connectedProvider, wallet);
    setIdentityId(nextIdentityId);
    setIdentityApproved(nextIdentityId && OTC_CONTRACT_ADDRESS ? await isIdentityApproved(connectedProvider, nextIdentityId, OTC_CONTRACT_ADDRESS) : false);

    if (OTC_CONTRACT_ADDRESS) {
      const ids = await getActiveOrderIds(connectedProvider);
      const nextActiveOrders = await Promise.all(ids.slice(0, 20).map((id) => getOrder(connectedProvider, id)));
      setActiveOrders(nextActiveOrders.filter((row) => row.active));
    } else {
      setActiveOrders([]);
    }

    await refreshSwapPanel(connectedProvider, wallet);
  };

  const onConnect = async () => {
    try {
      await ensureSepoliaNetwork();
      const connection = await connectWallet();
      setAddress(connection.address);
      setChainId(connection.chainId);
      setProvider(connection.provider);
      setStatus("钱包连接成功");
      await refreshAll(connection.provider, connection.address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接钱包失败");
    }
  };

  const guardedAction = async (action: () => Promise<void>) => {
    if (!provider || !address) {
      setStatus("请先连接钱包");
      return;
    }
    if (!isOnSepolia(chainId)) {
      setStatus("请切换到 Sepolia 网络");
      return;
    }
    try {
      setLoading(true);
      await action();
      await refreshAll(provider, address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "交易执行失败");
    } finally {
      setLoading(false);
    }
  };

  const onApproveCore = async () => guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error("缺少 VITE_CORE_CONTRACT_ADDRESS 配置");
    setStatus("提交 USDT 授权交易...");
    await approveUsdt(provider!, CORE_CONTRACT_ADDRESS, parseUsdt("1000000000"));
    setStatus("Core 授权成功");
  });

  const onApproveOtc = async () => guardedAction(async () => {
    if (!OTC_CONTRACT_ADDRESS) throw new Error("缺少 VITE_OTC_CONTRACT_ADDRESS 配置");
    setStatus("提交 OTC USDT 授权交易...");
    await approveUsdt(provider!, OTC_CONTRACT_ADDRESS, parseUsdt("1000000000"));
    setStatus("OTC USDT 授权成功");
  });

  const onBuyMachine = async () => guardedAction(async () => {
    if (machineQty < 1 || machineQty > 10) throw new Error("矿机数量需在 1-10 之间");
    const referrer = machineReferrer.trim();
    if (referrer && !isAddress(referrer)) throw new Error("推荐人地址格式错误");
    setStatus("提交矿机购买交易...");
    await purchaseMachine(provider!, machineQty, referrer || "0x0000000000000000000000000000000000000000");
    setStatus("矿机购买成功");
  });

  const onBuyNode = async () => guardedAction(async () => {
    setStatus("提交节点购买交易...");
    await buyNode(provider!);
    setStatus("节点购买成功");
  });

  const onBuySuperNode = async () => guardedAction(async () => {
    setStatus("提交超级节点升级交易...");
    await buySuperNode(provider!);
    setStatus("升级超级节点成功");
  });

  const onApproveIdentity = async () => guardedAction(async () => {
    if (!identityId) throw new Error("当前钱包无身份 ID");
    if (!OTC_CONTRACT_ADDRESS) throw new Error("缺少 VITE_OTC_CONTRACT_ADDRESS 配置");
    setStatus("提交身份 ID 授权交易...");
    await approveIdentityForOtc(provider!, identityId, OTC_CONTRACT_ADDRESS);
    setStatus("身份 ID 授权成功");
  });

  const onCreateOtcOrder = async () => guardedAction(async () => {
    if (!identityId) throw new Error("当前钱包无身份 ID");
    const price = parseUsdt(newOtcPrice || "0");
    if (price <= 0n) throw new Error("请输入有效挂单价格");
    setStatus("提交 OTC 挂单交易...");
    await createOtcOrder(provider!, identityId, price);
    setStatus("OTC 挂单成功");
  });

  const onFillOrder = async (orderId: bigint) => guardedAction(async () => {
    setStatus(`提交 OTC 成交交易 #${orderId}...`);
    await fillOtcOrder(provider!, orderId);
    setStatus(`OTC 成交成功 #${orderId}`);
  });

  const onCancelOrder = async (orderId: bigint) => guardedAction(async () => {
    setStatus(`提交 OTC 撤单交易 #${orderId}...`);
    await cancelOtcOrder(provider!, orderId);
    setStatus(`OTC 撤单成功 #${orderId}`);
  });

  const onRefreshSwapQuote = async () => {
    if (!provider || !address) {
      setStatus("请先连接钱包");
      return;
    }
    try {
      setLoading(true);
      await refreshSwapPanel(provider, address);
      setStatus("Swap 报价已刷新");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "刷新报价失败");
    } finally {
      setLoading(false);
    }
  };

  const onApproveSwapToken = async () => guardedAction(async () => {
    if (!SWAP_POOL_ADDRESS) throw new Error("缺少 VITE_SWAP_POOL_ADDRESS 配置");
    if (!swapTokenInAddress) throw new Error("请先刷新 Swap 报价");
    setStatus(`提交 ${swapTokenInSymbol} 授权交易...`);
    await approveToken(provider!, swapTokenInAddress, SWAP_POOL_ADDRESS, parseTokenAmount("1000000000", swapTokenInDecimals));
    await refreshSwapPanel(provider!, address);
    setStatus(`${swapTokenInSymbol} 授权成功`);
  });

  const onSwapExecute = async () => guardedAction(async () => {
    if (!swapTokenInAddress || !swapTokenOutAddress) throw new Error("请先刷新报价");
    if (swapQuoteOut <= 0n) throw new Error("请先获取有效报价");
    const amountInRaw = parseTokenAmount(swapAmountIn, swapTokenInDecimals);
    const minOut = (swapQuoteOut * BigInt(10_000 - swapSlippageBps)) / 10_000n;
    setStatus(`提交兑换交易 ${swapTokenInSymbol} -> ${swapTokenOutSymbol}...`);
    await swapExactIn(provider!, swapPairId, swapTokenInAddress, amountInRaw, minOut, address);
    await refreshSwapPanel(provider!, address);
    setStatus(`兑换成功 ${swapTokenInSymbol} -> ${swapTokenOutSymbol}`);
  });

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>Incubator DApp / Sepolia</h1>
          <p>业务核心链上执行，Appwrite 仅公告。</p>
        </div>
        <button onClick={onConnect} className="primary-btn" disabled={loading}>{address ? "刷新链上数据" : "连接钱包"}</button>
      </header>

      <section className="card">
        <div className="kv-row"><span>地址</span><strong>{maskedAddress}</strong></div>
        <div className="kv-row"><span>网络</span><strong>{networkLabel}</strong></div>
        <div className="kv-row"><span>角色</span><strong>{roleLabel}</strong></div>
        <div className="kv-row"><span>USDT余额</span><strong>{formatUsdt(usdtBalance)}</strong></div>
        {status ? <p className="status">{status}</p> : null}
      </section>

      <section className="tabs">
        {TABS.map((tab) => <button key={tab.key} className={tab.key === activeTab ? "tab-btn tab-active" : "tab-btn"} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
      </section>

      {activeTab === "overview" ? <section className="grid"><article className="card"><h2>价格参数（链上）</h2><div className="kv-row"><span>矿机单价</span><strong>{formatUsdt(machinePrice)} USDT</strong></div><div className="kv-row"><span>节点价格</span><strong>{formatUsdt(nodePrice)} USDT</strong></div><div className="kv-row"><span>超级节点价格</span><strong>{formatUsdt(superPrice)} USDT</strong></div></article><article className="card"><h2>授权状态</h2><div className="kv-row"><span>Core 授权</span><strong>{formatUsdt(coreAllowance)} USDT</strong></div><div className="kv-row"><span>OTC 授权</span><strong>{formatUsdt(otcAllowance)} USDT</strong></div></article></section> : null}

      {activeTab === "machine" ? <section className="card"><h2>矿机购买</h2><label className="field">数量（1-10）<input type="number" min={1} max={10} value={machineQty} onChange={(event) => setMachineQty(Number(event.target.value || 1))} /></label><label className="field">推荐人地址（可选）<input type="text" placeholder="0x..." value={machineReferrer} onChange={(event) => setMachineReferrer(event.target.value)} /></label><p className="hint">订单总额：{formatUsdt(machineTotal)} USDT</p><div className="actions"><button className="primary-btn" onClick={onApproveCore} disabled={loading}>授权 Core</button><button className="primary-btn" onClick={onBuyMachine} disabled={loading || coreAllowance < machineTotal}>提交购买</button></div>{coreAllowance < machineTotal ? <p className="hint">当前授权不足，请先授权。</p> : null}</section> : null}

      {activeTab === "node" ? <section className="grid"><article className="card"><h2>节点购买</h2><p className="hint">价格：{formatUsdt(nodePrice)} USDT</p><button className="primary-btn" onClick={onBuyNode} disabled={loading || role !== 0 || coreAllowance < nodePrice}>购买节点</button></article><article className="card"><h2>超级节点升级</h2><p className="hint">价格：{formatUsdt(superPrice)} USDT</p><button className="primary-btn" onClick={onBuySuperNode} disabled={loading || role !== 1 || coreAllowance < superPrice}>升级超级节点</button></article></section> : null}

      {activeTab === "otc" ? <section className="card"><h2>OTC 身份交易</h2><div className="kv-row"><span>我的身份 ID</span><strong>{identityId ? String(identityId) : "无"}</strong></div><div className="kv-row"><span>身份授权状态</span><strong>{identityApproved ? "已授权" : "未授权"}</strong></div><label className="field">挂单价格（USDT）<input type="number" min={1} value={newOtcPrice} onChange={(event) => setNewOtcPrice(event.target.value)} /></label><div className="actions"><button className="primary-btn" onClick={onApproveIdentity} disabled={loading || !identityId}>授权身份 ID</button><button className="primary-btn" onClick={onApproveOtc} disabled={loading}>授权 OTC-USDT</button><button className="primary-btn" onClick={onCreateOtcOrder} disabled={loading || !identityId || !identityApproved}>创建挂单</button></div><h3>活跃挂单</h3>{activeOrders.length === 0 ? <p className="hint">暂无活跃挂单</p> : <div className="table-wrap"><table><thead><tr><th>订单ID</th><th>身份ID</th><th>卖家</th><th>价格(USDT)</th><th>操作</th></tr></thead><tbody>{activeOrders.map((order) => <tr key={String(order.id)}><td>{String(order.id)}</td><td>{String(order.identityId)}</td><td>{`${order.seller.slice(0, 6)}...${order.seller.slice(-4)}`}</td><td>{formatUsdt(order.priceUSDT)}</td><td>{address && order.seller.toLowerCase() === address.toLowerCase() ? <button className="link-btn" onClick={() => onCancelOrder(order.id)} disabled={loading}>撤单</button> : <button className="link-btn" onClick={() => onFillOrder(order.id)} disabled={loading || otcAllowance < order.priceUSDT}>成交</button>}</td></tr>)}</tbody></table></div>}</section> : null}

      {activeTab === "swap" ? <section className="card"><h2>Swap 兑换池</h2><label className="field">兑换池<select value={swapPairId} onChange={(event) => setSwapPairId(Number(event.target.value))}><option value={0}>USDT / ICO</option><option value={1}>LIGHT / ICO</option></select></label><label className="field">方向<select value={swapDirection} onChange={(event) => setSwapDirection(event.target.value as SwapDirection)}><option value="forward">token0 -&gt; token1</option><option value="reverse">token1 -&gt; token0</option></select></label><label className="field">输入数量<input type="number" min={0} value={swapAmountIn} onChange={(event) => setSwapAmountIn(event.target.value)} /></label><label className="field">滑点容忍（bps）<input type="number" min={10} max={2000} value={swapSlippageBps} onChange={(event) => setSwapSlippageBps(Number(event.target.value || 200))} /></label><div className="kv-row"><span>池手续费</span><strong>{(swapPoolFeeBps / 100).toFixed(2)}%</strong></div><div className="kv-row"><span>池冲击上限</span><strong>{(swapPoolImpactLimitBps / 100).toFixed(2)}%</strong></div><div className="kv-row"><span>输入币种余额（{swapTokenInSymbol}）</span><strong>{formatTokenAmount(swapTokenInBalance, swapTokenInDecimals)}</strong></div><div className="kv-row"><span>输入币种授权（{swapTokenInSymbol}）</span><strong>{formatTokenAmount(swapTokenInAllowance, swapTokenInDecimals)}</strong></div><div className="kv-row"><span>预估输出（{swapTokenOutSymbol}）</span><strong>{formatTokenAmount(swapQuoteOut, swapTokenOutDecimals)}</strong></div><div className="kv-row"><span>预估手续费（{swapTokenInSymbol}）</span><strong>{formatTokenAmount(swapQuoteFee, swapTokenInDecimals)}</strong></div><div className="kv-row"><span>预估价格冲击</span><strong>{(swapQuoteImpactBps / 100).toFixed(2)}%</strong></div><div className="actions"><button className="primary-btn" onClick={onRefreshSwapQuote} disabled={loading}>刷新报价</button><button className="primary-btn" onClick={onApproveSwapToken} disabled={loading || !swapTokenInAddress}>授权输入币</button><button className="primary-btn" onClick={onSwapExecute} disabled={loading || swapQuoteOut <= 0n}>执行兑换</button></div></section> : null}

      {activeTab === "mine" ? <section className="grid"><article className="card"><h2>最近矿机订单</h2>{orders.length === 0 ? <p className="hint">暂无订单</p> : <ul className="list">{orders.map((order) => <li key={String(order.id)} className="list-item"><div className="list-head"><strong>订单 #{String(order.id)}</strong><span>{String(order.quantity)} 台</span></div><p>金额：{formatUsdt(order.amountUSDT)} USDT</p><p>时间戳：{String(order.createdAt)}</p></li>)}</ul>}</article><article className="card"><h2>系统公告</h2>{announcements.length === 0 ? <p className="hint">暂无公告或 Appwrite 未配置</p> : <ul className="list">{announcements.map((item) => <li key={item.$id} className="list-item"><div className="list-head"><strong>{item.title}</strong><span>{item.category}</span></div><p>{item.summary}</p></li>)}</ul>}</article></section> : null}
    </main>
  );
}

export default App;
