---
name: Leaver days after LWD are deducted by HRMS
description: RazorpayX pays a leaver the full month until dismissed; HRMS stages post-LWD calendar days as LOP
type: feature
---
Owner ruling 12-Oct-2026. Leavers are dismissed in RazorpayX only AFTER the final payroll, so RazorpayX still pays the whole relieving month.
Auto-LOP (Step 4) stages a separate line `Loss of Pay - After last working day — N days` (source `auto_post_lwd`):
N = calendar days in the month after the LWD; amount = monthly gross ÷ calendar days × N (same rate as attendance LOP).
Skipped when the person is already dismissed in RazorpayX. Joiners are untouched (RazorpayX prorates them itself).
Verified against Sep-2026 hand fixes: Satyam ₹11,500 (23 days), Archita 18 days.
