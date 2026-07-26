# Universal RazorpayX Push Verification

Every write to RazorpayX in HRMS must now flow through the single client entry
point:

```ts
import { pushWithVerification } from "@/lib/pushWithVerification";

const res = await pushWithVerification({
  kind: "salary",              // identity | bank | employment | salary |
                               // statutory | advance_salary | one_time_payment
  hrEmployeeId,
  expectedTotal: 720000,       // salary only
  triggeredFrom: "SalaryRevisionsPage",
});

if (res.overall !== "confirmed") {
  // Diff dialog has already been emitted; toast already shown.
  // The Salary Revision is NOT considered finalized.
}
```

## Contract

- Delegates to the existing typed helpers in `razorpayPushback.ts` /
  `oneTimePayoutPush.ts` — no new proxy round-trip is introduced.
- Waits for `verifyAndFinalize` (read-back) BEFORE returning.
- Result shape is uniform: `{ overall: "confirmed" | "partial" | "failed" |
  "skipped", ok, error, verifiedTotal?, expectedTotal? }`.
- On `partial` / `failed`, the RazorpayPushResultDialog is already dispatched
  via `emitPushResult` and a drift alert is upserted.

## Do NOT

- Call `supabase.functions.invoke("razorpay-payroll-proxy", ...)` from UI
  without wrapping in this helper.
- Treat HTTP 200 from the proxy as success — RazorpayX silently no-ops several
  fields (bank IFSC, phone, locked payroll cycle, etc.) and only the read-back
  proves the write landed.
- Log `status='success'` in `hr_razorpay_pushback_log` before the read-back
  returns `overall='verified'`.
