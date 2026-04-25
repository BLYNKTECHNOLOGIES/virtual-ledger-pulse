## Assessment

Claude’s finding is useful and likely correct.

Current code has `getUserDetail` calling:

```text
POST /sapi/v1/c2c/user/userDetail
```

But the documented SAPI v7.4 endpoint is:

```text
POST /sapi/v1/c2c/user/baseDetail
```

I confirmed the project currently uses `user/userDetail` in `supabase/functions/binance-ads/index.ts`, and the frontend hook `useBinanceUserDetail()` calls this action. I did not find any UI consuming this hook directly right now, so the immediate impact may be limited, but it is still a high-priority correctness issue because merchant/account visibility should not rely on an undocumented alias or broken endpoint.

## Why this matters for our workflow

This data is not just “profile data.” In our Terminal operations, Binance merchant state matters for:

- Confirming the API key is valid and has the expected C2C permissions.
- Detecting if our merchant/account metadata is unavailable due to endpoint, proxy, IP whitelist, or permission problems.
- Avoiding false confidence where the UI silently treats empty/fallback user detail as normal.
- Supporting future merchant health, compliance, and automation diagnostics.

This should be treated as an API correctness and observability fix, not as a new speculative feature.

## Binance API scope decision

This is within Binance API scope if `baseDetail` is present in the official document and supported by the proxy. We should not build fake fallback data. If the proxy does not support `baseDetail`, the UI/API should show a clear “proxy endpoint unsupported” or permission error instead of masking it.

## Implementation plan

### 1. Correct the endpoint

Update the `getUserDetail` action in `supabase/functions/binance-ads/index.ts` from:

```text
/api/sapi/v1/c2c/user/userDetail
```

to:

```text
/api/sapi/v1/c2c/user/baseDetail
```

Keep method as `POST`, matching the documented endpoint.

### 2. Add strict response validation

For `getUserDetail`, do not accept empty, HTML, 404, or undocumented responses as valid.

Expected behavior:

- HTTP/proxy failure: return `success: false` with a clear proxy message.
- Binance error code: return `success: false` with Binance message/code.
- Empty or malformed data: return `success: false` with “Binance baseDetail returned no usable user data.”
- Valid documented data: return `success: true` and the raw Binance response data.

### 3. Preserve no-fallback rule

Do not create placeholder merchant profile data.
Do not infer merchant status from other endpoints.
Do not silently convert failure into `{}`.

The source of truth remains Binance `baseDetail` only.

### 4. Add endpoint diagnostics metadata

Include lightweight debug metadata in the successful/failed action result, for example:

```text
endpoint: /sapi/v1/c2c/user/baseDetail
method: POST
httpStatus: <status>
```

This helps future debugging without exposing secrets.

### 5. Verify proxy compatibility

After implementation, test through the deployed edge function/proxy path:

- Call `binance-ads` with action `getUserDetail`.
- Confirm the proxy returns HTTP 200 and Binance code `000000`, or capture the exact proxy/Binance error.
- Check edge logs for `baseDetail` usage, not `userDetail`.

If `baseDetail` fails due to proxy routing, the next required action is a proxy route update, not UI workaround.

### 6. Improve frontend error handling for this hook

Update `useBinanceUserDetail()` only as needed to ensure failures surface cleanly wherever it is used now or later:

- React Query should receive a real thrown error from `callBinanceAds`.
- No UI should treat missing user detail as normal merchant state.
- If added to a profile/diagnostic card later, show a clear unavailable/error state.

### 7. Optional operational improvement

If the endpoint works, add a small “Binance Account Health” diagnostic card in the Terminal/Profile area later, showing:

- Merchant/user identity fields returned by Binance.
- Last successful refresh time.
- API/proxy status.
- Permission/IP error if Binance returns `-2015`.

This should be secondary and only after endpoint validation succeeds.

## Files likely to change

- `supabase/functions/binance-ads/index.ts`
- Possibly `src/hooks/useBinanceActions.tsx` if the hook needs clearer typing or error semantics
- Possibly a small Terminal/Profile diagnostic UI component only if we confirm where user detail should be surfaced

## Verification checklist

- `getUserDetail` calls `/sapi/v1/c2c/user/baseDetail`.
- Edge function logs no longer show `/user/userDetail`.
- Failure from Binance/proxy is visible, not swallowed.
- No fake or inferred Binance user data is introduced.
- If proxy lacks the route, implementation reports that as a real integration blocker.