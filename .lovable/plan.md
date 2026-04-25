# Gap 5 Analysis — Binance `ads/update` Extended Fields

## Verdict

Claude’s finding is partially useful, but it overstates the current gap.

The project is not only using 5 fields. The manual Ad Manager already sends several important `ads/update` fields during edit/create, including:

- `initAmount`
- `minSingleTransAmount`
- `maxSingleTransAmount`
- `tradeMethods`
- `payTimeLimit`
- `advStatus`
- `buyerKycLimit`
- `buyerRegDaysLimit`
- `buyerBtcPositionLimit`
- `takerAdditionalKycRequired`
- `autoReplyMsg`
- `remarks`
- price fields

The real gap is narrower and operationally important:

1. The auto-price engine only updates price/ratio and does not explicitly set `updateMode`.
2. The project does not yet have a controlled way to bulk-tighten Binance buyer/taker requirements during risky windows.
3. Some Binance-supported taker requirement fields are not surfaced in the UI/type model.
4. We should not blindly automate risk tightening until Binance API/proxy support and exact accepted payload rules are verified.

## How this is useful for Blynkex

This can be useful as an operations safety control, not as a fully automatic fraud-score system.

Instead of immediately pausing ads during high-risk periods, authorized terminal managers could apply a “Risk Guard” profile to selected ads:

- Require Binance KYC buyer: `buyerKycLimit = 1`
- Require extra taker KYC: `takerAdditionalKycRequired = 1`
- Require older Binance account: `buyerRegDaysLimit`
- Require buyer BTC holding: `buyerBtcPositionLimit`, if Binance still accepts it
- Tighten completion-rate / completed-trade thresholds only if official API/proxy confirms those fields are accepted
- Optionally reduce max order size through `maxSingleTransAmount`
- Optionally shorten/standardize `payTimeLimit`

This preserves revenue from trusted counterparties while lowering exposure to new or suspicious takers.

## What not to implement in this phase

To stay aligned with your earlier exemptions and Binance-source-of-truth rule, this phase will not implement:

- Automated fraud scoring from chat/order signals
- Auto-applying risk profiles without human approval
- Appeal evidence export
- Compliance-only audit pages
- Dummy/manual fields that Binance does not support

## Implementation Plan

### 1. Validate Binance API and proxy support first

Before changing UI or database workflows, verify the official Binance documentation and the current proxy behavior for `/api/sapi/v1/c2c/ads/update`.

Confirm:

- Exact allowed `updateMode` values: `selective`, `full`, `quickedit`, or whatever Binance currently documents.
- Whether `quickedit` is safe for price-only updates.
- Whether extended taker fields are accepted on `update` or only on `post`.
- Whether `buyerKycLimit`, `buyerRegDaysLimit`, `buyerBtcPositionLimit`, and `takerAdditionalKycRequired` can be changed after ad creation.
- Whether the completion-rate / trade-volume fields listed by Claude are actually accepted by this proxy and account scope.
- Whether omitted fields remain unchanged in `selective`/`quickedit`, or whether Binance expects full ad detail for updates.

If any field is not API/proxy supported, it will be excluded and shown as out of Binance API scope rather than simulated.

### 2. Harden the existing `updateAd` edge function action

Update `supabase/functions/binance-ads/index.ts` so `updateAd` has a safe payload builder instead of forwarding arbitrary `payload.adData` directly.

The builder will:

- Whitelist only Binance-supported update fields.
- Preserve numeric type conversion.
- Reject unknown fields with a clear error in strict modes.
- Support `updateMode` only after validation.
- Default price-only engine updates to the safest verified mode:
  - likely `quickedit` for price-only if confirmed by Binance/proxy;
  - otherwise continue current behavior.
- Continue mapping private ads carefully because project status `2` is synthetic and Binance only accepts native statuses.

### 3. Add `updateMode` to price-only automation

Update `supabase/functions/auto-price-engine/index.ts` so all price-only update calls include a verified lightweight mode.

Example target behavior:

```ts
adData.updateMode = 'quickedit'; // only if officially supported
```

This applies to:

