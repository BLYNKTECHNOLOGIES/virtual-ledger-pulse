# Restyle Statistics & Analytics to match the rest of the ERP

The Statistics page currently uses solid saturated blocks (green / blue / orange / red) for every KPI. Some values are still hard to read on those blocks, and the look is out of step with every other ERP page, which uses neutral cards with a small coloured icon and a coloured trend line.

## What changes

1. **KPI tiles adopt the standard ERP card look**
   - Neutral `bg-card` surface with the normal border and subtle shadow (same visual weight as the Dashboard metric cards).
   - Label in muted text, value in large `text-foreground` bold, delta line in `text-success` / `text-destructive`.
   - Colour survives only as an accent: a small tinted icon chip (e.g. `bg-success/10` with `text-success` icon) and the trend text. No full-bleed colour blocks anywhere.
   - Contrast then works in both light and dark mode by construction, which also removes the remaining unreadable-number cases.

2. **Applies to every tile group on the page**
   - The top KPI strip (Revenue, Clients, Orders, Leads, Conversion, Net Profit).
   - Clients & KYC tab tiles, Leads tiles, Performance tiles, Financial tiles.
   - The remaining gradient card and the two tinted blocks further down the Overview tab are converted to the same pattern.

3. **Header de-duplication**
   - The screenshot shows "Statistics & Analytics" twice (page header + in-tab header). The in-tab duplicate header is removed; the date-range picker and Export button move up next to the single page header.

4. **Spacing / density pass**
   - Consistent grid gaps, uniform tile height, tighter tile padding so the KPI strip does not dominate the viewport, and sensible wrapping on the 890px-wide preview.

Charts, queries, drill-downs, permissions and all numbers stay exactly as they are — this is presentation only.

## Technical notes

- Single change surface: `src/components/hrms/StatisticsTab.tsx` (rewrite of the `StatTile` helper plus the call sites), and a small header/toolbar adjustment in `src/pages/Statistics.tsx`.
- `StatTile` gains a `tone` that maps to accent classes only (`text-success` + `bg-success/10`, etc.), replacing the current `TONE_BG` solid backgrounds.
- Only semantic tokens are used (`bg-card`, `text-foreground`, `text-muted-foreground`, `success`, `warning`, `destructive`, `info`, `primary`) — no hardcoded colours.
- Verification: load the page in the sandbox browser and screenshot each of the five tabs in both light and dark mode to confirm every number is legible.
