# Roadmap

## TAU-FIX-1 — server-side automation
- [ ] AAT-0: unschedule only terminal-ad-uptime-rollup-nightly; verify collector remains
- [ ] Enforce automation table rights and column-level toggle restrictions
- [ ] Gate pricing/pay engines and atomically limit manual pricing runs
- [ ] Implement IST merchant schedules through existing safe ad rests, with dry-run and retention
- [x] AU-F6 withdrawn by owner: auto-reply-engine and its current matching/order stay unchanged; VERIFY 6 skipped
- [ ] Deploy and report all seven mandatory verification outputs, clearly identifying unavailable checks

## Mobile RA assignment
- [x] Reproduce fixed action bar falling below the viewport inside animated client pages
- [x] Anchor the shared Buyers/Sellers selection bar outside animated ancestors without changing assignment logic or access
- [x] Verify source-based isolated layout at 320/390/768/1280px: selection bar stays visible during scrolling and opens a dialog; preview build OK
- [ ] Verify real signed-in client assignment — blocked: external unmanaged sign-in prevents authenticated checks

## Sales order counterparty PAN
- [x] Add the missing PAN to the shared Sales details window using the exact linked client and existing client access
- [x] Five targeted identity/access tests passed; preview reports build OK
- [ ] Verify authenticated order window — blocked: external unmanaged sign-in prevents authenticated checks

## October 20 reported issues
- [x] Owner confirmed Shivam's 18 Oct 01:02 IST punch was stray; voided through the existing resolver, original punch preserved in audit, zero open stale sessions verified; Oct 17 remains Present with 439 worked minutes
- [x] Diagnose BTC conversion CONV-20261020-003: two Binance fills charged 0.00001178 BNB fee; ERP BNB balance is 0; approval was rolled back with no ledger writes
- [ ] Correct the BNB balance or fee handling — blocked: owner confirmation of how the BNB was obtained

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
- TDS certificates: per-client quarterly download + ZIP upload (Tax Management managers) — owner to upload TDS.zip
