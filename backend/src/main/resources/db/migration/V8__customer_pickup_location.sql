-- Customer-provided destinations use the order's name/instructions snapshot.
-- Only shop suggestions reference a configured pickup point.
ALTER TABLE shop.orders ALTER COLUMN pickup_point_id DROP NOT NULL;
