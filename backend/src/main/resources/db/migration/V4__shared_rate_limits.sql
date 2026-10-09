CREATE TABLE shop.rate_limit_windows (
  key_hash text PRIMARY KEY,
  minute bigint NOT NULL,
  count bigint NOT NULL
);
CREATE INDEX rate_limit_window_expiry ON shop.rate_limit_windows(minute);
