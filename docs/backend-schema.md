# Persistent model and transaction boundaries

Flyway migrations are the source of truth; schema `shop` is excluded from Supabase Data API. UUID PKs, UTC timestamptz, BigDecimal/numeric(14,0), text enum CHECK constraints. Every entity carries optimistic `version`, createdAt and updatedAt. API never serializes entities directly.

| Aggregate | Owned/related tables | References and rules |
| --- | --- | --- |
| Shop | shops, categories, pickup_points, payment_settings_versions | One configured shop; current bank version points to immutable settings, which reference private QR asset |
| Identity | profiles | auth_user_id UNIQUE; business role CUSTOMER/SELLER; no FK cascade from external auth.users; no passwords |
| Catalog | products, combos, combo_items, assets | Scoped to shop; unique slug; exactly product components in combo; category/assets checked against configured shop |
| Inventory | product_inventory, stock_reservations, inventory_movements | Inventory `id` is product UUID PK/FK (equivalent to spec product_id); 0 ≤ reserved ≤ on_hand; order/product reservation UNIQUE; held settles once |
| Order | orders, order_items, order_item_components | Customer nullable; contact/catalog/pickup/bank snapshots; each item references exactly one product/combo; component snapshot drives history; no order item edits |
| Workflow | order_contact_attempts, order_status_history | Contact attempts restricted to seller; customer sees status history only; terminal states cannot reopen |
| Payment | payment_events | Append-only; unique non-null bank reference per shop; receivedAmount aggregates actual receipt deltas; refund requires actual received amount |
| Seller events | notifications, audit_logs | Per-seller notification scope; immutable audit records; audit failure rolls back business write |
| Replay | idempotency_keys | UNIQUE(caller_scope_hash,key); hash includes payload; AES-GCM encrypted response; expires at 48h |

All shop mutations lock the configured shop first, then aggregate rows and inventory UUID ascending. The scheduler and cleanup use the same first lock. Shared coarse lock coordinates multiple JVMs and price/combo edits with checkout. Account registration profile upsert also holds it, avoiding duplicate profile races. Polling reads return DTOs; order lists use scalar summaries, product lists prefetch inventory/categories/assets, combo lists batch components and product rows; dashboard computes DB aggregates.

Creation transaction: validate replay → shop/pickup/quote → canonical catalog expansion → sorted stock locks → order and snapshots → HELD reservations and stock movements → audit/notifications → encrypted replay result → commit. No Storage side effects occur here. Completion consumes HELD stock; cancellation/rejection/expiry releases HELD stock; payment state and refund events remain in the same transaction.

App enforces same-shop references and business transitions. SQL adds FKs, uniqueness, amounts, quantity and inventory checks; service validates at least one item and at least two distinct combo components. Public grants are revoked. Runtime role permits SELECT/INSERT only on audit/payment/history/movement/contact/bank-version tables; schema/migration owner handles maintenance. A DB owner can bypass runtime permissions, so production owner credentials must not run the application.
