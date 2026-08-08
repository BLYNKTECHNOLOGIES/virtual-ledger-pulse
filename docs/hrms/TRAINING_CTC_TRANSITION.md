# Training-Completion CTC Transition — Calculation Spec

**Status:** design only. Nothing implemented. Written for review.
**Scope:** onboarding captures a *training CTC* + a *training completion date* + a
*post-training CTC*. The new CTC is scheduled and pushed to RazorpayX on the
completion date. Because RazorpayX pays a **whole month at whichever CTC is live
when that month is processed**, the month containing the transition is
over-paid, and the payroll cockpit must recover the difference through a
one-time adjustment line. This document defines that number exactly, including
Loss of Pay, Sundays/holidays, mid-month joiners, and statutory side-effects.

---

## 1. The platform constraint (why an adjustment exists at all)

RazorpayX CTC is a month-level attribute. There is no mid-month effective date
and no retro-effective CTC. Consequences:

| We push new CTC on | RazorpayX pays month M as | Our correction |
|---|---|---|
| any date inside M, before M is processed | **full month at C2** | **deduction** (recovery) in M |
| after M was processed | full month at C1 | **addition** (arrears) in M+1 |

So there is exactly one correction primitive with a sign. Everything below
computes its magnitude.

---

## 2. Notation

| Symbol | Meaning |
|---|---|
| `M` | payroll month being corrected |
| `N` | calendar days in `M` (28–31) |
| `T` | training completion date = effective date of the new CTC, `1 ≤ T ≤ N` |
| `C1`, `C2` | annual CTC before / after (from onboarding form) |
| `G1 = C1/12`, `G2 = C2/12` | monthly CTC-inclusive gross |
| `d_old = T − 1` | calendar days paid at the old rate |
| `d_new = N − T + 1` | calendar days paid at the new rate |
| `L` | total LOP days in `M` from `hr_lop_days` (halves allowed) |
| `L_before` | LOP days with date `< T` |
| `L_after` | `L − L_before` |
| `D` | LOP divisor actually used by the paying engine (see §4) |

**Sundays / weekly-offs / holidays are paid days.** They are never removed from
`N`, `d_old`, or `d_new`. They only matter through `L` — and `hr_lop_days`
already returns 0 for weekly-off and holiday. No separate Sunday handling is
required in this formula; the Sunday-worked → extra CL credit rule is a leave
transaction, not a CTC transaction, and stays out of this math.

---

## 3. Base adjustment (ignoring LOP)

Entitlement for `M`:

```
E = G1 · d_old/N  +  G2 · d_new/N
```

RazorpayX pays `G2`. Therefore:

```
A_base = G2 − E = (G2 − G1) · d_old / N
```

Positive ⇒ recover. Negative (a demotion / lower post-training CTC) ⇒ pay as an
addition. `T = 1` ⇒ `A_base = 0`, no line at all.

---

## 4. LOP layer — and why the two divisors must be reconciled

RazorpayX deducts LOP at the **live** rate for the entire month:

```
LOP_paid = G2 · L / D
```

The correct, date-aware LOP is:

```
LOP_correct = ( G1 · L_before + G2 · L_after ) / D
```

Over-deduction to give back:

```
A_lop = LOP_paid − LOP_correct = (G2 − G1) · L_before / D
```

### Net one-time adjustment

```
A_net = A_base − A_lop = (G2 − G1) · [ d_old/N − L_before/D ]
```

**If and only if `D = N`** this collapses to the intuitive identity:

```
A_net = (G2 − G1) · (d_old − L_before) / N
        └── the difference is recovered only on the PAID days before T ──┘
```

This is the form we want, and it is the reason `D` matters. Two divisors are in
play today:

- `hr_lop_days` returns `working_days` and `compute-shadow-payroll` uses
  `lopDivisor = working_days` (falls back to calendar days).
- RazorpayX prorates on **calendar days** for joiners; its LOP divisor must be
  confirmed empirically.

