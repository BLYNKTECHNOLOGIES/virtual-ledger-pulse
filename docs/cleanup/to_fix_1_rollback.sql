-- Undo the TO-FIX-1 contact clean-up (migration of 15 Oct 2026).
-- Restores the backed-up phone/state only on rows that still hold exactly the value the clean-up wrote,
-- so anything edited since then is left alone. Run manually, only if the owner asks for it.
-- Note: sales_orders has a blocked-phone trigger; if an old value is a blocked number the statement fails
-- and nothing is restored — in that case exclude those rows (join blocked_phone_numbers) and re-run.
BEGIN;

UPDATE public.terminal_sales_sync t
   SET contact_number = b.old_contact_number, state = b.old_state
  FROM public.to_fix_1_cleanup_sync_backup b
 WHERE b.applied AND t.id = b.id
   AND t.contact_number IS NOT DISTINCT FROM b.new_contact_number
   AND t.state IS NOT DISTINCT FROM b.new_state;

UPDATE public.sales_orders s
   SET client_phone = b.old_client_phone, client_state = b.old_client_state
  FROM public.to_fix_1_cleanup_sales_backup b
 WHERE b.applied AND s.id = b.id AND s.client_id IS NOT NULL
   AND s.client_phone IS NOT DISTINCT FROM b.new_client_phone
   AND s.client_state IS NOT DISTINCT FROM b.new_client_state;

COMMIT;
