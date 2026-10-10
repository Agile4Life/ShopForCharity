import { UserFacingError } from "./user-errors";

let snapshot = { active: 0, writes: 0 };
const listeners = new Set<() => void>();
export const getRequestState = () => snapshot;
export function subscribeRequests(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function withRequestDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, {
  timeoutMs = 15000, signal: externalSignal, write = false, allowOffline = false,
}: { timeoutMs?: number; signal?: AbortSignal | null; write?: boolean; allowOffline?: boolean } = {}): Promise<T> {
  if (!allowOffline && !navigator.onLine) throw new UserFacingError("Không thể kết nối. Kiểm tra mạng rồi thử lại.", "NETWORK_ERROR");
  const controller = new AbortController();
  const abortExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortExternal();
  else externalSignal?.addEventListener("abort", abortExternal, { once: true });
  const timer = window.setTimeout(() => controller.abort(new UserFacingError(
    write ? "Chưa xác nhận được kết quả. Kiểm tra dữ liệu hoặc trạng thái đơn trước khi thử lại."
      : "Phản hồi đang chậm. Kiểm tra kết nối rồi thử tải lại.",
    write ? "WRITE_TIMEOUT" : "REQUEST_TIMEOUT",
  )), timeoutMs);
  snapshot = { active: snapshot.active + 1, writes: snapshot.writes + Number(write) };
  listeners.forEach(listener => listener());
  let stopAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => reject(controller.signal.reason);
      stopAbort = () => controller.signal.removeEventListener("abort", onAbort);
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    stopAbort?.();
    externalSignal?.removeEventListener("abort", abortExternal);
    snapshot = { active: snapshot.active - 1, writes: snapshot.writes - Number(write) };
    listeners.forEach(listener => listener());
  }
}
