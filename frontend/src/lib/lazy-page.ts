import { lazy, type ComponentType } from "react";
import { withRequestDeadline } from "./request-state";

export function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  // A missing/stalled page bundle must leave Suspense and reach the route's retry UI.
  // Cached modules and local clipboard actions may still work offline.
  return lazy(() => withRequestDeadline(() => load(), { allowOffline: true }));
}
