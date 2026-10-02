# Post-training salary: push to RazorpayX automatically after payroll closes

## What I found
- The Push button shows for a mid-month change (e.g. Abhishek, effective 17 Sep) while September payroll is still open. Pushing it now would pay **all of September** at ₹2,04,000 **and** add the ₹3,267 part-month extra. That means he'd be paid twice for the post-training days. This is a real overpayment risk, not just extra clutter.
- The "Held" lock only covers changes that take effect in a **later** month. It misses mid-month changes in the open month.
- Nothing sends the new salary after payroll closes, so someone has to remember. That's why six people still show "Not pushed".
- Changes that take effect on the 1st of the open month are different. They should reach RazorpayX before that month's payroll runs, because no part-month extra exists for them.

## The rule from now on
| Change takes effect | What happens |
|---|---|
| On the 1st of the open month | Sent with that month's payroll, at the cockpit's Inputs step. No manual button. |
| Mid-month, in the open month | Held. The lower CTC stays in RazorpayX and the part-month extra pays the difference. **Sent automatically once that month's payroll is marked done.** |
| A later month | Held until that month opens, then handled the same way. |

## What I'll build
1. **Remove manual Push for CTC changes** on Salary Revisions. Each row gets a status instead:
   - "Held — goes to RazorpayX after September payroll closes"
   - "Queued"
   - "Sent ✓"
   - "Failed — Retry". Retry is the only button left, shown only after an automatic send fails.
2. **Automatic send when payroll closes.** When the cockpit's final step for a month is marked done, every held CTC change for the next month is sent to RazorpayX and checked back. A daily check (once a day, 02:00 IST) catches anything missed. It sends only once per change, never the same change twice.
3. **Changes effective on the 1st** go out with the cockpit's Inputs Push step, next to the other payroll inputs. They are sent before the run, and Inputs Push won't finish until they are.
4. **A safety guard on the server.** Even outside this page, RazorpayX will refuse a CTC whose month is still open, unless the change takes effect on the 1st.
5. **The six restored people** (Abhishek, Urvashi, Neelanchal, Harmeet, Khurram, Ishank) are queued now. They go to RazorpayX automatically once September payroll is marked done.
6. **Who sent it:** every automatic send is recorded as done by the system, and results show on Data Health → History.

## Not changed
- Bulk salary changes, the Revise Salary dialog and Data Health keep their own push buttons for corrections, but the same server guard (item 4) applies to them.
- One-time payouts keep their current Push.

## Technical notes
- New column on hr_salary_revisions: `razorpay_push_state` (held / queued / pushed / failed) plus `push_after_month`.
- Trigger on hr_payroll_cockpit_state (step 11 → done) uses the existing scheduler-secret pattern to call a new edge function, `hr-push-held-ctc`. That function reuses the pushback + read-back logic from razorpayPushback and runs once per revision.
- Daily backstop cron at 20:30 UTC (02:00 IST), plus a fix to hr_revision_push_window: in the open month, allowed only when effective_from is the 1st.
- I'll write the AGENTS.md rule and a STATE_LOG entry.
