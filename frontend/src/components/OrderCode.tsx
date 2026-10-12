import { Copy } from "lucide-react";
import { notify } from "../lib/feedback";
import { withRequestDeadline } from "../lib/request-state";
import { useState } from "react";

// Visual spacing never changes the real order code used for lookup or payment.
export function OrderCode({ value }: { value: string }) {
  const standard = /^ORD-([A-Z0-9]{8,})$/.exec(value);
  return <span className="readable-order-code">
    {standard ? <><span>ORD-</span>{standard[1].match(/.{1,4}/g)!.map((part, index) => <span key={index}>{part}</span>)}</> : value}
  </span>;
}

export function CopyOrderCode({ value }: { value: string }) {
  const [copying, setCopying] = useState(false);
  return <button type="button" className="copy-order-code" disabled={copying} aria-busy={copying}
    aria-label="Sao chép mã đơn hàng" onClick={async () => {
      setCopying(true);
      try {
        await withRequestDeadline(() => navigator.clipboard.writeText(value), { timeoutMs: 5000, write: true, allowOffline: true });
        notify("Đã sao chép mã đơn hàng.", { tone: "success" });
      } catch { notify("Chưa sao chép được. Bạn có thể chọn và sao chép mã đơn trực tiếp.", { tone: "error" }); }
      finally { setCopying(false); }
    }}><Copy size={16} aria-hidden="true" />{copying ? "Đang sao chép…" : "Sao chép mã"}</button>;
}

export const normalizeOrderCode = (value: string) => value.replace(/\s/g, "").toUpperCase();
