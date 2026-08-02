---
name: LOP monthly base authority
description: Monthly base for LOP/shadow payroll must come from RazorpayX annual CTC, never from summing mirrored salary components
type: constraint
---
The monthly salary base used for Loss of Pay and shadow payroll comes from
`supabase/functions/_shared/salaryBase.ts` (`resolveMonthlyGross`) only.

Ladder (fixed order):
1. `hr_employee_salary_structure_assignments.annual_ctc / 12`
2. `hr_employees.total_salary` (RazorpayX annual CTC) / 12 — **authority**
3. mirrored components sum (`hr_employee_salary_structures`) — fallback ONLY when no CTC exists
4. imported Salary Register gross → onboarding CTC → previous payslip

**Why:** summing mirrored RazorpayX components yields a derived breakup carrying
employer-side loading (e.g. Archita Damle 1,38,091 vs CTC 1,32,000; Poonam
Dahayat 1,87,651 vs 1,80,000), which silently inflated LOP deductions.
Never reintroduce a component-sum-first base.
