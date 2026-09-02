# Mid-month joiners and leavers: how the LOP calculation should work

No code changes yet. This is the decision brief you asked for, with worked numbers.

## The example

Ramesh joins on **20 August**. Monthly CTC ₹30,000. August has 31 calendar days and 26 working days (5 Sundays off). His employment window 20–31 Aug is 12 calendar days / 10 working days. He is present every day he is employed. No absences.

### Model A — employment window (what RazorpayX does)

The 1st–19th simply do not exist for him. Neither working days nor LOP.

```text
Payable calendar days   12 of 31
Gross                   30,000 x 12/31 = 11,613
Working days on payslip 10
LOP days on payslip     0
```

### Model B — pre-joining days booked as LOP (your proposal)

Full month base, then 16 pre-joining working days deducted as LOP.

```text
Base                    30,000 (full month)
LOP                     30,000 x 16/26 = 18,462
Gross                   11,538
Working days on payslip 26
LOP days on payslip     16
```

In this month the two land within ₹75 of each other. That is coincidence, not equivalence — see below.

## Where the two stop agreeing

**1. The gap moves with where the weekly offs fall.** 30-day month, 26 working days, joins on the 26th:

```text
Model A   30,000 x 5/30  = 5,000
Model B   30,000 x 4/26  = 4,615     (385 less, ~8%)
```

Model B pays by working days, so the weekly offs inside his employment — which are paid days for any employed person — get dropped. The shorter the window, the bigger the error, and it always errs against the employee.

**2. Double deduction against RazorpayX.** RazorpayX is the payroll authority; HRMS mirrors it and pushes LOP into it. RazorpayX prorates the joining month itself from the hire date. If HRMS also pushes 16 LOP days for the pre-joining stretch, RazorpayX prorates *and then* applies our LOP on the already-prorated figure — Ramesh receives close to nothing. Under Model A we push 0 LOP for a clean joiner and nothing collides.

This is the decisive point and it must be verified on a real joiner month before anything is built (see Open verification below).

**3. Reporting reads wrong.** A clean new joiner shows "16 days LOP" on his payslip and in the attendance register. PF/ESI wage-day counts, attendance percentage, leave accrual and comp-off all key off working days, and every one of them is distorted for that month. Step 8 shadow-vs-RazorpayX will show permanent drift for every joiner and leaver, because RazorpayX reports 10 working days / 0 LOP and we report 26 / 16.

**4. Leavers get it in reverse.** Someone relieved on the 8th would carry ~18 LOP days for a month he was not employed in, and the F&F comparison inherits the same distortion.

## The day-rate bug — separate, and live under either model

This one is not about pre-joining days at all. `generate-lop-deductions` computes:

```text
amount = FULL monthly gross  x  (LOP days / working days INSIDE the window)
```

Ramesh takes one genuine unauthorised absence on 25 August:

```text
Today's code    30,000 / 10 window working days = 3,000 for one day
Correct (A)     11,613 windowed gross / 10       = 1,161
Correct (B)     30,000 / 26 full-month working days = 1,154
```

He is charged **about 2.6x** the real day rate. The mismatch is a full-month numerator over a windowed denominator, so it is wrong under Model A and under Model B alike — only the fix differs (window the base under A; use full-month working days as the divisor under B). This should be corrected either way.

## Open verification before any implementation

Confirm on a real joiner month whether RazorpayX already prorates the hire month. One live case exists: an employee hired 13-Jul-2026, monthly CTC ₹9,194, RazorpayX register shows 19 working days and gross ₹2,527. 19 of 31 calendar days would be ₹5,635, so RazorpayX applied something beyond plain proration on that payslip. That single row is not enough to settle it — the register split for that employee needs to be read against his July attendance before we choose a model.

## What I recommend

Model A, plus the day-rate fix. It pays the joiner the same money you intend ("only the days he worked"), pays the weekly offs inside his window as RazorpayX does, keeps the payslip honest, and cannot double-deduct when LOP is pushed.

If you still want Model B after the above, it can be built — but it needs a companion rule that HRMS never pushes the pre-joining LOP days to RazorpayX, only the real absences, otherwise the joiner is deducted twice.

## Next step

Tell me which model to build. Nothing is implemented until then.
