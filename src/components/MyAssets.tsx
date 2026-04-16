import { BrowserProvider } from "ethers";
import React, { useEffect, useState } from "react";
import {
  getMachineOrder,
  getUserMachineOrderIds,
  getUserRole,
  type MachineOrder,
} from "../lib/coreContract";
import {
  getActiveOrderIds,
  getOrder
} from "../lib/otcContract";
import { Card, KVRow } from "./Common";

interface MyAssetsProps {
  t: any;
  address?: string;
  provider?: BrowserProvider;
  identityId?: bigint;
  role: number; // 0=user, 1=node, 2=supernode
  loading: boolean;
  onStatusChange: (msg: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

interface AssetSummary {
  nodeCount: number;
  superNodeCount: number;
  otcListingCount: number;
}

export const MyAssets: React.FC<MyAssetsProps> = ({
  t,
  address,
  provider,
  identityId,
  role,
  loading,
  onStatusChange,
  onLoadingChange,
}) => {
  const [machineOrders, setMachineOrders] = useState<MachineOrder[]>([]);
  const [assetSummary, setAssetSummary] = useState<AssetSummary>({
    nodeCount: 0,
    superNodeCount: 0,
    otcListingCount: 0,
  });
  const [userRole, setUserRole] = useState(0);
  const [createdAt, setCreatedAt] = useState<string>("Unknown");

  const getRoleLabel = (r: number) =>
    r === 0 ? (t.user || "User") : r === 1 ? (t.node || "Node") : t.superNode || "SuperNode";

  const loadAssets = async () => {
    if (!provider || !address) return;

    try {
      onLoadingChange(true);

      // Get user role
      const currentRole = await getUserRole(provider, address);
      setUserRole(currentRole);

      // Get machine orders
      const orderIds = await getUserMachineOrderIds(provider, address);
      const orders = await Promise.all(
        orderIds.map((id) => getMachineOrder(provider, id))
      );
      setMachineOrders(orders);

      // Get asset summary: count node/supernode identities
      // Note: This requires identity contract support for querying by owner
      // For now, we'll assume we can check if identityId exists and its role
      let nodeCount = 0;
      let superNodeCount = 0;

      if (identityId && currentRole === 1) {
        nodeCount = 1;
      }
      if (identityId && currentRole === 2) {
        superNodeCount = 1;
      }

      // Get active OTC orders count for this user
      const allOrderIds = await getActiveOrderIds(provider);
      let otcListingCount = 0;

      for (const orderId of allOrderIds.slice(0, 100)) {
        // Limit to first 100 for performance
        const order = await getOrder(provider, orderId);
        if (order.seller.toLowerCase() === address.toLowerCase()) {
          otcListingCount++;
        }
      }

      setAssetSummary({
        nodeCount,
        superNodeCount,
        otcListingCount,
      });

      // Set created at timestamp (could be from first order if available)
      if (orders.length > 0) {
        // Assuming MachineOrder has a timestamp field
        // setCreatedAt(new Date(Number(orders[0].timestamp) * 1000).toLocaleDateString());
      }

      setCreatedAt(
        address
          ? new Date().toLocaleDateString()
          : "Unknown"
      );
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : "Failed to load assets");
    } finally {
      onLoadingChange(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [provider, address]);

  return (
    <section className="grid-full">
      {/* Account Info */}
      <Card title={t.accountSnapshot || "Account Info"}>
        <KVRow label={t.myReferrerTitle || "Wallet Address"} value={address ? `${address.slice(0, 6)}...${address.slice(-4)}` : t.connectFirst || "Not connected"} />
        <KVRow label={t.myIdentityRole || "Current Role"} value={getRoleLabel(userRole)} />
        <KVRow label={t.createdAt || "Created At"} value={createdAt} />
        {identityId && <KVRow label={t.myIdentity || "Identity ID"} value={String(identityId)} />}
      </Card>

      {/* Machine Orders */}
      <Card title={t.machineTitle || "My Mining Machines"}>
        <div className="kv-row">
          <span>{t.totalCount || "Total Machines"}</span>
          <strong>{machineOrders.reduce((sum, o) => sum + Number(o.quantity), 0)} {t.units || "units"}</strong>
        </div>
        <div className="kv-row">
          <span>{t.ordersCount || "Total Orders"}</span>
          <strong>{machineOrders.length}</strong>
        </div>

        {machineOrders.length > 0 && (
          <div className="table-wrap" style={{ marginTop: "1.5rem" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.orderId || "Order ID"}</th>
                  <th>{t.quantity || "Quantity"}</th>
                  <th>{t.time || "Time"}</th>
                  <th>{t.status || "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {machineOrders.map((order, idx) => (
                  <tr key={idx}>
                    <td>#{String(order.id)}</td>
                    <td>{String(order.quantity)}</td>
                    <td>
                      {order.createdAt
                        ? new Date(Number(order.createdAt) * 1000).toLocaleDateString()
                        : "-"}
                    </td>
                    <td>{t.allocated || "✓ Allocated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Asset Summary */}
      <Card title={t.identity || "My Identity Assets"}>
        <div className="stat-grid">
          <div className="stat-pill">
            <span>{t.node || "Nodes"}</span>
            <strong>{assetSummary.nodeCount}</strong>
          </div>
          <div className="stat-pill">
            <span>{t.superNode || "SuperNodes"}</span>
            <strong>{assetSummary.superNodeCount}</strong>
          </div>
          <div className="stat-pill">
            <span>{t.otcListings || "OTC Listings"}</span>
            <strong>{assetSummary.otcListingCount}</strong>
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <Card title={t.quickActions || "Quick Actions"}>
        <div className="actions">
          <button className="primary-btn" onClick={loadAssets} disabled={loading}>
            {loading ? t.loading || "Loading..." : t.refresh || "Refresh"}
          </button>
        </div>
        <p className="hint">{t.dataUpdatesOnChain || "Data updates on-chain. Refresh to see latest."}</p>
      </Card>
    </section>
  );
};
