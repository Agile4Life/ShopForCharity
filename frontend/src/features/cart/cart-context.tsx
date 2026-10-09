import React, { createContext, useContext, useEffect, useState } from "react";
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
  const [items, setItems] = useState<CartItem[]>(() => {
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
  }: {
    kind: ItemKind;
    catalogId: string;
    quantity?: number;
    name?: string;
    price?: number;
    imageUrl?: string;
    slug?: string;
  }) => {
    const existingIndex = items.findIndex(
      (i) => i.catalogId === catalogId && i.kind === kind,
    );

    if (existingIndex > -1) {
      const existing = items[existingIndex];
      const newQty = existing.quantity + quantity;
      if (newQty > MAX_QTY_PER_LINE) {
        return {
          success: false,
          message: `Số lượng tối đa cho mỗi món là ${MAX_QTY_PER_LINE}. Hiện bạn đã có ${existing.quantity} trong giỏ.`,
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
