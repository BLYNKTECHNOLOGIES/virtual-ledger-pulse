# STATE LOG

Living cross-agent log. **Newest entry at top.** One dated line per event. Prune entries older than 30 days.

Append here whenever the owner commands a significant state change (data wipes, resets, roster changes, config/mode switches, era boundaries) or when a multi-slice arc completes. Both Lovable (in-chat agent) and Claude (external verification agent) write to this file; commit messages carry the technical detail.

---

- 2026-07-18: v4 attendance engine — Phase 0 schema deployed (sessions table, engine settings, punch classification columns); Phases 1–2.5 code deployed but engine unhydrated (punches wiped); Phases 3–7 parked pending Monday's real punches.
- 2026-07-18: Razorpay last-mile — Slices 4 (F&F dismiss with CONFIRM_DISMISS ack) and 5 (attendance verify affordance on Period Lock page) shipped; sandbox host documented in RAZORPAYX_COMMISSIONING.md with manual rehearsal path. Deferred queue: Payroll Adjustments hub, Advance Salary flow (needs hr_loans.razorpay_advance_id), Contractor locked-state polish, in-app sandbox toggle.
- 2026-07-18: Roster changed to 37 employees total (22 active + 15 soft-deleted; was 39). Salary structures = 112 rows (~5 components/active-emp — deliberate per-component shape). Biometric device users unmatched = 21 (17 ghost enrollments with no hr_employees row + 4 dismissed employees; all 22 active fully linked on both devices).
- 2026-07-18: Owner wiped ALL attendance punches / sessions / daily rows deliberately — clean attendance-logic observation starts Monday 2026-07-20. Zero rows in those tables are intentional.
