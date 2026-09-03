# Why Abhishek's CTC shows "verified" then "still different"

## What actually happens (verified from live data, 04 Sep 2026 IST)

Two parts of HRMS answer the same question with opposite rules:

1. **The push verifier** (`razorpayVerify` → salary): RazorpayX's `people:view` never returns CTC, and the payroll probe for badge 21 fails with
   `RPERR @ payroll:view-payroll@2026-05 — Trying to access array offset on value of type null` (no executed payroll run for that employee yet).
   So the verifier logs: *"RazorpayX doesn't expose CTC via read API until the first payroll run — treated as confirmed based on the successful push"* → `overall: verified` → green toast.
   The push log for badge 21 confirms this: `push_salary_apply_one` = `pushed`, `erp_total 120000`, status `success`, five times in a row at 18:48–18:49 UTC (00:18–00:19 IST).

2. **The drift scanner** (`hr-drift-scan`, field `annual_ctc`, `missingIsDrift: true`): it reads RazorpayX CTC **only** from `last_pull_snapshot.__salary`, which is empty for the same reason. It therefore records `Razorpay (missing)` and re-raises the alert immediately after the push → red toast *"Annual CTC is still different in RazorpayX"*.

So nothing is broken in the actual write — the ₹1,20,000 structure was accepted. The two verification contracts simply disagree, and the pessimistic one runs last.

## The fix

Make the drift scanner honour the same, already-doctrine rule the verifier uses: **a value RazorpayX's read API cannot expose is not evidence of drift when a verified push proves it landed.**

In `supabase/functions/hr-drift-scan/index.ts`:

- Load, for the scanned employees, the latest `hr_razorpay_pushback_log` row with `action = 'verify_salary'`, `status = 'success'`, and read the `expected` CTC out of its `response_snapshot.fields[annual_ctc]`.
- Pass it into the field context as `salaryPush`.
- In the `annual_ctc` spec: if RazorpayX CTC is unavailable **and** the snapshot carries `__salary_probe_error` (i.e. the API genuinely cannot expose it) **and** a verified push exists whose expected CTC equals the HRMS CTC (±₹1) → report `razorpay` as equal to `hrms` so the alert auto-resolves, with the resolution note recording that it was confirmed by verified push, not by read-back.
- If RazorpayX **does** expose a CTC and it differs → unchanged, still a real drift.
- If there is no verified push and no exposed CTC → unchanged, still a real drift (that is the genuine "₹0 in RazorpayX" gap the check was added for).

In `src/pages/horilla/DataHealthPage.tsx`: when the post-push scan leaves the alert open only because the read API cannot expose the field, show the honest wording ("pushed and accepted; RazorpayX exposes CTC only after the first payroll run") instead of the flat red "still different".

## Verification before reporting done

- Redeploy `hr-drift-scan`, run it scoped to Abhishek (badge 21) and Ishank (25) with `max_age_hours: 0`, and confirm via SQL that the `annual_ctc` alerts are resolved with the new note while employees with a genuinely missing RazorpayX CTC and no verified push keep their alerts.
- Append a dated IST line to `docs/STATE_LOG.md`.

## Note

RazorpayX exposing CTC only after an executed payroll run is an API limitation, not something HRMS can work around — labelled **Out of Razorpay API Scope / Limitation**. No simulated CTC value is written anywhere.
