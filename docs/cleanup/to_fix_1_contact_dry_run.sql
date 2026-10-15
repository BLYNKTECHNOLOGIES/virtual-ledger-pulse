-- TO-FIX-1 clean-up DRY RUN (read-only). Lists every terminal_sales_sync / sales_orders row
-- whose phone/state may have been overwritten by the old 3-letter nickname-prefix propagation.
-- Own record = counterparty_contact_records keyed by the row's exact unmasked nickname
-- (order_data.counterparty_nickname_unmasked, else cp_order_identity.nickname). Masked keys ignored.
-- sales_orders fallback = the linked client master (clients.phone / clients.state by client_id).
-- Categories (phone and state judged separately, row category = worst of the two):
--   correct   : a reliable value exists and differs from the current one
--   clear     : no reliable value, and the current value is another counterparty's record (contamination)
--   untouched : current already equals the reliable value, is empty, or cannot be shown to be wrong
-- Replace the final SELECT with the commented summary to get counts.
WITH rec AS (
  SELECT counterparty_nickname nick, nullif(btrim(contact_number),'') phone, nullif(btrim(state),'') state
  FROM counterparty_contact_records WHERE counterparty_nickname NOT LIKE '%*%'
),
phone_owners AS (SELECT phone, array_agg(nick) nicks FROM rec WHERE phone IS NOT NULL GROUP BY phone),
state_known AS (SELECT 1),
ts AS (
  SELECT t.id, t.binance_order_number, t.sales_order_id,
         nullif(btrim(t.contact_number),'') cur_phone, nullif(btrim(t.state),'') cur_state,
         coalesce(nullif(t.order_data->>'counterparty_nickname_unmasked',''), nullif(c.nickname,'')) nick
  FROM terminal_sales_sync t LEFT JOIN cp_order_identity c ON c.order_number = t.binance_order_number
),
ts_eval AS (
  SELECT ts.*, r.phone own_phone, r.state own_state,
    CASE WHEN ts.cur_phone IS NULL THEN 'untouched'
         WHEN r.phone IS NOT NULL AND r.phone <> ts.cur_phone THEN 'correct'
         WHEN r.phone IS NULL AND EXISTS (SELECT 1 FROM phone_owners p WHERE p.phone = ts.cur_phone AND NOT (ts.nick = ANY(p.nicks))) THEN 'clear'
         ELSE 'untouched' END phone_cat,
    CASE WHEN ts.cur_state IS NULL THEN 'untouched'
         WHEN r.state IS NOT NULL AND r.state <> ts.cur_state THEN 'correct'
         WHEN r.state IS NULL AND r.nick IS NULL AND ts.cur_phone IS NOT NULL
              AND EXISTS (SELECT 1 FROM phone_owners p WHERE p.phone = ts.cur_phone AND NOT (ts.nick = ANY(p.nicks))) THEN 'clear'
         ELSE 'untouched' END state_cat
  FROM ts LEFT JOIN rec r ON r.nick = ts.nick
),
so_eval AS (
  SELECT s.id, s.order_number, nullif(btrim(s.client_phone),'') cur_phone, nullif(btrim(s.client_state),'') cur_state,
         e.nick, e.own_phone, e.own_state,
         coalesce(e.own_phone, nullif(btrim(cl.phone),'')) proposed_phone,
         coalesce(e.own_state, nullif(btrim(cl.state),'')) proposed_state
  FROM sales_orders s
  JOIN ts_eval e ON e.sales_order_id = s.id
  LEFT JOIN clients cl ON cl.id = s.client_id
),
so_cat AS (
  SELECT so_eval.*,
    CASE WHEN cur_phone IS NULL THEN 'untouched'
         WHEN proposed_phone IS NOT NULL AND proposed_phone <> cur_phone THEN 'correct'
         WHEN proposed_phone IS NULL AND EXISTS (SELECT 1 FROM phone_owners p WHERE p.phone = cur_phone AND NOT (coalesce(nick,'') = ANY(p.nicks))) THEN 'clear'
         ELSE 'untouched' END phone_cat,
    CASE WHEN cur_state IS NULL THEN 'untouched'
         WHEN proposed_state IS NOT NULL AND proposed_state <> cur_state THEN 'correct'
         ELSE 'untouched' END state_cat
  FROM so_eval
)
SELECT 'terminal_sales_sync' tbl, id, binance_order_number order_no, cur_phone, cur_state, own_phone, own_state,
       CASE phone_cat WHEN 'correct' THEN own_phone WHEN 'clear' THEN NULL ELSE cur_phone END proposed_phone,
       CASE state_cat WHEN 'correct' THEN own_state WHEN 'clear' THEN NULL ELSE cur_state END proposed_state,
       phone_cat, state_cat
FROM ts_eval WHERE phone_cat <> 'untouched' OR state_cat <> 'untouched'
UNION ALL
SELECT 'sales_orders', id, order_number, cur_phone, cur_state, own_phone, own_state,
       CASE phone_cat WHEN 'correct' THEN proposed_phone WHEN 'clear' THEN NULL ELSE cur_phone END,
       CASE state_cat WHEN 'correct' THEN proposed_state ELSE cur_state END,
       phone_cat, state_cat
FROM so_cat WHERE phone_cat <> 'untouched' OR state_cat <> 'untouched';
-- Summary:
-- SELECT tbl, CASE WHEN 'correct' IN (phone_cat,state_cat) THEN 'correct' WHEN 'clear' IN (phone_cat,state_cat) THEN 'clear' ELSE 'untouched' END cat, count(*) ...
