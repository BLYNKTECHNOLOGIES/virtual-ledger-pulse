import { useEffect } from "react";

export interface ReceiptData {
  toUpiId: string;
  amount: number;
  paymentProviderFees: number;
  upiTransactionId: string;
  dateTime: string; // ISO
  fromName?: string;
  fromUpiId?: string;
}

const DEFAULT_FROM_NAME = "Blynk Virtual Technologies Pvt. Ltd.";
const DEFAULT_FROM_UPI = "blynkex@aeronflyprivatelimited";

function formatCurrency(val: number): string {
  return "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;
}

/**
 * Pixel-identical replica of the receipt rendered by the Utility Hub
 * "Payment Screenshot Generator" (src/pages/PaymentScreenshotGenerator.tsx).
 * Used by both the manual generator and the auto-screenshot flow.
 * onReady fires once after mount so callers can run html2canvas safely.
 */
export function ReceiptTemplate({ data, onReady }: { data: ReceiptData; onReady?: () => void }) {
  const fromName = data.fromName || DEFAULT_FROM_NAME;
  const fromUpiId = data.fromUpiId || DEFAULT_FROM_UPI;
  const fees = Number(data.paymentProviderFees || 0);
  const totalDebited = Number(data.amount || 0) + fees;

  useEffect(() => {
    // Defer to next paint so layout & fonts settle before capture.
    const t = setTimeout(() => onReady?.(), 60);
    return () => clearTimeout(t);
  }, [onReady]);

  return (
    <div
      style={{
        width: "420px",
        fontFamily: "'Segoe UI', Roboto, sans-serif",
        background: "#ffffff",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #1a9e6f 0%, #2bb87e 50%, #1a8f65 100%)",
          padding: "28px 24px 24px",
          textAlign: "center",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: "13px", opacity: 0.9, marginBottom: "4px" }}>
          To {data.toUpiId}
        </div>
        <div style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          ₹{Number(data.amount || 0).toFixed(2)}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.2)",
            borderRadius: "20px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            marginTop: "10px",
            lineHeight: "1.4",
            textAlign: "center",
            gap: "4px",
          }}
        >
          <span style={{ lineHeight: 1 }}>✓</span>
          <span>Completed</span>
        </div>
        <div style={{ fontSize: "12px", opacity: 0.85, marginTop: "8px" }}>
          {formatDateTime(data.dateTime)}
        </div>
      </div>

      <div style={{ padding: "20px 24px 24px" }}>
        <Row label="To" value={data.toUpiId} bold />
        <Row label="From" value={fromName} bold sub={fromUpiId} />
        <Row label="UPI Transaction ID" value={data.upiTransactionId} small />
        <Row label="Paid Amount" value={formatCurrency(Number(data.amount || 0))} bold />
        {fees > 0 && <Row label="Payment Provider Fees" value={formatCurrency(fees)} />}
        <Row label="Total Debited" value={formatCurrency(totalDebited)} bold last />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  bold,
  small,
  last,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  small?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px",
        padding: "14px 0",
        borderBottom: last ? "none" : "1px solid #f0f0f0",
      }}
    >
      <span style={{ color: "#888", fontSize: "13px", lineHeight: "1.5" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: small ? "12px" : "13px",
            fontWeight: bold ? 600 : 500,
            color: "#222",
            lineHeight: "1.5",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: "11px", color: "#888", marginTop: "4px", lineHeight: "1.5" }}>{sub}</div>}
      </div>
    </div>
  );
}