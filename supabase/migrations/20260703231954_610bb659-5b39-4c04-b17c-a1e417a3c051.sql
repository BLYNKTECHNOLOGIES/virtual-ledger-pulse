-- TEMPORARY: remove DB-level PAN format guard so TDS payments on legacy rows can proceed.
-- PAN format is still enforced in the UI at every input point (terminal chat, purchase approval,
-- manual purchase entry, new client dialog). Re-enable these triggers when instructed.
DROP TRIGGER IF EXISTS trg_validate_pan_tds_records ON tds_records;
DROP TRIGGER IF EXISTS trg_validate_pan_purchase_orders ON purchase_orders;