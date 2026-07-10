-- Root cause of forced same-name merges: a unique index on the client NAME among
-- active clients. This blocks two genuinely distinct people who share a KYC name
-- and pushed the creation RPCs into name-mutation / merge behaviour.
--
-- Correct identity key is the Binance userNo (proxied by nickname), which is ALREADY
-- uniquely enforced by public.client_binance_nicknames.unique_nickname. Removing the
-- name-based index lets same-name distinct accounts auto-create as separate clients
-- while nickname uniqueness still prevents duplicating the same account.
DROP INDEX IF EXISTS public.idx_clients_unique_name_active;