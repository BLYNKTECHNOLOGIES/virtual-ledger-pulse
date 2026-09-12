# Mobile Orders: List / Card view switch

Add a mobile-only view switch to the Terminal Orders page. Desktop remains exactly as it is.

## What will change

- Show a compact **List | Cards** switch only below 768px, beside the order filters.
- Keep **List** as the current mobile table and the default view.
- Add a readable **Cards** view with one card per order showing:
  - BUY/SELL, asset, date, account, order number and copy action;
  - fiat amount, crypto amount, price, counterparty nickname and verified name;
  - assignment, status, active timer, verification/UPI/release alerts;
  - the same Release, Binance chat, internal chat, assign, and open-order actions available in the current row.
- Tapping the card opens the existing full order workspace; action buttons stop that navigation and retain their current permissions and behavior.
- Preserve filtering, search, counts, lazy loading, unread badges, status freshness, permissions, and release-method safeguards.
- Remember each Terminal user’s mobile choice across reloads.

## Technical notes

- Extend the existing Terminal order preference with `mobileView: "list" | "cards"`.
- Keep the existing table untouched for desktop and render it on mobile only when List is selected.
- Build the card branch from the same `visibleOrders` data and existing derived status, alerts, assignment, verified-name, and action handlers.
- Use existing semantic tokens and Button components; no API, database, Binance, or order-workflow changes.
- Verify at 390×710 and desktop widths, then confirm the current build remains clean.
