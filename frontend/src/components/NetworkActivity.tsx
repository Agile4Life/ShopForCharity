import { useEffect, useState, useSyncExternalStore } from "react";
import { LoaderCircle, WifiOff } from "lucide-react";
import { getRequestState, subscribeRequests } from "../lib/request-state";

export function NetworkActivity() {
  const { active, writes } = useSyncExternalStore(subscribeRequests, getRequestState);
  const pending = active > 0;
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    const visibility = setTimeout(() => setVisible(pending), pending ? 500 : 0);
    const slowTimer = setTimeout(() => setSlow(pending), pending ? 8000 : 0);
    return () => { clearTimeout(visibility); clearTimeout(slowTimer); };
  }, [pending]);
  if (offline) return <div className="network-activity network-offline" role="alert"><WifiOff size={18} aria-hidden="true" /><span>Bạn đang mất kết nối. Kiểm tra mạng để tiếp tục.</span></div>;
  if (!visible || !pending) return null;
  return <div className="network-activity" role="status" aria-live="polite" aria-busy="true">
    <LoaderCircle size={18} className="network-activity-spinner" aria-hidden="true" />
    <span>{slow ? "Phản hồi đang chậm. Vui lòng chờ thêm một chút…" : writes ? "Đang xử lý yêu cầu…" : "Đang tải dữ liệu…"}</span>
  </div>;
}
