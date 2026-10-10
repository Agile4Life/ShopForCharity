import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, ShoppingCart } from "lucide-react";
import { getComboDetail, getProductDetail } from "../catalog/api";
import { notify } from "../../components/Usability";
import { ApiError } from "../../lib/api-client";
import { useCart } from "./cart-context";
import type { ItemKind } from "../../types/api";

export function AddToCartButton({
  kind, catalogId, name, quantity = 1, disabled = false,
  className = "btn-primary", compact = false,
}: {
  kind: ItemKind;
  catalogId: string;
  name: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const { addItem } = useCart();
  const [state, setState] = useState<"idle" | "loading" | "added">("idle");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (state !== "added") return;
    const timer = window.setTimeout(() => setState("idle"), 1200);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function add() {
    if (busy.current || disabled) return;
    busy.current = true;
    setState("loading");
    try {
      // Verify current availability and price before saving the cart locally.
      const signal = AbortSignal.timeout(15000);
      const item = await (kind === "PRODUCT" ? getProductDetail(catalogId, signal) : getComboDetail(catalogId, signal));
      if (!mounted.current) return;
      if (item.isSoldOut || item.availableStock <= 0) throw new Error("Món này vừa hết hàng. Bạn chọn món khác nhé.");
      const result = addItem({ kind, catalogId, quantity, name: item.name,
        price: item.price, imageUrl: item.imageUrl, slug: item.slug,
        availableStock: item.availableStock });
      if (!result.success) throw new Error(result.message || "Chưa thể thêm món vào giỏ.");
      setState("added");
      notify(`Đã thêm ${quantity} × ${item.name} vào giỏ.`, { tone: "success", to: "/cart" });
    } catch (error) {
      if (!mounted.current) return;
      setState("idle");
      const message = error instanceof ApiError && error.status === 404
        ? "Món này đã ngừng bán. Bạn chọn món khác nhé."
        : error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
          ? "Chưa kết nối được gian hàng. Kiểm tra mạng và thử lại nhé."
          : error instanceof Error ? error.message : "Chưa thể thêm món. Vui lòng thử lại.";
      notify(message, { tone: "error" });
    } finally {
      busy.current = false;
    }
  }
  const label = kind === "COMBO" ? "Thêm combo vào giỏ" : "Thêm vào giỏ";
  return (
    <button type="button" className={`${className} add-to-cart-button`}
      disabled={disabled || state === "loading"} aria-busy={state === "loading"}
      aria-label={compact ? `Thêm ${name} vào giỏ` : undefined}
      data-cart-state={state} onClick={add}>
      {state === "loading" ? <LoaderCircle size={compact ? 23 : 18} className="cart-loading-icon" aria-hidden="true" />
        : state === "added" ? <Check size={compact ? 23 : 18} aria-hidden="true" />
          : compact ? <Plus size={23} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
      {!compact && <span>{state === "loading" ? "Đang thêm…" : state === "added" ? "Đã thêm vào giỏ" : label}</span>}
    </button>
  );
}
