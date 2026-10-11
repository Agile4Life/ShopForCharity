import type { ItemKind } from "../../types/api";

export interface BuyNowItem {
  kind: ItemKind;
  catalogId: string;
  quantity: number;
}

export function getBuyNowItem(state: unknown): BuyNowItem | null {
  if (!state || typeof state !== "object" || !("buyNowItem" in state)) return null;
  const item = state.buyNowItem;
  if (!item || typeof item !== "object") return null;
  if (!("kind" in item) || !("catalogId" in item) || !("quantity" in item)) return null;
  if ((item.kind !== "PRODUCT" && item.kind !== "COMBO") || typeof item.catalogId !== "string" || !item.catalogId
    || typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) return null;
  return { kind: item.kind, catalogId: item.catalogId, quantity: item.quantity };
}
