# AD MANAGER DEEP RECON (zero edits)

## TARGET 1 — AD PRICE/CHANGE HISTORY LOG (exists)

### Storage
- Table: `public.ad_action_logs` — cols: `id uuid`, `user_id text`, `user_name text`,
  `action_type text`, `adv_no text`, `ad_details jsonb`, `metadata jsonb`, `created_at timestamptz`.
- NO dedicated old→new price columns; everything lives in `ad_details`/`metadata`.

### Write path (all CLIENT-side; edge fn does NOT log)
- Core helper `logAdAction()` — `src/hooks/useAdActionLog.ts:126` inserts into `ad_action_logs`.
  User identity from `getSessionUser()` / localStorage `userSession` (`:97`).
- Ad create: `usePostAd.onSuccess` `src/hooks/useBinanceAds.tsx:229` (AD_CREATED, new price only).
- Ad edit:   `useUpdateAd.onSuccess` `src/hooks/useBinanceAds.tsx:252` (AD_UPDATED, new price only).
- Status:    `useUpdateAdStatus.onSuccess` `src/hooks/useBinanceAds.tsx:277` (metadata.toStatus only).
- Inline edit reuses `useUpdateAd` (InlinePriceEditor) → logs AD_UPDATED but payload only
  {advNo, exchange_account_id, price/ratio} so asset/tradeType absent in ad_details.
- binance-ads edge fn (`supabase/functions/binance-ads/index.ts`): NO ad_action_logs writes.
- Auto/engine changes log to a SEPARATE table `ad_pricing_logs` (auto-price-engine), not here.

### Display path
- `src/pages/terminal/TerminalLogs.tsx` (page, permission `terminal_logs_view`).
- Fetch: `useAdActionLogs({limit:500})` `useAdActionLog.ts` useQuery, order created_at desc.
- Render: `formatDetails()` `TerminalLogs.tsx:74`; filters by category/action/search only.
- Fields shown for ads: type, asset, price, priceMode, floatRatio, qty, min/max, autoReply,
  remarks, status transition, pay methods.
- NOT opened from Ad Manager — no link/button in AdManager.tsx or any ad-manager component
  (grep found zero refs). Only reachable via terminal Logs nav.

### BUGS (concrete)
1. NO old→new price captured. Write path stores only the NEW price (`useBinanceAds.tsx:255`);
   display can never show before-value. Fix: capture prior ad snapshot in mutation vars and
   store `ad_details.oldPrice`/`newPrice`.
2. Status transition never renders. `formatDetails` reads `m.fromStatus`+`m.toStatus`
   (`TerminalLogs.tsx:93`) but `useUpdateAdStatus` only writes `metadata.toStatus`
   (`useBinanceAds.tsx:281`) — `fromStatus` is undefined so the "X → Y" line is dead.
   Fix: pass current advStatus into the mutation and log `fromStatus`.
3. NO account attribution. `exchange_account_id` is known in every mutation
   (`useBinanceAds.tsx:222/247/266`) but never written to the log; in combined multi-account
   mode you cannot tell which Binance account was edited. Fix: add
   `metadata.exchangeAccountId` to logAdAction calls.
4. Silent skip when session missing: `logAdAction` returns early with console.warn
   (`useAdActionLog.ts:135`) → edits by users w/o cached session leave NO audit row.
   Fix: fall back to a server-derived identity or hard-warn.
5. Inline-edit rows produce sparse logs (missing asset/tradeType) because InlinePriceEditor
   sends a minimal payload; display shows almost nothing. Fix: include asset/tradeType in
   the inline payload passed to useUpdateAd.
6. No timezone bug found in write (created_at = DB now(), tz-aware). Verify TerminalLogs
   formatting uses local tz (not audited here) — likely fine.

## TARGET 2 — CACHE-PATCH FEASIBILITY

- `useUpdateAd`/`useUpdateAdStatus` onSuccess call
  `queryClient.invalidateQueries({queryKey:['binance-ads']})` (`useBinanceAds.tsx:250/276`)
  → full refetch today; no setQueryData patch.
- List queryKey: `['binance-ads', accountsToQuery.join(','), filters]`
  (`useBinanceAdsList` `:117`). `accountsToQuery` from `useExchangeAccount()`; `filters` is the
  raw AdFilters object → a precise patch must match the SAME accounts string + filters ref.
- Mutation response (`callBinanceAds` returns `data.data`) is the Binance updateAd result —
  does NOT return a full normalized ad object; only success/echo. To patch a cached row locally
  you'd rely on mutation VARS (advNo, new price/ratio, exchange_account_id), not the response.
- Feasible: setQueriesData with a predicate on queryKey[0]==='binance-ads', map `.data[]`,
  match by advNo (+ _exchangeAccountId), splice new price. Keep invalidate as reconcile.

## TARGET 3 — URL-STATE FEASIBILITY (AdManager.tsx)

- View state a shareable link would encode (all `useState`, localStorage-persisted):
  activeTab (`:66` TAB_PREF_KEY), statusChips Set<number> (`:87` STATUS_CHIPS_PREF_KEY),
  sortMode (`:83` SORT_PREF_KEY), viewMode categorized/desk (`:85` VIEW_PREF_KEY),
  compact density (`:86` DENSITY_PREF_KEY), autoRefresh (`:84`), and `filters` AdFilters
  (`:65`) = {asset, tradeType, advStatus, priceType, startDate, endDate, page, rows}
  edited via AdManagerFilters.
- `useSearchParams` is NOT imported in AdManager.tsx nor any ad-manager component. Precedent
  exists elsewhere (TerminalOrders.tsx:120, StockManagement.tsx:27) but Ad Manager syncs
  NOTHING to the URL today — pure localStorage/useState.
- Feasible: mirror the above into useSearchParams (read on mount → seed state, write on change);
  localStorage stays as the personal default when no query params present.
