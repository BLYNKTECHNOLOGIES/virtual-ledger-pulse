# August 2026 LOP reconciliation — HRMS vs HR sheet

I compared your HR manager's `August_2026.csv` against the HRMS export `lop_breakdown_2026-08-2.csv` row by row (41 employees, all names/badges match on both sides) and checked every disputed figure against the live database.

## What actually differs (and who is right)

| # | Difference | Verdict |
| - | ---------- | ------- |
| 1 | **Per-day rate**: HRMS divides the monthly base by 24 working days; HR divides by 31 calendar days. Affects all 41 rows. | HR is right — you confirmed calendar-day divisor. HRMS over-charges every LOP day by ~29%. |
| 2 | **Training-stipend base**: HRMS used master CTC/12 (Dilkhush 13,000 · Jay 14,000 · Devang 16,000 · Satyam 15,000 · Priya 33,500); HR used the stipend actually paid (10,000 / 10,000 / 10,000 / 12,903 / 34,995). | HR is right on principle — LOP must be charged on what is actually paid that month. Priya 34,995 and Satyam 12,903 still need a source check (they look like already-prorated amounts, not a base). |
| 3 | **Mid-month joiners (17 Aug)** — Khurram, Abhishek dev, Neelanchal, Urvashi, Harmeet, Ishank. HRMS charges 12 *working* pre-joining days as LOP; HR charges 16–17. | Both are internally inconsistent once the divisor is calendar-based. Correct answer: with a ÷31 rate, unserved days must be counted in **calendar** days (1–16 Aug = 16 days), and the joining day itself stays payable. |
| 4 | **CL / comp-off absorption not shown in the ledger**: Honey, Poonam, Priya, Aarti, Amit, Archita, Khushbu, Kunal, Meenu, Sushil, Himanshu, Virendra etc. show `CL used 0 / CL balance 2` in HRMS while the same row reports `CL set-off (auto) 2`. Verified in the DB (`hr_leave_month_breakdown`): the auto-absorption is only written when rows are *staged*, so the preview ledger shows pre-absorption balances. | **Genuine HRMS bug.** Closing CL/CO balances are overstated in preview and in the export. HR's hand-corrected numbers are the true post-absorption position. |
| 5 | **Lokesh Magarde**: HR charges 7 LOP days against a raw LOP of 4 with 2 comp-off set off; HRMS charges 2. | **HR is wrong here** — 7 cannot be derived from the attendance. HRMS's 2 stands unless attendance is corrected. |
| 6 | **Uday Raj Madhoriya**: HRMS charges 3 LOP days and consumes 2 comp-off as "used"; HR charges 0 and encashes 1. | Needs a decision: his comp-off was consumed against LOP by HRMS but HR treated it as encashable. |
| 7 | **Devang Singh Parihar data defect**: `hr_employees.total_salary` = 1,92,000 while his salary components sum to 1,20,000. | Real master-data inconsistency — must be corrected at source regardless of LOP. |
| 8 | **Missing base**: HRMS exports `Monthly base 0` for every zero-LOP employee (Amit, Archita, Arjun, Khushbu, Kunal, Lavany, Meenu, Monti, Naman, Payal…), so the sheet cannot be audited. | HRMS presentation bug — the base should always be shown. |

Everything else in the two files agrees.

## RazorpayX constraint (your point about what can be pushed)

RazorpayX Payroll only accepts, per employee per month: the annual CTC, one-off **additions**, and one-off **deductions**. There is no "joined mid-month, pay 15/31" field. So a mid-month joiner is handled as:

- push the full annual CTC (already the case), and
- push **one deduction line** covering the unserved calendar days, labelled `Loss of Pay - Pre-joining days (proration)`, plus a separate `Loss of Pay - Attendance` line for real absence.

Same for training-stipend employees: RazorpayX holds the *current* CTC, so the LOP deduction is computed on the stipend base and pushed as a rupee amount — the stipend base never has to exist inside RazorpayX.

## What I will do

1. **Fix the LOP engine** (`hr_lop_days` / `generate-lop-deductions` / `_shared/salaryBase.ts`):
   - per-day rate = monthly base ÷ actual calendar days in the month (31 for August), applied uniformly;
   - pre-joining / post-relieving days counted in calendar days, joining day payable;
   - salary base = stipend actually applicable for the month when a training CTC is in force, master CTC/12 otherwise;
   - always emit the resolved base, even when charged LOP is zero.
2. **Fix the leave ledger** so the CL/CO auto set-off is reflected in Used and Closing in the preview and CSV, not only after staging (this is bug #4 and it is what forced your HR's manual edits).
3. **Split the pushed deduction** into `Loss of Pay - Attendance` and `Loss of Pay - Pre-joining days (proration)` so payslips and RazorpayX stay explainable.
4. **Re-run August 2026** and produce a reconciled CSV with, per employee: HRMS-old · HR-suggested · corrected value · the reason for each change. Rows where HR was wrong (Lokesh) or where I need your call (Uday, Priya's 34,995, Satyam's 12,903) are flagged rather than silently changed.
5. Log the change in `docs/STATE_LOG.md` with IST timestamps and verify each fix by DB query before reporting.

## Open items I will flag, not decide

- Priya's 34,995 and Satyam's 12,903 bases — need the source document (they are not in the DB).
- Uday's comp-off: set off against LOP or encashed.
- Lokesh: I will keep HRMS's 2 days and flag HR's 7 for review.
