# Edge function rules

- Background Binance jobs with verify_jwt=false accept only the service role or the internal_cron scheduler secret (_shared/require-scheduler.ts); cron/trigger callers build headers with public.internal_cron_headers() so the secret is never pasted into job SQL.
