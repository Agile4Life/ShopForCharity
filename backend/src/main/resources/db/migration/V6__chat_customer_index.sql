-- The shop/customer unique index starts with shop_id. Index customer_id
-- separately for profile foreign-key checks and customer conversation lookup.
CREATE INDEX chat_conversations_customer ON shop.chat_conversations(customer_id);
