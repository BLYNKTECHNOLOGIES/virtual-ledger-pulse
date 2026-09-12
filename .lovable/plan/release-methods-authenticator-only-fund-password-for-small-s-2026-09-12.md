# Release methods: Authenticator only + Fund Password for small sales

## What changes for operators

1. **Email OTP and SMS OTP are removed everywhere.** Both release dialogs (Release and Quick Receive) will no longer offer them, and the backend will reject them outright, so nobody can reach them by any route.
2. **Authenticator (Google 2FA) stays the universal method** for every order.
3. **Fund Password becomes a second method, but only for orders inside the small-sales band.** For any order outside the band the option simply does not exist — no greyed-out entry, no hint, no "increase your range" message. It looks exactly like a normal Authenticator-only dialog.
4. **Operators never see or type the fund password.** They pick "Fund Password", confirm, and the server does the rest. The password itself is stored as a server-side secret.
5. YubiKey stays as-is (unchanged, still non-functional on Binance's side — no new claims made about it).

## Rigidity (the important part)

The band check is enforced **server-side, independently of the browser**:

- When a fund-password release is requested, the edge function ignores any amount/side sent by the browser. It re-reads the order from Binance (`getOrderDetail`) and reads the band from `small_sales_config` directly in the database.
- Release proceeds only if: side is SELL, total price is a finite positive number, a band is configured, and the price falls inside `min_amount…max_amount` (inclusive).
- Any failure — out of band, unknown amount, band not configured, wrong side, order not found — returns one flat, identical response: "Fund password release is not available for this order." No amounts, no thresholds, no band values, no distinction between reasons. Logs keep the real reason server-side for audit.
- The UI applies the same check for display only, using the shared `isSmallTradeOrder` helper, so the option is hidden rather than merely disabled.

## Technical notes

**Frontend**
- `src/components/terminal/orders/OrderActions.tsx` and `src/components/terminal/orders/QuickReceiveDialog.tsx`: drop `EMAIL`/`SMS` from `AuthMethod` and the options list, remove the "send code" affordance and its copy; add a `FUND_PWD` option that is appended only when `isSmallTradeOrder({ tradeType, totalPrice }, bands)` is true using `useSmallTradeBands()`. Fund-password mode shows a confirm step instead of a code input.
- `src/hooks/useBinanceActions.tsx`: remove `emailVerifyCode`/`mobileVerifyCode` from the release + check payload types, delete `useSendReleaseVerifyCode`, allow `authType: 'FUND_PWD'` with no client-side code field.

**Edge function `supabase/functions/binance-ads/index.ts`**
- `releaseCoin` / `checkIfCanRelease`: stop forwarding `emailVerifyCode` / `mobileVerifyCode`; reject those authTypes.
- Retire the `sendVerifyCode` case (already unsupported by the proxy).
- New `FUND_PWD` path, in order: permission check → fetch order detail from Binance → band gate against `small_sales_config` → `GET /sapi/v1/c2c/cryptography/rsa-public-key` → RSA-OAEP SHA-256 encrypt the fund password from the secret → `POST /sapi/v1/c2c/orderMatch/releaseCoin` with `authType: "FUND_PWD"`, encrypted `code`, `orderNumber`, and `confirmPaidType: "normal"`. `quick` is never sent.
- Multi-account: the fund password resolves per exchange account (Blynk = `default`, ASEC = `acct2`) via the existing credential-key convention.

**Secrets**
- The fund password must be saved as a server-side secret before this can run. I'll request it through the secure secret form — never in chat, never in code.

## Out of scope for now

Amount ceilings, dual approval, dry-run mode, biometric step-up, office-network restriction, and dedicated audit tables from the earlier analysis are deferred; existing release audit logging is kept.
