import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CartItem, ItemKind } from "../../types/api";

const CART_STORAGE_KEY = "school_shop_cart_v1";
const MAX_LINES = 30;
const MAX_QTY_PER_LINE = 20;
const MIN_QTY_PER_LINE = 1;

interface CartContextType {
  items: CartItem[];
  addItem: (item: {
    kind: ItemKind;
    catalogId: string;
    quantity?: number;
    name?: string;
    price?: number;
    imageUrl?: string;
    slug?: string;
    availableStock?: number;
  }) => { success: boolean; message?: string };
  updateQuantity: (
    catalogId: string,
    quantity: number,
    kind?: ItemKind,
  ) => void;
  removeItem: (catalogId: string, kind?: ItemKind) => void;
  restoreItems: (items: CartItem[]) => void;
  clearCart: () => void;
  totalQuantity: number;
  estimatedSubtotal: number;
}

const CartContext = createContext<CartContextType | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setStoredItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_LINES);
        }
      }
    } catch (e) {
      console.error("Failed to load cart from localStorage", e);
    }
    return [];
  });
  const itemsRef = useRef(items);
  const setItems = (next: React.SetStateAction<CartItem[]>) => {
    const updated = typeof next === "function" ? next(itemsRef.current) : next;
    itemsRef.current = updated;
    setStoredItems(updated);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error("Failed to save cart to localStorage", e);
    }
  }, [items]);

  const addItem = ({
    kind,
    catalogId,
    quantity = 1,
    name,
    price,
    imageUrl,
    slug,
    availableStock,
  }: {
    kind: ItemKind;
    catalogId: string;
    quantity?: number;
    name?: string;
    price?: number;
    imageUrl?: string;
    slug?: string;
    availableStock?: number;
  }) => {
    const items = itemsRef.current;
    const maxQuantity = Math.min(MAX_QTY_PER_LINE, availableStock ?? MAX_QTY_PER_LINE);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { success: false, message: "Vui lòng chọn số lượng hợp lệ." };
    }
    const existingIndex = items.findIndex(
      (i) => i.catalogId === catalogId && i.kind === kind,
    );

    if (existingIndex > -1) {
      const existing = items[existingIndex];
      const newQty = existing.quantity + quantity;
      if (newQty > maxQuantity) {
        return {
          success: false,
          message: `Bạn có thể đặt tối đa ${maxQuantity} món này. Hiện đã có ${existing.quantity} trong giỏ.`,
        };
      }
      const updated = [...items];
      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        name: name || existing.name,
        price: price ?? existing.price,
        imageUrl: imageUrl || existing.imageUrl,
        slug: slug || existing.slug,
      };
      setItems(updated);
      return { success: true };
    }

    if (quantity > maxQuantity) {
      return { success: false, message: `Món này chỉ còn tối đa ${maxQuantity} phần có thể đặt.` };
    }
    if (items.length >= MAX_LINES) {
      return {
        success: false,
        message: `Giỏ hàng đã đạt giới hạn tối đa ${MAX_LINES} loại món khác nhau.`,
      };
    }

    const clampedQty = Math.max(
      MIN_QTY_PER_LINE,
      Math.min(MAX_QTY_PER_LINE, quantity),
    );
    setItems([
      ...items,
      {
        kind,
        catalogId,
        quantity: clampedQty,
        name,
        price,
        imageUrl,
        slug,
      },
    ]);
    return { success: true };
  };

  const updateQuantity = (
    catalogId: string,
    quantity: number,
    kind?: ItemKind,
  ) => {
    if (quantity < MIN_QTY_PER_LINE) {
      removeItem(catalogId, kind);
      return;
    }
    const clampedQty = Math.min(MAX_QTY_PER_LINE, quantity);
    setItems((prev) =>
      prev.map((item) =>
        item.catalogId === catalogId && (!kind || item.kind === kind)
          ? { ...item, quantity: clampedQty }
          : item,
      ),
    );
  };

  const removeItem = (catalogId: string, kind?: ItemKind) => {
    setItems((prev) =>
      prev.filter(
        (item) => item.catalogId !== catalogId || (kind && item.kind !== kind),
      ),
    );
  };

  const restoreItems = (removed: CartItem[]) => {
    setItems((prev) => {
      const restored = [...prev];
      for (const item of removed) {
        const index = restored.findIndex(
          (current) =>
            current.catalogId === item.catalogId && current.kind === item.kind,
        );
        if (index >= 0)
          restored[index] = {
            ...restored[index],
            quantity: Math.min(
              MAX_QTY_PER_LINE,
              restored[index].quantity + item.quantity,
            ),
          };
        else if (restored.length < MAX_LINES) restored.push(item);
      }
      return restored;
    });
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
  const estimatedSubtotal = items.reduce(
    (acc, item) => acc + (item.price || 0) * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        restoreItems,
        clearCart,
        totalQuantity,
        estimatedSubtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
