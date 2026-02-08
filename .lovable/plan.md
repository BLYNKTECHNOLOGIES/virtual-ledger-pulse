

## Update Binance Proxy URL to New Instance

The proxy is confirmed running on the new AWS Lightsail instance at **3.108.216.64**.

### What needs to change

Update **1 secret** in Supabase:

- **BINANCE_PROXY_URL**: Change from `http://15.207.130.99:3000` to `http://3.108.216.64:3000`

The other 3 secrets (BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_PROXY_TOKEN) remain unchanged since you're using the same credentials.

### Steps

1. Update the `BINANCE_PROXY_URL` secret to `http://3.108.216.64:3000`
2. Redeploy all Binance-related edge functions so they pick up the new secret value:
   - `binance-ads`
   - `auto-reply-engine`
   - Any other functions referencing the proxy
3. Test by loading the Ads page to confirm connectivity (no more "Connection timed out" errors)

### No code changes needed

All edge functions already reference `BINANCE_PROXY_URL` dynamically via `Deno.env.get()`, so only the secret value needs updating.

