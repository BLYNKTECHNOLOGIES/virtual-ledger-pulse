

# Shift-Based Calendar Filter for Terminal

## Overview
Replace the simple period buttons (1d/7d/30d/1y) with a richer filter system that supports:
1. **Date picker** — select any specific date (defaults to today)
2. **Shift sub-filter** — optionally narrow down to a specific shift within the selected day
3. **Existing range presets** — keep 7d/30d/1y for multi-day views (no shift filter for these)

## Shift Definitions (IST)
| Shift | Label | Start | End |
|-------|-------|-------|-----|
| Shift 1 | Morning | 01:00 AM | 09:00 AM |
| Shift 2 | Day | 09:00 AM | 05:30 PM |
| Shift 3 | Night | 05:30 PM | 01:00 AM (next day) |

When "Full Day" is selected (default), timestamps span 12:00 AM to now (or end of day if past date). When a shift is selected, timestamps narrow to that shift's window.

## Affected Files

### 1. `src/components/terminal/dashboard/TimePeriodFilter.tsx` — Major rewrite
- New exported type: `TimeFilter = { mode: '1d'; date: Date; shift: 'all' | 'shift1' | 'shift2' | 'shift3' } | { mode: '7d' | '30d' | '1y' }`
- New `getTimestampsForFilter(filter: TimeFilter)` function replacing `getTimestampsForPeriod`
- Keep backward-compatible `TimePeriod` type and `getTimestampsForPeriod` temporarily if needed
- UI: Row with date picker (calendar icon + formatted date), shift chip group (Full Day / S1 / S2 / S3), and 7d/30d/1y buttons
- Shift chips only visible when in single-day mode
- Compact mobile-friendly layout using Popover calendar

### 2. `src/pages/terminal/TerminalDashboard.tsx` — Update filter state
- Change state from `TimePeriod` to `TimeFilter`
- Use `getTimestampsForFilter` for order filtering
- Update `periodLabel` to show date + shift name
- Update user prefs serialization

### 3. `src/pages/terminal/TerminalAnalytics.tsx` — Add filter support
- Add the same `TimePeriodFilter` component (currently hardcoded to 30d)
- Replace the hardcoded `thirtyDaysAgo` filter with the new filter system
- Wire all stats and charts to filtered data

### 4. No ERP changes — scoped exclusively to terminal pages

## Technical Details

**Timestamp calculation for shifts (IST):**
```
// Shift 1: date 01:00 IST → date 09:00 IST
// Shift 2: date 09:00 IST → date 17:30 IST
// Shift 3: date 17:30 IST → date+1 01:00 IST
// Full day: date 00:00 IST → min(date+1 00:00, now)
```

All shift boundaries calculated using IST offset (+5:30) from UTC to ensure consistency regardless of user browser timezone.

**UI Layout (mobile 390px):**
```text
┌──────────────────────────────────┐
│ [📅 15 Apr] [Full Day|S1|S2|S3] │
│ [7D] [30D] [1Y]                 │
└──────────────────────────────────┘
```
When 7D/30D/1Y is active, shift chips are hidden and date picker is inactive. When date is picked, mode switches to single-day.

