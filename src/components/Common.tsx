import { formatUsdt } from "../lib/usdtContract";

interface CardProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ title, hint, children, className = "" }: CardProps) => (
  <article className={`card ${className}`}>
    <h2>{title}</h2>
    {hint && <p className="hint">{hint}</p>}
    {children}
  </article>
);

interface KVRowProps {
  label: string;
  value: string | number | React.ReactNode;
  isUsdt?: boolean;
}

export const KVRow = ({ label, value, isUsdt }: KVRowProps) => (
  <div className="kv-row">
    <span>{label}</span>
    <strong>{isUsdt && typeof value === "bigint" ? formatUsdt(value) + " USDT" : value}</strong>
  </div>
);
