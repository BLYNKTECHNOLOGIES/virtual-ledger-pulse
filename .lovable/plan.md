# Financial Management page — readability and polish

The main problem on this page is not the colors, it's that the numbers you actually came to read are cut off: "₹11,47,8…", "₹1,60,35,…", "11.434…". Every headline figure on the page is unreadable at normal window widths. The plan fixes readability first, then tightens the layout.

## What changes

### 1. Numbers that always fit
- Replace the fixed large font + clipping with a compact Indian-format display: `₹11.48 L`, `₹1.60 Cr`, `₹88.27 K` for the headline, with the exact full amount shown directly underneath in small muted text (`₹11,47,832.40`).
- Hovering any figure shows the exact value in a tooltip too, so nothing is ever hidden.
- Auto-shrinking type scale so long figures step down instead of being truncated.
- Same treatment for USDT figures (`933.7547 USDT` stays exact, headline shows a rounded value).

### 2. KPI cards — cleaner, denser
- One consistent tile pattern for all four top cards and the five Platform Fees cards: label, big value, exact value, one context line, small tinted icon chip.
- Equalized card heights, tighter padding, so the row reads as a single strip rather than mismatched blocks.
- The "Click to view …" hint becomes a subtle inline affordance with a chevron that only highlights on hover, instead of competing with the number.

### 3. Header
- Collapse the oversized header block: title, subtitle, and the date/Export/New Transaction controls on one aligned row with reduced vertical padding, freeing roughly 80px of screen space.
- The date range becomes a compact control rather than a wide pill.

### 4. Tabs
- Tabs move to a slim underline bar aligned to the page edge instead of a heavy grey container, with the active tab marked by an underline plus foreground text (no separate coloured chip).

### 5. Theme consistency
- Continue the neutral "Slate & Steel" treatment already applied elsewhere: `bg-card` surfaces, `border-border` hairlines, muted labels, colour used only for the small icon chips and for genuine positive/negative signals.
- All values use tabular numerals so columns line up.

## Technical notes

- New shared helper `src/lib/formatCompactCurrency.ts`: `formatCompactINR(n)` (K / L / Cr with 2 decimals), `formatExactINR(n)`, and `formatCompactUSDT(n)`. No rounding of underlying data — display layer only.
- New shared component `src/components/financials/StatTile.tsx` used by `Financials.tsx`, `PlatformFeesSummary.tsx`, and `TotalAssetValueWidget.tsx` so all KPI cards share one implementation.
- Edits limited to: `src/pages/Financials.tsx` (header, KPI grid, tabs list), `src/components/financials/PlatformFeesSummary.tsx`, `src/components/financials/TotalAssetValueWidget.tsx`, plus the two new files.
- Presentation only — no query, calculation, or data-source changes.
