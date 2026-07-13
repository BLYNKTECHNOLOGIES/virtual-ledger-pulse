UPDATE public.clients
SET phone = NULL,
    updated_at = now()
WHERE phone = '8527966109'
  AND is_deleted = false;

UPDATE public.counterparty_contact_records
SET contact_number = NULL,
    updated_at = now()
WHERE contact_number = '8527966109';

INSERT INTO public.blocked_phone_numbers (phone, reason)
VALUES ('8527966109', 'Shared/incorrect phone removed from multiple unrelated clients; do not reuse for client identity.')
ON CONFLICT (phone) DO UPDATE
SET reason = EXCLUDED.reason;