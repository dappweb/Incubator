import { formatUsdt } from "../lib/usdtContract";

interface CardProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Card = ({ title, hint, children, className = "", onClick, style }: CardProps) => (
  <article className={`card ${className}`} onClick={onClick} style={style}>
    <h2>{title}</h2>
    {hint && <p className="hint">{hint}</p>}
    {children}
  </article>
);

interface KVRowProps {
  label: string;
  value: string | number | bigint | React.ReactNode;
  isUsdt?: boolean;
}

export const KVRow = ({ label, value, isUsdt }: KVRowProps) => (
  <div className="kv-row">
    <span>{label}</span>
    <strong>{isUsdt && typeof value === "bigint" ? formatUsdt(value) + " USDT" : typeof value === "bigint" ? String(value) : value}</strong>
  </div>
);

// Risk Confirmation Modal
interface AllocationPreview {
  lpPool: bigint;
  referralPool: bigint;
  superNodePool: bigint;
  nodePool: bigint;
  platformPool: bigint;
  leaderboardPool: bigint;
}

interface RiskConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  details: {
    quantity: number;
    unitPrice: bigint;
    totalAmount: bigint;
    feePreview: AllocationPreview;
    network: string;
    address: string;
  };
}

export const RiskConfirmationModal = ({
  isOpen,
  onConfirm,
  onCancel,
  details,
}: RiskConfirmationModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content risk-modal">
        <h2>确认购买矿机</h2>

        <div className="modal-section">
          <h3>订单详情</h3>
          <div className="detail-row">
            <span>数量:</span>
            <strong>{details.quantity}</strong>
          </div>
          <div className="detail-row">
            <span>单价:</span>
            <strong>{formatUsdt(details.unitPrice)} USDT</strong>
          </div>
          <div className="detail-row highlight">
            <span>总计:</span>
            <strong>{formatUsdt(details.totalAmount)} USDT</strong>
          </div>
        </div>

        <div className="modal-section">
          <h3>分账预览</h3>
          <table className="allocation-table">
            <tbody>
              <tr>
                <td>LP 池:</td>
                <td className="amount">{formatUsdt(details.feePreview.lpPool)} USDT</td>
                <td className="ratio">(60%)</td>
              </tr>
              <tr>
                <td>直推池:</td>
                <td className="amount">{formatUsdt(details.feePreview.referralPool)} USDT</td>
                <td className="ratio">(5%)</td>
              </tr>
              <tr>
                <td>超级节点池:</td>
                <td className="amount">{formatUsdt(details.feePreview.superNodePool)} USDT</td>
                <td className="ratio">(5%)</td>
              </tr>
              <tr>
                <td>节点池:</td>
                <td className="amount">{formatUsdt(details.feePreview.nodePool)} USDT</td>
                <td className="ratio">(8%)</td>
              </tr>
              <tr>
                <td>平台池:</td>
                <td className="amount">{formatUsdt(details.feePreview.platformPool)} USDT</td>
                <td className="ratio">(20%)</td>
              </tr>
              <tr>
                <td>榜单池:</td>
                <td className="amount">{formatUsdt(details.feePreview.leaderboardPool)} USDT</td>
                <td className="ratio">(2%)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="modal-section">
          <h3>交易信息</h3>
          <div className="detail-row">
            <span>网络:</span>
            <strong>{details.network}</strong>
          </div>
          <div className="detail-row">
            <span>地址:</span>
            <strong className="address">{details.address}</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel} className="secondary-btn">
            取消
          </button>
          <button onClick={onConfirm} className="primary-btn">
            确认购买
          </button>
        </div>
      </div>
    </div>
  );
};
