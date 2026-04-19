import { BrowserProvider } from "ethers";
import React, { useEffect, useState } from "react";
import { OTC_CONTRACT_ADDRESS } from "../config";
import { parseContractError } from "../lib/errorParser";
import { approveIdentityForOtc, isIdentityApproved } from "../lib/identityContract";
import {
    cancelOtcOrder,
    createOtcOrder,
    fillOtcOrder,
    getActiveOrderIds,
    getIdentityActiveOrder,
    getLastTradePriceByRole,
    getOrder,
    getOtcFeeBps,
    type OtcOrder,
} from "../lib/otcContract";
import { approveUsdt, formatUsdt, getUsdtAllowance, getUsdtBalance, parseUsdt } from "../lib/usdtContract";
import { Card, KVRow } from "./Common";

interface OtcMarketProps {
  t: any;
  lang: "zh" | "en";
  address?: string;
  provider?: BrowserProvider;
  identityId?: bigint;
  identitySyncError?: string;
  role: number; // 0=user, 1=node, 2=supernode
  loading: boolean;
  onStatusChange: (msg: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

const ITEMS_PER_PAGE = 10;

export const OtcMarket: React.FC<OtcMarketProps> = ({
  t,
  lang,
  address,
  provider,
  identityId,
  identitySyncError,
  role,
  loading,
  onStatusChange,
  onLoadingChange,
}) => {
  // Pagination and filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<0 | 1 | 2>(0); // 0=all, 1=node, 2=supernode
  const [allOrderIds, setAllOrderIds] = useState<bigint[]>([]);
  
  // Market data
  const [marketOrders, setMarketOrders] = useState<OtcOrder[]>([]);
  const [myOrders, setMyOrders] = useState<OtcOrder[]>([]);
  const [otcFeeBps, setOtcFeeBps] = useState(0);
  const [lastNodePrice, setLastNodePrice] = useState(0n);
  const [lastSuperPrice, setLastSuperPrice] = useState(0n);

  // Create listing modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPrice, setCreatePrice] = useState("");
  const [selectedIdentityId, setSelectedIdentityId] = useState<bigint | null>(identityId || null);
  const [identityApproved, setIdentityApproved] = useState(false);
  const [activeOrderForIdentity, setActiveOrderForIdentity] = useState<bigint>(0n);

  useEffect(() => {
    setSelectedIdentityId(identityId || null);
  }, [identityId]);

  // Refresh market data
  const refreshMarketData = async () => {
    if (!provider) return;
    try {
      onLoadingChange(true);

      // Fetch all order IDs
      const ids = await getActiveOrderIds(provider);
      setAllOrderIds(ids);

      // Fetch order details and last prices
      const [fee, lastNode, lastSuper] = await Promise.all([
        getOtcFeeBps(provider),
        getLastTradePriceByRole(provider, 1), // Node
        getLastTradePriceByRole(provider, 2), // SuperNode
      ]);

      setOtcFeeBps(Number(fee));
      setLastNodePrice(lastNode);
      setLastSuperPrice(lastSuper);

      // Fetch details for ALL active orders first, then filter, then paginate
      const allOrders = await Promise.all(ids.map((id) => getOrder(provider, id)));
      const activeOrders = allOrders.filter((o) => o.active);

      // Apply role filter BEFORE pagination
      const roleFiltered =
        roleFilter === 0 ? activeOrders : activeOrders.filter((o) => o.role === roleFilter);

      // Now paginate the filtered results
      const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageEnd = pageStart + ITEMS_PER_PAGE;
      const paged = roleFiltered.slice(pageStart, pageEnd);

      // Separate my orders from market orders
      const myOrdersFiltered = paged.filter(
        (o) => o.seller.toLowerCase() === address?.toLowerCase()
      );
      const marketOrdersFiltered = paged.filter(
        (o) => o.seller.toLowerCase() !== address?.toLowerCase()
      );

      setMyOrders(myOrdersFiltered);
      setMarketOrders(marketOrdersFiltered);
      setAllOrderIds(roleFiltered.map(o => o.id));

      // Check identity approval
      if (selectedIdentityId && provider && OTC_CONTRACT_ADDRESS) {
        const [approved, activeOrderId] = await Promise.all([
          isIdentityApproved(provider, selectedIdentityId, OTC_CONTRACT_ADDRESS),
          getIdentityActiveOrder(provider, selectedIdentityId),
        ]);
        setIdentityApproved(approved);
        setActiveOrderForIdentity(activeOrderId);
      } else {
        setIdentityApproved(false);
        setActiveOrderForIdentity(0n);
      }
    } catch (error) {
      onStatusChange(parseContractError(error, lang));
    } finally {
      onLoadingChange(false);
    }
  };

  // Auto-refresh on component mount and page/filter changes
  useEffect(() => {
    refreshMarketData();
  }, [provider, address, currentPage, roleFilter, selectedIdentityId]);

  const parsedPrice = createPrice.trim() ? parseUsdt(createPrice) : 0n;
  const minPrice = role === 1 ? lastNodePrice : role === 2 ? lastSuperPrice : 0n;
  const canTradeRole = role === 1 || role === 2;
  const hasIdentity = Boolean(selectedIdentityId);
  const hasNoActiveOrder = hasIdentity && activeOrderForIdentity === 0n;
  const hasPositivePrice = parsedPrice > 0n;
  const meetsFloorPrice = !hasPositivePrice ? false : parsedPrice >= minPrice;
  const hasNoSyncError = !identitySyncError;

  const precheckItems = [
    {
      key: "sync",
      ok: hasNoSyncError,
      label: lang === "zh" ? "身份数据同步正常" : "Identity data synchronized",
      detail: hasNoSyncError ? (lang === "zh" ? "通过" : "Pass") : (identitySyncError || (lang === "zh" ? "身份同步异常" : "Identity sync mismatch")),
    },
    {
      key: "role",
      ok: canTradeRole,
      label: lang === "zh" ? "身份类型可交易（节点/超级节点）" : "Role is tradable (Node/Super Node)",
      detail: canTradeRole ? (lang === "zh" ? "通过" : "Pass") : (lang === "zh" ? "当前身份不可挂单" : "Current role cannot list"),
    },
    {
      key: "identity",
      ok: hasIdentity,
      label: lang === "zh" ? "存在可用身份 ID" : "Identity ID is available",
      detail: hasIdentity ? `${selectedIdentityId}` : (lang === "zh" ? "未读取到身份 ID" : "Identity ID is missing"),
    },
    {
      key: "single-active",
      ok: hasNoActiveOrder,
      label: lang === "zh" ? "该身份当前无活跃挂单" : "No active listing for this identity",
      detail: hasNoActiveOrder
        ? (lang === "zh" ? "通过" : "Pass")
        : (activeOrderForIdentity > 0n
          ? `${lang === "zh" ? "已有活跃订单" : "Active order exists"} #${activeOrderForIdentity}`
          : (lang === "zh" ? "请先确认身份 ID" : "Confirm identity ID first")),
    },
    {
      key: "approval",
      ok: identityApproved,
      label: lang === "zh" ? "身份已授权市场合约" : "Identity approved for market",
      detail: identityApproved ? (lang === "zh" ? "通过" : "Pass") : (lang === "zh" ? "未授权，将在提交时自动授权" : "Not approved, auto-approve on submit"),
    },
    {
      key: "price-positive",
      ok: hasPositivePrice,
      label: lang === "zh" ? "挂单价格大于 0" : "Listing price is greater than 0",
      detail: hasPositivePrice ? `${formatUsdt(parsedPrice)} USDT` : (lang === "zh" ? "请输入价格" : "Enter a price"),
    },
    {
      key: "price-floor",
      ok: meetsFloorPrice,
      label: lang === "zh" ? "价格不低于最近成交价" : "Price is above floor",
      detail: `${lang === "zh" ? "最低" : "Minimum"} ${formatUsdt(minPrice)} USDT`,
    },
  ];

  const failedCheck = precheckItems.find((item) => !item.ok);
  const allChecksPass = !failedCheck;

  // Handle create listing
  const handleCreateListing = async () => {
    if (!provider || !selectedIdentityId) {
      onStatusChange(lang === "zh" ? "缺少钱包或身份 ID，无法创建挂单" : "Missing wallet or identity ID");
      return;
    }

    if (identitySyncError) {
      onStatusChange(identitySyncError);
      return;
    }

    if (!allChecksPass && failedCheck) {
      onStatusChange(`${lang === "zh" ? "挂单前检查未通过" : "Pre-check failed"}: ${failedCheck.label}`);
      return;
    }

    try {
      onLoadingChange(true);
      const price = parsedPrice;

      if (price <= 0n) {
        onStatusChange(t.invalidListingPrice || "Price must be greater than 0");
        return;
      }

      // Check price floor
      if (price < minPrice) {
        onStatusChange(
          `${t.priceTooLow || "Price too low"}: minimum ${formatUsdt(minPrice)} USDT`
        );
        return;
      }

      // Ensure identity approval
      if (!identityApproved) {
        onStatusChange(t.approvingIdentity || "Approving identity...");
        await approveIdentityForOtc(provider, selectedIdentityId, OTC_CONTRACT_ADDRESS);
        setIdentityApproved(true);
      }

      onStatusChange(t.creatingListing || "Creating listing...");
      await createOtcOrder(provider, selectedIdentityId, price);

      onStatusChange(t.createListingSuccess || "Listing created successfully");
      setShowCreateModal(false);
      setCreatePrice("");
      await refreshMarketData();
    } catch (error) {
      onStatusChange(parseContractError(error, lang));
    } finally {
      onLoadingChange(false);
    }
  };

  // Handle fill order
  const handleFillOrder = async (orderId: bigint) => {
    if (!provider || !address) return;

    try {
      onLoadingChange(true);
      const order = marketOrders.find((o) => o.id === orderId);

      if (!order) {
        onStatusChange(t.orderNotFound || "Order not found");
        return;
      }

      // Check USDT balance
      const balance = await getUsdtBalance(provider, address);
      if (balance < order.priceUSDT) {
        onStatusChange(t.insufficientUsdtBalance || "Insufficient USDT balance");
        return;
      }

      // Ensure USDT allowance for OTC contract
      const allowance = await getUsdtAllowance(provider, address, OTC_CONTRACT_ADDRESS);
      if (allowance < order.priceUSDT) {
        onStatusChange(t.approvingUsdt || "Approving USDT...");
        const MAX_APPROVAL = 2n ** 256n - 1n;
        await approveUsdt(provider, OTC_CONTRACT_ADDRESS, MAX_APPROVAL);
      }

      onStatusChange(`${t.fillingOrder || "Filling order"} #${orderId}...`);
      await fillOtcOrder(provider, orderId);

      onStatusChange(`${t.fillOrderSuccess || "Order filled successfully"} #${orderId}`);
      await refreshMarketData();
    } catch (error) {
      onStatusChange(parseContractError(error, lang));
    } finally {
      onLoadingChange(false);
    }
  };

  // Handle cancel order
  const handleCancelOrder = async (orderId: bigint) => {
    if (!provider) return;

    try {
      onLoadingChange(true);
      onStatusChange(`${t.cancellingOrder || "Cancelling order"} #${orderId}...`);
      await cancelOtcOrder(provider, orderId);

      onStatusChange(`${t.cancelOrderSuccess || "Order cancelled"} #${orderId}`);
      await refreshMarketData();
    } catch (error) {
      onStatusChange(parseContractError(error, lang));
    } finally {
      onLoadingChange(false);
    }
  };

  const totalPages = Math.ceil(allOrderIds.length / ITEMS_PER_PAGE);
  const getRoleLabel = (r: number) =>
    r === 0 ? (t.user || "User") : r === 1 ? (t.node || "Node") : t.superNode || "SuperNode";

  return (
    <section className="grid-full">
      {/* Market Info Card */}
      <Card title={t.otcRuleTitle} hint={t.otcRuleHint}>
        <KVRow label={t.otcFeeRate} value={`${(otcFeeBps / 100).toFixed(0)}%`} />
        <KVRow label={t.otcNodeLastPrice} value={`${formatUsdt(lastNodePrice)} USDT`} />
        <KVRow label={t.otcSuperLastPrice} value={`${formatUsdt(lastSuperPrice)} USDT`} />
        <p className="hint">{t.otcRuleSingleListing}</p>
        <p className="hint">{t.otcRuleFloorPrice}</p>
      </Card>

      {/* Public Market Listings */}
      <Card title={t.activeListings}>
        <div className="filter-row" style={{ marginBottom: "1rem" }}>
          <button
            className={roleFilter === 0 ? "tab-btn tab-active" : "tab-btn"}
            onClick={() => setRoleFilter(0)}
          >
            {t.all || "All"}
          </button>
          <button
            className={roleFilter === 1 ? "tab-btn tab-active" : "tab-btn"}
            onClick={() => setRoleFilter(1)}
          >
            {t.node || "Node"}
          </button>
          <button
            className={roleFilter === 2 ? "tab-btn tab-active" : "tab-btn"}
            onClick={() => setRoleFilter(2)}
          >
            {t.superNode || "SuperNode"}
          </button>
        </div>

        {marketOrders.length === 0 ? (
          <p className="hint">{t.noListings}</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.orderId}</th>
                    <th>{t.identityId}</th>
                    <th>{t.otcRole}</th>
                    <th>{t.seller}</th>
                    <th>{t.priceUsdt}</th>
                    <th>{t.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {marketOrders.map((order) => (
                    <tr key={String(order.id)}>
                      <td>#{String(order.id)}</td>
                      <td>{String(order.identityId)}</td>
                      <td>{getRoleLabel(order.role)}</td>
                      <td>{`${order.seller.slice(0, 6)}...${order.seller.slice(-4)}`}</td>
                      <td>{formatUsdt(order.priceUSDT)} USDT</td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => handleFillOrder(order.id)}
                          disabled={loading || !address}
                        >
                          {t.fill}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination" style={{ marginTop: "1rem", textAlign: "center" }}>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="link-btn"
                >
                  &lt; {t.previous || "Previous"}
                </button>
                <span style={{ margin: "0 1rem" }}>
                  {t.page || "Page"} {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="link-btn"
                >
                  {t.next || "Next"} &gt;
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* My Orders */}
      {myOrders.length > 0 && (
        <Card title={t.myOrders || "My Orders"}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.orderId}</th>
                  <th>{t.identityId}</th>
                  <th>{t.otcRole}</th>
                  <th>{t.priceUsdt}</th>
                  <th>{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map((order) => (
                  <tr key={String(order.id)}>
                    <td>#{String(order.id)}</td>
                    <td>{String(order.identityId)}</td>
                    <td>{getRoleLabel(order.role)}</td>
                    <td>{formatUsdt(order.priceUSDT)} USDT</td>
                    <td>
                      <button
                        className="link-btn"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={loading}
                      >
                        {t.cancel}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Listing Button */}
      <Card title={t.createListing || "Create Listing"}>
        <button className="primary-btn" onClick={() => setShowCreateModal(true)} disabled={loading || !identityId}>
          {t.createListing || "Create Listing"}
        </button>
        <p className="hint">{t.otcAutoApproveHint}</p>
        {identitySyncError ? <p className="hint">{identitySyncError}</p> : null}
      </Card>

      {/* Create Listing Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content otc-create-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t.createListing || "Create Listing"}</h3>
            <p className="otc-create-modal-subtitle">{t.otcRuleFloorPrice}</p>

            <div className="field-group">
              <label>{t.identityId || "Identity ID"}</label>
              <input
                type="number"
                value={selectedIdentityId ? String(selectedIdentityId) : ""}
                onChange={(e) => setSelectedIdentityId(BigInt(e.target.value) || null)}
                disabled={true}
              />
            </div>

            <div className="field-group">
              <label>{t.otcRole || "Role"}</label>
              <input
                type="text"
                value={getRoleLabel(role)}
                disabled={true}
              />
            </div>

            <div className="field-group">
              <label>{t.otcPrice || "Listing Price (USDT)"}</label>
              <input
                type="number"
                min="0"
                value={createPrice}
                onChange={(e) => setCreatePrice(e.target.value)}
                placeholder="Enter price..."
              />
              <p className="hint">
                {t.minimumPrice || "Minimum"}:{" "}
                {formatUsdt(role === 1 ? lastNodePrice : lastSuperPrice)} USDT
              </p>
            </div>

            <div className="field-group">
              <label>{lang === "zh" ? "挂单前预检查" : "Pre-Listing Checklist"}</label>
              <div>
                {precheckItems.map((item) => (
                  <p key={item.key} className="hint" style={{ margin: "0.25rem 0" }}>
                    {item.ok ? "[OK]" : "[X]"} {item.label} - {item.detail}
                  </p>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setShowCreateModal(false)}>
                {t.cancel || "Cancel"}
              </button>
              <button
                className="primary-btn"
                onClick={handleCreateListing}
                disabled={loading || !selectedIdentityId || !!identitySyncError || !allChecksPass}
              >
                {loading ? t.creating || "Creating..." : t.confirm || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
