import { userErrorMessage } from "./user-errors";

export type Feedback = {
  message: string;
  tone?: "error" | "success";
  action?: { label: string; onClick: () => void };
  to?: string;
};
const reported = new WeakSet<object>();
let queue: Feedback[] = [];
const listeners = new Set<() => void>();
export const getFeedbackQueue = () => queue;
export function subscribeFeedback(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function dismissFeedback() {
  queue = queue.slice(1);
  listeners.forEach(listener => listener());
}

export function notify(message: string, options: Omit<Feedback, "message"> = {}) {
  if (queue[0]?.message === message && queue[0]?.tone === options.tone) return;
  const detail = { message, ...options };
  queue = [detail];
  listeners.forEach(listener => listener());
  window.dispatchEvent(new CustomEvent<Feedback>("shop-feedback", { detail }));
}

export function notifyError(error: unknown, fallback?: string) {
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  notify(typeof error === "string" ? error : userErrorMessage(error, fallback), { tone: "error" });
}
