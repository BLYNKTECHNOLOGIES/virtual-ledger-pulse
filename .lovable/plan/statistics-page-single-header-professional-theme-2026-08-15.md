# Statistics page: single header + professional theme

## What's wrong

1. **Duplicate header** — the page shell (`src/pages/Statistics.tsx`) renders "Statistics & Analytics", and the screenshot shows a second, larger one with the subtitle "Comprehensive business insights and growth metrics". That second header string no longer exists anywhere in the current source, so what's on screen is a stale browser bundle from before the last change. The plan still hardens this so it can't come back, and verifies the live page renders exactly one header.
2. **Childish colour treatment** — the KPI row uses full-bleed saturated green / blue / indigo / orange blocks with white text, which is why numbers read poorly and the page looks off-brand versus the rest of the ERP.

## Direction (from your answers)

- Accent: **Slate & Steel** — neutral cards, restrained slate/blue accents. This is the closest match to the existing ERP surfaces, so Statistics stops looking like a different product.
- KPI style: **flat neutral cards** — card background, small tinted icon chip, colour used only on the trend delta (green up / red down) and nowhere else.

## Changes

**Header**
- Keep the single `PageHeader` in `Statistics.tsx`; tone the icon block down to the standard ERP header treatment (muted square, no oversized icon).
- Confirm `StatisticsTab` renders no header of its own, and keep the date-range picker + Export in one right-aligned toolbar row directly under the page header.

**KPI row (6 tiles)**
- Neutral `bg-card` with border and subtle shadow; label in muted small caps, value in large `text-foreground` with tabular numerals so figures align.
- Icon in a small tinted chip (10% tint) instead of a coloured card.
- Trend line is the only coloured element: success for positive, destructive for negative, muted when flat.

**Rest of the page**
- Sweep the Overview, Clients & KYC, Leads, Performance and Financial tabs for any remaining saturated blocks or gradient cards and convert them to the same neutral tile.
- Chart palette moves off the bright default series to a restrained slate/blue/teal ramp with a muted grid, consistent across all charts on the page.
- Section cards get one consistent border/shadow/heading rhythm.

## Technical notes

- Files: `src/pages/Statistics.tsx`, `src/components/hrms/StatisticsTab.tsx` (`StatTile`, `TONE_ACCENT`, `CHART_COLORS`).
- Colours come from existing semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `success`, `destructive`, `primary`); no hardcoded hex in components. If the chart ramp needs new values, they get added as tokens in `index.css` / `tailwind.config.ts`.
- No data, query, or business-logic changes — presentation only.

## Verification

- Typecheck, then load `/statistics` in a headless browser and assert exactly one "Statistics & Analytics" heading.
- Screenshot each of the five tabs and check every KPI number is legible against its background before reporting done.
- If the duplicate header still shows in your browser after deploy, it is cache — a hard refresh clears it; the check above proves the served bundle only has one.
