
-- O2: Add unique constraint on priority per trigger_event + trade_type for active rules only
CREATE UNIQUE INDEX p2p_auto_reply_rules_priority_unique 
ON p2p_auto_reply_rules (trigger_event, trade_type, priority) 
WHERE is_active = true;
