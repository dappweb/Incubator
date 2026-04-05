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
    userManagement: lang === "zh" ? "用户管理" : "User Management",
    contractManagement: lang === "zh" ? "合约管理" : "Contract Management",
    statisticsAnalysis: lang === "zh" ? "统计分析" : "Statistics & Analytics",
    adminSummary: lang === "zh" ? "管理总览" : "Admin Summary",
    examplesTitle: lang === "zh" ? "操作举例说明" : "Operation Examples",
    examplesHint: lang === "zh" ? "以下为建议操作流程示例，便于管理员快速判断处理顺序。" : "Suggested example flows for common admin tasks.",
    scene: lang === "zh" ? "场景" : "Scenario",
    goal: lang === "zh" ? "目标" : "Goal",
    steps: lang === "zh" ? "建议步骤" : "Suggested Steps",
    note: lang === "zh" ? "说明" : "Note",
    adminChecklist: lang === "zh" ? "执行前检查" : "Pre-Action Checklist",
    checklistHint: lang === "zh" ? "先确认以下条件，再执行链上管理操作。" : "Verify these conditions before any on-chain admin action.",
    checklistNetwork: lang === "zh" ? "确认钱包地址与合约 Owner 一致，并已切换到 Sepolia。" : "Confirm the wallet matches the contract owner and is on Sepolia.",
    checklistConfig: lang === "zh" ? "确认前端环境变量中的 Core / OTC / Swap 合约地址已配置。" : "Confirm Core / OTC / Swap contract addresses are configured in the frontend environment.",
    checklistFunds: lang === "zh" ? "确认管理员钱包有足够测试 ETH 支付 Gas。" : "Confirm the admin wallet has enough test ETH for gas.",
    checklistRecords: lang === "zh" ? "执行高风险操作前，先记录当前价格、权限和订单状态。" : "Record current prices, permissions, and order state before high-risk operations.",
    exampleUserTitle: lang === "zh" ? "用户问题处理" : "User Issue Handling",
    exampleUserScene: lang === "zh" ? "用户反馈“无法购买节点 / 推荐人异常”" : "A user reports they cannot buy a node or the referrer state looks wrong.",
    exampleUserGoal: lang === "zh" ? "先判断是钱包、网络、授权还是链上推荐人绑定问题。" : "Determine whether the issue is wallet, network, allowance, or on-chain referrer binding.",
    exampleUserStep1: lang === "zh" ? "先让用户连接钱包并切换到 Sepolia，核对页面顶部状态。" : "Ask the user to connect the wallet and switch to Sepolia, then check the header status.",
    exampleUserStep2: lang === "zh" ? "检查首页中的推荐人来源标签，确认是邀请链接、默认 Owner 还是链上已绑定。" : "Check the referrer source tag on Home to confirm whether it came from invite link, default owner, or on-chain binding.",
    exampleUserStep3: lang === "zh" ? "如用户已绑定推荐人，则无需重复绑定；重点检查 USDT 余额与授权额度。" : "If the referrer is already bound, do not rebind it; focus on USDT balance and allowance instead.",
    exampleUserNote: lang === "zh" ? "推荐人绑定后不可修改，排查时优先确认链上状态，避免误导用户重复提交交易。" : "Referrer binding is immutable, so prioritize checking on-chain state before suggesting new transactions.",
    exampleContractTitle: lang === "zh" ? "参数调整 / 合约维护" : "Parameter Updates / Contract Maintenance",
    exampleContractScene: lang === "zh" ? "准备更新价格、切换市场地址或执行合约升级前检查。" : "Before updating prices, switching market addresses, or running an upgrade precheck.",
    exampleContractGoal: lang === "zh" ? "降低配置错误和升级后前端不可用的风险。" : "Reduce configuration mistakes and post-upgrade frontend failures.",
    exampleContractStep1: lang === "zh" ? "先在测试环境执行预检查脚本，确认 ABI、代理地址和实现地址一致。" : "Run the precheck flow in the test environment and confirm ABI, proxy, and implementation addresses match.",
    exampleContractStep2: lang === "zh" ? "如有地址变更，先同步前端环境变量，再刷新首页、市场页与兑换页。" : "If any address changes, update frontend environment variables first, then refresh Home, Market, and Swap pages.",
    exampleContractStep3: lang === "zh" ? "维护完成后，用 Owner 钱包与普通用户钱包各走一遍关键流程。" : "After maintenance, validate key flows once with the owner wallet and once with a normal user wallet.",
    exampleContractNote: lang === "zh" ? "建议至少回归验证：购买矿机、绑定推荐人、创建挂单、填写挂单、刷新 Swap 报价。" : "At minimum, regression-check machine purchase, referrer binding, order creation, order filling, and swap quote refresh.",
    exampleStatsTitle: lang === "zh" ? "统计与异常监控" : "Analytics and Exception Monitoring",
    exampleStatsScene: lang === "zh" ? "需要判断近期订单、奖励或市场活跃度是否异常。" : "When checking whether recent orders, rewards, or market activity look abnormal.",
    exampleStatsGoal: lang === "zh" ? "快速识别是单个钱包异常，还是全局链上数据问题。" : "Quickly tell whether the anomaly is wallet-specific or a broader on-chain data issue.",
    exampleStatsStep1: lang === "zh" ? "先在“记录”页查看最近订单数、奖励数和授权状态是否同步更新。" : "First inspect recent order count, reward count, and allowance state in the Records tab.",
    exampleStatsStep2: lang === "zh" ? "再切到“市场”页检查挂单列表是否仍可读取，确认不是单页接口异常。" : "Then open Market to verify order listings still load, which helps rule out a single-page issue.",
    exampleStatsStep3: lang === "zh" ? "如多个页面同时异常，优先检查 RPC、合约地址和链上事件读取范围。" : "If several pages fail together, check RPC, contract addresses, and event-query ranges first.",
    exampleStatsNote: lang === "zh" ? "若只有个别钱包数据异常，优先比对该钱包的身份 ID、推荐人、订单 ID 与奖励事件。" : "If only a few wallets are affected, compare their identity ID, referrer, order IDs, and reward events first.",
  };

  const exampleCards = [
    {
      title: t.exampleUserTitle,
      scene: t.exampleUserScene,
      goal: t.exampleUserGoal,
      steps: [t.exampleUserStep1, t.exampleUserStep2, t.exampleUserStep3],
      note: t.exampleUserNote,
    },
    {
      title: t.exampleContractTitle,
      scene: t.exampleContractScene,
      goal: t.exampleContractGoal,
      steps: [t.exampleContractStep1, t.exampleContractStep2, t.exampleContractStep3],
      note: t.exampleContractNote,
    },
    {
      title: t.exampleStatsTitle,
      scene: t.exampleStatsScene,
      goal: t.exampleStatsGoal,
      steps: [t.exampleStatsStep1, t.exampleStatsStep2, t.exampleStatsStep3],
      note: t.exampleStatsNote,
    },
  ];

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
      <Card title={t.adminSummary} hint={t.adminHint}>
        <KVRow label={t.ownerAddress} value={contractOwner} />
        <KVRow label={t.currentAddress} value={address} />
      </Card>

      <Card title={t.adminChecklist} hint={t.checklistHint}>
        <ul className="list">
          <li className="list-item"><p>{t.checklistNetwork}</p></li>
          <li className="list-item"><p>{t.checklistConfig}</p></li>
          <li className="list-item"><p>{t.checklistFunds}</p></li>
          <li className="list-item"><p>{t.checklistRecords}</p></li>
        </ul>
      </Card>

      <section className="grid-full">
        <Card title={t.examplesTitle} hint={t.examplesHint}>
          <div className="grid">
            {exampleCards.map((item) => (
              <Card key={item.title} title={item.title} hint={item.goal}>
                <KVRow label={t.scene} value={item.scene} />
                <KVRow label={t.goal} value={item.goal} />
                <h3>{t.steps}</h3>
                <ul className="list">
                  {item.steps.map((step) => (
                    <li key={step} className="list-item">
                      <p>{step}</p>
                    </li>
                  ))}
                </ul>
                <p className="hint"><strong>{t.note}：</strong>{item.note}</p>
              </Card>
            ))}
          </div>
        </Card>
      </section>

      <Card title={t.userManagement} hint={t.exampleUserTitle}>
        <p className="hint">{t.exampleUserNote}</p>
      </Card>

      <Card title={t.contractManagement} hint={t.exampleContractTitle}>
        <p className="hint">{t.exampleContractNote}</p>
      </Card>

      <Card title={t.statisticsAnalysis} hint={t.exampleStatsTitle}>
        <p className="hint">{t.exampleStatsNote}</p>
      </Card>
    </section>
  );
};

export default Admin;
