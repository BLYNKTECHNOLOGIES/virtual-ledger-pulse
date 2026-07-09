## Plan: Simplify Ad Manager Board View & Surplus Stats

### Changes

1. **Board view ad cards (`src/components/ad-manager/BoardView.tsx`)**
   - Remove the `<Progress>` consumption bar entirely.
   - Replace the current `surplus / init {asset}` footer text with a single line showing only the remaining (surplus) quantity.
   - Keep the low-stock / out-of-stock visual treatment (border tint) so operators still notice scarce inventory.

2. **Top surplus stat chips (`src/components/ad-manager/AdSummaryStrip.tsx`)**
   - Remove the generic "top 3 assets" logic.
   - Show only the **USDT surplus** chip.
   - Keep the Total / Online / Private / Offline count chips unchanged.

### Files to edit
- `src/components/ad-manager/BoardView.tsx`
- `src/components/ad-manager/AdSummaryStrip.tsx`

### Verification
- Run TypeScript typecheck.
- Visually confirm the board cards no longer render a progress bar and only show remaining quantity.
- Confirm the summary strip shows Total, Online, Private, Offline, and USDT surplus only.