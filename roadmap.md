# Workforce capacity integrity

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
