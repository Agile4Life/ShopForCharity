-- Export receipts survive manual edits and row moves without adding Sheet columns.
CREATE TABLE shop.order_sheet_exports (
  spreadsheet_id text NOT NULL,
  tab_name text NOT NULL,
  order_id uuid NOT NULL REFERENCES shop.orders(id) ON DELETE CASCADE,
  row_fingerprint text NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (spreadsheet_id, tab_name, order_id)
);
CREATE INDEX order_sheet_exports_order ON shop.order_sheet_exports(order_id);
ALTER TABLE shop.order_sheet_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop.order_sheet_exports FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='shop_runtime') THEN
    GRANT SELECT, INSERT ON shop.order_sheet_exports TO shop_runtime;
    CREATE POLICY sheet_export_runtime ON shop.order_sheet_exports TO shop_runtime
      USING (true) WITH CHECK (true);
  END IF;
END $$;