**Action before implementation:** take one employee from a past Salary Register
with a known LOP count and solve for `D` from the printed LOP amount. Then pick
ONE divisor for the whole chain (Razorpay's), and either align
`compute-shadow-payroll` to it or carry the mismatch explicitly as its own
bucket in the Net Variance Bridge. Mixing divisors silently is how the earlier
LOP over-deduction bug happened; do not repeat it.

Until `D` is proven, the spec is `D = N` (calendar days), because that is what
makes the paid-day identity true and matches Razorpay's proration elsewhere.

---

## 5. Generalised form (more than one rate change in a month)

Segments `s = 1..k`, each with monthly gross `G_s` and calendar day count `n_s`
(`Σ n_s = N`) and LOP days `l_s` falling inside the segment. `G_live` = CTC live
at processing time.

```
Entitled  = Σ_s G_s · (n_s − l_s) / N
Paid      = G_live · (N − L) / N
A_net     = Paid − Entitled
```

§3+§4 is the two-segment case of this. Implement the general form — it costs
nothing extra and covers "training completion + annual increment in the same
month" without a second code path.

---

## 6. Mid-month joiners, exits, and window clamping

Everything above must run on the **employment window**, not the raw month —
this is the clamp that was missing in the earlier LOP bug.

```
W_start = max(month_start, date_of_joining)
W_end   = min(month_end,   last_working_day  or month_end)
```

Replace `d_old` with `|[W_start, min(T−1, W_end)]|` and `d_new` with
`|[max(T, W_start), W_end]|`. **The divisor stays `N` (full calendar month).**
Do not prorate twice: RazorpayX already prorates the joiner's month by
`window/N`, so using a window-sized divisor here would double-count. The
adjustment must be expressed in the same currency-per-calendar-day units that
Razorpay used.

Guard: `T` outside the employment window ⇒ no adjustment for `M`.

---

## 7. Statutory side-effects (CTC-inclusive doctrine)

The adjustment is a **post-gross recovery line**, not a reduction of the
statutory base. Razorpay computed PF/ESI/PT/TDS on the *paid* gross `G2`, which
is slightly higher than entitlement. Consequences, each to be stated on-screen
rather than silently absorbed:

| Item | Effect | Recommendation |
|---|---|---|
| **PF (EE+ER)** | computed on `G2` basic; over-contributed by `12% × basic-share of A_base` | accept — it lands in the employee's PF corpus; do NOT try to reverse |
| **ESI** | if `C1` was under the ₹21,000 wage ceiling and `C2` crosses it, ESI does **not** stop mid-period — coverage runs to the end of the contribution period (Apr–Sep / Oct–Mar). Contribution is on actual paid wages. | show a badge when the transition crosses the ceiling; no math change |
| **PT** | slab is on paid gross; a recovery does not retro-change the slab | accept |
| **TDS** | annual projection already assumed the new CTC from `T`; a one-off recovery slightly reduces annual taxable income and self-corrects in later months | accept |
| **Employer carve-out** | under the CTC-inclusive doctrine `G2` already contains employer PF/ESI. `A_net` is therefore a **CTC-level** number, and the take-home impact is smaller than `A_net`. | the cockpit must display both: *CTC recovery* and *estimated net-pay impact* |

Do **not** model the adjustment as a negative earning — that would re-open the
statutory base and desynchronise HRMS from the Salary Register.

---

## 8. Rounding, sign, and caps

1. Compute in full precision; round **once** at the line, to the rupee (`round`,
   not floor — matches existing payslip rounding).
2. Sign convention: `A_net > 0` → row in `hr_payroll_input_deductions`
   (`type = training_ctc_adjustment`). `A_net < 0` → row in
   `hr_payroll_input_additions` with `|A_net|`.
3. **Net-pay floor:** if `A_net` plus existing recoveries (EMI, security
   deposit, error recovery) would push net pay below zero — or below the
   configured minimum take-home — split it: recover to the floor this month and
   carry the remainder as a scheduled recovery next month. Never push a payout
   that computes negative; Razorpay will reject or, worse, silently clamp.
4. `|A_net| < ₹10` ⇒ suppress the line (noise floor).

---

## 9. Worked examples

Assume `D = N`.

### 9.1 Plain case
Sep 2026, `N = 30`, `T = 10`, `G1 = 10,000`, `G2 = 15,000`, `L = 0`.

```
d_old = 9
A_net = 5,000 × 9/30 = ₹1,500  → deduction
```
Entitlement check: `10,000×9/30 + 15,000×21/30 = 3,000 + 10,500 = 13,500`.
Paid 15,000 − 1,500 = 13,500. ✅

### 9.2 With LOP before the transition
Same, plus 1 full absent day on 4 Sep (`L_before = 1`).

```
A_net = 5,000 × (9 − 1)/30 = ₹1,333
```
Razorpay already deducted LOP of `15,000/30 = 500`, but that day should have
cost `333`. The `167` over-deduction is netted inside `A_net`
(1,500 − 167 = 1,333). One line, no second correction. ✅

### 9.3 LOP after the transition
1 absent day on 20 Sep (`L_after = 1`, `L_before = 0`) ⇒ `A_net = ₹1,500`
unchanged — that day was correctly docked at the new rate.

### 9.4 Sunday inside the old segment
6 Sep is a Sunday, not worked, `hr_lop_days` returns 0 ⇒ it stays a paid day in
`d_old` and carries the ₹166.67 difference like any other paid day. No special
case. ✅

### 9.5 Half day
Half day on 3 Sep ⇒ `L_before = 0.5` ⇒ `A_net = 5,000 × 8.5/30 = ₹1,417`.

### 9.6 Late push (arrears path)
Completion 10 Sep but the CTC only reached Razorpay after September was
processed. September paid `G1` for the whole month.

```
Arrears = (G2 − G1) × (d_new − L_after)/N = 5,000 × 21/30 = ₹3,500
```
staged as a one-time **addition** in October, on top of October running
normally at `G2`. Same primitive, opposite sign.

### 9.7 Mid-month joiner
DOJ 5 Sep, `T = 20`, `N = 30`. Window = 5–30 (26 days). Razorpay pays
`G2 × 26/30`. `d_old = |5..19| = 15`, `d_new = 11`.
`A_net = 5,000 × 15/30 = ₹2,500`. Entitlement
`10,000×15/30 + 15,000×11/30 = 5,000 + 5,500 = 10,500`; paid
`15,000×26/30 = 13,000`; `13,000 − 2,500 = 10,500`. ✅

---

## 10. Where each piece lives (proposed, not built)

| Surface | Responsibility |
|---|---|
| **Onboarding form** | capture `training_completion_date` + `post_training_ctc`; validate `> date_of_joining`; show the derived push month using the existing 15th rule |
| **Salary revisions** | on submit, write a `SCHEDULED` revision (`reason = 'training_completion'`, `effective_from = T`) so the transition is visible in Salary Revision History from day one, deletable while un-pushed |
| **`hr-promote-scheduled-salary-revisions` cron** | on `T`, promote + push CTC to RazorpayX (existing path, unchanged) and **stage** the computed `A_net` into `hr_payroll_input_deductions/additions` for month `M`, status `PENDING_REVIEW` |
| **Cockpit — deduction step** | list `Training CTC Adjustment` with the full derivation visible (`G1`, `G2`, `T`, `d_old`, `L_before`, divisor, result) and an HR approve-before-push gate. Never auto-push a recovery. |
| **`compute-shadow-payroll`** | mirror the same adjustment so shadow == Razorpay |
| **Net Variance Bridge** | dedicated bucket `Training CTC adjustment` so it never lands in the unexplained residual |

Idempotency key: `(employee_id, period_month, revision_id)` — unique, so cron
re-runs, retries, and re-imports cannot double-recover.

---

## 11. Open decisions (need your call before build)

1. **Divisor `D`.** Confirm empirically from a past Salary Register, then align
   shadow payroll to it. This is the only number in the spec that is assumed
   rather than known.
2. **Approval gate.** Auto-stage + HR approves in the cockpit (recommended), or
   fully automatic push?
3. **Full-month vs day-split.** This whole document assumes **day-split**
   (pay the lower CTC until `T`), which is what you described. The alternative —
   let the month pay fully at the new CTC and skip the adjustment entirely — is
   Razorpay-native and needs zero code. Worth confirming you want the split for
   every case, or only when the difference exceeds a threshold.
4. **Net-pay floor** value for the §8.3 split-recovery rule.
5. **Retro coverage:** apply only to future onboardings, or also backfill
   employees whose training already completed under the old flow?
