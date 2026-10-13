# Supabase migration audit — 2026-10-13 (Asia/Bangkok)

Checked the configured project `htmramdkoevxzjqcpesb` using read-only Supabase queries. Backend and frontend configuration reference this same project.

## Result

All eight repository migrations are recorded in `shop.schema_migrations`. No migration is missing. V1–V3 also have successful legacy Flyway entries with matching Flyway checksums.

| Version | Database evidence |
| --- | --- |
| V1 | All base shop tables exist |
| V2 | Base indexes, foreign keys and check constraints exist |
| V3 | `shop.products.allergens` exists |
| V4 | `shop.rate_limit_windows` and `rate_limit_window_expiry` exist |
| V5 | Chat conversations, messages and reads exist with indexes, RLS and runtime policies |
| V6 | `chat_conversations_customer` exists |
| V7 | `order_email_outbox`, pending index, RLS and runtime policy exist |
| V8 | `orders.pickup_point_id` accepts null for customer-provided destinations |

Supabase's own migration history records chat, its customer index, order email, seller notification realtime and customer pickup changes. V1–V4 were applied through the project's migration system, so that Supabase history alone is not the full inventory.

The chat and seller notification broadcast triggers are enabled. Their private authorization functions and `realtime.messages` receive policies exist. `shop_runtime` has the required rate-limit and order-email permissions, and only SELECT/INSERT on payment events and payment setting versions. `anon` and `authenticated` have no usage privilege on the private `shop` schema. A bank account is configured.

## Checksum formatting difference

Raw SHA-256 checksums match for V1, V5, V6 and V7. V2, V3, V4 and V8 differ from the local raw file hash, but match exactly after changing only line endings:

- V2/V3: database history matches the CRLF form; local files use LF.
- V4/V8: database history matches the LF form; local files use CRLF.

This is a file-format difference, not evidence of missing migrations. The current Node migration runner hashes raw SQL bytes and rejects such differences, so running `npm --prefix backend run migrate` from this checkout may fail at V2 even though the schema is current. No database migration, history update or data change was performed during this audit.

The bank-transfer checkout change does not add or modify database schema and requires no new migration.
