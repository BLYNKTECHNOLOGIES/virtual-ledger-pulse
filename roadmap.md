# Workforce capacity integrity

## F&F approval and payroll-input handoff

- [x] Make Separations completion depend on F&F approval, not the later RazorpayX push.
- [x] Stage approved F&F lines for the Inputs Push step without writing to RazorpayX.
- [ ] Deploy and verify stage-only approval, Inputs retry, zero-value settlement, and cockpit status.

## HR Mailbox mobile layout

- [x] Keep mailbox tabs, search, and conversation rows inside phone width.
- [x] Preserve desktop mailbox layout and mail actions.
- [ ] Verify signed-in mailbox on a phone (blocked: external Supabase authentication unavailable to automated checks).

## Data Health history and mobile layout

- [x] Keep History visible and place History and Rescan in a stable phone action row.
- [x] Reflow status counters, filters, discrepancy actions, health tiles, and history filters for phone width.
- [ ] Verify the signed-in Data Health page and history list on a phone (blocked: external Supabase authentication unavailable to automated checks).

## Terminal Copilot current-order replies

- [x] Include the unsent draft, bounded current-order chat, actual trade side, status, asset, quantity and payment details.
- [x] Avoid nickname-based history and avoid sequential style/embedding waits; present suggestions without awaiting audit logging.
- [ ] Verify deployed copilot against a signed-in real current-order chat and draft (blocked if external Supabase authentication unavailable).

## Terminal dashboard active ads

- [x] Trace Binance list/detail visibility and the dashboard ranking.
- [x] Rank verified public online ads by available quantity, include ad numbers and quantities, and fetch all pages.
- [ ] Verify against signed-in live Binance ads (blocked: external Supabase sessions cannot be injected into automated browser checks).

- [x] Trace seat, employee, staffing, pipeline, and hiring calculations.
- [x] Reconcile operational capacity into staffing targets.
- [x] Generate deduplicated pending approvals for uncovered shortages.
- [x] Distinguish live shortage, pipeline, open hiring, and uncovered hiring in Workforce Planning.
- [x] Verify database idempotency, build health, and desktop/mobile route rendering.
- [ ] Verify signed-in workforce screens (blocked: external Supabase sessions cannot be injected into automated browser checks).
- [x] Fix repeat saving of company-wide and department attrition assumptions.

## Shift-aware seat map

- [x] Add a movie-booking-style office seat map to Capacity & Seats.
- [x] Make seat availability respond to the selected shift.
- [x] Keep every physical seat reserved to its assigned role.
- [x] Verify desktop/mobile rendering and live calculations.
- [x] Replace the interim boxed dashboard with the approved cinema-style role-row seating plan.
- [x] Add six role-independent training-only seats excluded from working capacity and hiring demand.
- [x] Combine Morning Shift and Morning Shift Exemption for seat occupancy while retaining attendance schedules.
- [x] Show the allocated employee name when a seat is hovered or keyboard-focused.
- [x] Show employee details on over-capacity seats and correct cinema-row alignment.
- [x] Support shared eligible roles throughout Payment Operations seat and staffing-plan screens.

## Binance bulk maximum quantity

- [x] Validate BUY and SELL quantity semantics against Binance's official ad-update contract.
- [x] Update BUY ads by targeting tradable quantity while preserving already-traded quantity.
- [x] Keep SELL ads on the standard quantity field and remove response-only quantity fields from update requests.
- [x] Deploy the corrected Binance Ads function and verify preview compilation.
- [ ] Run a live authenticated BUY-ad update (blocked: this external Supabase session is not available to automated verification).

## Safe F&F and final-payroll exit flow

- [x] Automatically disable ERP login and queue biometric removal after the employee's last working day, regardless of F&F payment state; preserve HRMS and payroll records.
- [x] Separate last-working-day access closure from F&F payment and RazorpayX dismissal.
- [x] Infer the F&F payment reference from the verified payroll handoff.
- [x] Gate every RazorpayX dismissal on settled F&F and employee-level final payroll proof, including direct proxy calls.
- [ ] Verify Satyam remains RazorpayX-active while September payroll is unprocessed.
## Salary revisions clarity

- [ ] Group payroll-month revisions by employee and show one clear salary journey.
- [ ] Remove redundant instructional text while preserving status and actions.
- [ ] Verify grouped desktop and phone layouts without changing payroll behavior.

