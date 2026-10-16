-- Checkout still enforces its own cart quantity limit. Sheet-managed orders can
-- contain larger positive quantities, subject to integer range and available stock.
ALTER TABLE shop.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE shop.order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);