- competitor-based price updates
- resting price/ratio updates
- any other auto-price calls that only change `price`, `priceFloatingRatio`, and `priceType`

This is useful even without dynamic risk controls because it reduces the chance of accidentally overwriting non-price ad settings.

### 4. Extend Ad Manager type model and manual edit support

Update frontend ad models and edit dialog only for fields confirmed from Binance/proxy.

Likely additions:

- `buyerKycLimit`
- `userTradeCompleteRateMin`
- `userTradeCompleteCountMin`
- `userTradeVolumeMin`
- `userTradeVolumeMax`
- `userBuyTradeCountMin`
- `userSellTradeCountMin`
- `userAllTradeCountMin`
- `userAllTradeCountMax`
- `updateMode`

The UI should display unavailable/null Binance-returned fields as “Not returned by Binance” and should not infer defaults.

### 5. Add manual “Risk Guard” bulk profile action

Add a controlled bulk action in Ad Manager for selected ads:

- “Apply Risk Guard”
- “Relax Risk Guard” or “Restore standard filters” only if we store/know the previous Binance values from live ad detail

Initial profile examples:

**Moderate Guard**
- KYC required
- Additional KYC required
- Minimum account age: configurable
- Max order size: configurable

**Strict Guard**
- KYC required
- Additional KYC required
- Higher account age
- Higher completed trade count / completion rate only if API-supported
- Lower max single transaction amount

Important: the first version should be manually triggered by authorized users, not automatically triggered by risk signals.

### 6. Persist risk profile application audit logs

Create a small audit table for operational accountability, not as Binance source-of-truth.

Purpose:

- Who applied a guard profile
- Which ads were targeted
- What payload was sent to Binance
- What Binance returned
- Whether any field was skipped because Binance/proxy did not support it

This table should not replace Binance ad details. Binance remains source of truth.

Suggested table:

```sql
terminal_ad_risk_guard_logs
- id uuid
- actor_user_id uuid
- profile_name text
- adv_nos text[]
- requested_payload jsonb
- accepted_payload jsonb
- skipped_fields jsonb
- binance_response jsonb
- status text
- error_message text
- created_at timestamptz
```

RLS:

- Read: terminal orders/ad-manager/audit permissions
- Insert: service role / authorized edge function only

### 7. Permission gate the feature

Only users with terminal management permissions should apply these changes.

Use existing terminal permission patterns, likely one or more of:

- `terminal_orders_manage`
- `terminal_automation_manage`
- a more specific existing ad-manager permission if present

No client-side-only authorization. Edge function must validate the caller’s JWT and permissions server-side before applying bulk risk guard updates.

### 8. Add safe operator UX

In Ad Manager:

- Show current counterparty conditions per ad where Binance returns them.
- Add a bulk toolbar action for “Risk Guard”.
- Show exactly which Binance fields will be changed before submission.
- Show unsupported fields separately as unavailable.
- Use `AlertDialog`, not `confirm()`.
- Avoid automatic restore unless previous live values are available.

### 9. Verification

After implementation:

- Test one price-only update with `updateMode` in dry/safe mode first.
- Test one selected ad with a minimal confirmed Risk Guard payload.
- Re-fetch `getAdDetail` after update and compare returned fields.
- Confirm unsupported fields are not sent again after failure.
- Confirm audit logs are written with actual actor UUIDs, not hardcoded users.

## Technical files likely affected

- `supabase/functions/binance-ads/index.ts`
- `supabase/functions/auto-price-engine/index.ts`
- `src/hooks/useBinanceAds.tsx`
- `src/components/ad-manager/CreateEditAdDialog.tsx`
- `src/components/ad-manager/BulkActionToolbar.tsx`
- New component for Risk Guard bulk dialog
- New migration for `terminal_ad_risk_guard_logs`, only if implementation confirms bulk guard audit logging is needed

## Expected outcome

The useful implementation is not “use all 27 fields everywhere.”

The useful implementation is:

1. Price automation becomes safer by using verified `updateMode` for price-only edits.
2. Operators get a controlled manual risk-tightening tool for Binance ads.
3. The system respects Binance as source of truth and does not invent unsupported controls.
4. Every risk-control update is auditable and permission-gated.
