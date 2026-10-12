# compute-shadow-payroll

- The shadow payroll mirrors what RazorpayX actually did: when a salary register is imported, its PF/ESI/PT deductions decide enrolment, PF is on the full-month CTC Basic, a revision RazorpayX received only after month-end is paid on the opening CTC, and register loans/advances not staged in HRMS still count, because the shadow exists to explain RazorpayX's net, not to re-derive HRMS flags.
- Ignore deductions with source `auto_post_lwd`, because the employment-window clamp already removes a leaver's post-LWD days.
