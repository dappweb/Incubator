import React from "react";
import { Card, KVRow } from "./Common";

interface AdminProps {
  lang: "zh" | "en";
  address: string;
  contractOwner: string;
}

const Admin: React.FC<AdminProps> = ({ lang, address, contractOwner }) => {
  const t = {
    adminTitle: lang === "zh" ? "管理后台" : "Admin Panel",
    adminHint: lang === "zh" ? "仅合约 Owner 可访问此页面。" : "Only contract owner can access this page.",
    ownerAddress: lang === "zh" ? "合约 Owner" : "Contract Owner",
    currentAddress: lang === "zh" ? "当前地址" : "Current Address",
    notOwner: lang === "zh" ? "权限不足，只有合约 Owner 可访问此页面。" : "Insufficient permissions. Only the contract owner can access this page.",
    underDevelopment: lang === "zh" ? "功能开发中..." : "Features under development...",
    userManagement: lang === "zh" ? "用户管理" : "User Management",
    contractManagement: lang === "zh" ? "合约管理" : "Contract Management",
    statisticsAnalysis: lang === "zh" ? "统计分析" : "Statistics & Analytics",
  };

  const isOwner = address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase();

  if (!isOwner) {
    return (
      <section className="grid-full">
        <Card title={t.adminTitle} hint={t.adminHint}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ color: "var(--color-error, #ff4444)" }}>{t.notOwner}</p>
            <KVRow label={t.currentAddress} value={address || "-"} />
            <KVRow label={t.ownerAddress} value={contractOwner || "-"} />
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid">
      <Card title={t.adminTitle} hint={t.adminHint}>
        <KVRow label={t.ownerAddress} value={contractOwner} />
        <KVRow label={t.currentAddress} value={address} />
      </Card>

      <Card title={t.userManagement} hint={t.underDevelopment}>
        <p style={{ color: "var(--color-text-secondary, #999)" }}>{t.underDevelopment}</p>
      </Card>

      <Card title={t.contractManagement} hint={t.underDevelopment}>
        <p style={{ color: "var(--color-text-secondary, #999)" }}>{t.underDevelopment}</p>
      </Card>

      <Card title={t.statisticsAnalysis} hint={t.underDevelopment}>
        <p style={{ color: "var(--color-text-secondary, #999)" }}>{t.underDevelopment}</p>
      </Card>
    </section>
  );
};

export default Admin;
