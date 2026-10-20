# Roadmap

## October 20 reported issues
- [ ] Diagnose Shivam's stale-session shift-end warning — awaiting confirmation of the shift actually worked
- [ ] Diagnose and fix BTC conversion approval reporting insufficient BNB; verify ledger integrity and recurrence prevention

## Urvashi attendance and dated leave balances
- [x] Align calendar day LOP with the payroll engine, including paid half-day coverage
- [x] Explain current balance versus balance earned by selected leave dates
- [x] Verify Urvashi: Oct 1 LOP = 0; October sweep checks 720 rows with zero remaining disagreements
- [ ] Verify signed-in calendar and leave submission — blocked: external unmanaged sign-in prevents authenticated checks

## Client Management phone layouts
- [x] Optimize directory, approvals, assignments, client details and related forms without changing business logic
- [x] Verify isolated sample layouts at 320/390/768/1280px with no page overflow; 397 tests passed and preview build clean
- [ ] Verify signed-in real-record flows — blocked: external unmanaged sign-in prevents authenticated checks

## Optional pre-joining onboarding
- [x] Add four chronological joining choices to the sample and reflect selection in sample HR review; date changes invalidate signed offer/confirmation; 24 tests and mobile end-to-end passed
- [x] Provide isolated sample package, uploads, submission, correction and HR-review preview; verified desktop/phone flow and 22 tests; no real candidate writes or emails
- [x] Assess the existing candidate link and joining side effects
- [x] Prepare the detailed optional-flow plan for owner review
- [x] Implement shared joining-date foundation and concrete rule tests
- [ ] Review approved offer/Annexure C/E2 and map existing documents — blocked: owner files not supplied
- [ ] Implement optional package, single-link submission/review and joining handoff — blocked: approved template mapping first

## WF7 — Workforce Planning rules (17 Oct) — done
- [x] §1 automatic priority
- [x] §2 planning status + hiring blocks
- [x] §3 position moves + delete/inactive guards
- [x] §4 renames
- [x] §5 review fixes
- [x] Verify + STATE_LOG

## DS1 — Designation authority
- [x] Read live definitions and baseline counts
- [x] Install copy, department, grade, reporting and login/RACI rules
- [x] Apply approved catalogue and synchronization data
- [x] Rollback probes and final resolution table
