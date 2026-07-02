# Terminal Polish — Refined Dark Exchange Theme

**Philosophy:** Same as the ERP pass — ~80–90% visual lift, layout/navigation/workflows kept intact. The theme stays **dark**; the existing `.terminal` token palette (deep `#0F1115` bg, `#171A23` cards, finance-blue `#3B82F6`, green/red trade semantics) is the identity and is preserved. We refine depth, contrast, rhythm, and consistency — nothing moves.

The terminal already has a solid foundation (isolated dark tokens, dense exchange tables, tabular-nums, custom scrollbars). This pass elevates it from "functional dark UI" to "premium trading terminal."

## What Gets Better

### 1. Depth & elevation (currently flat)
- Add a terminal-scoped elevation shadow scale (deep, low-opacity black) so cards, popovers, dialogs, and dropdowns read as layered surfaces instead of flat blocks.
- Subtle top highlight / crisper 1px borders on panels for that "glass over dark" exchange feel.
- Keep it restrained — depth, not glow.

### 2. Trading semantics & numbers
- Enforce tabular-nums everywhere prices/quantities/amounts render, so columns align and don't jitter on live updates.
- Consistent buy=green / sell=red / pending=amber usage via the existing `--trade-*` tokens; make directional values (P&L, spread) color-coded consistently.
- Slightly stronger contrast on primary figures vs muted labels for scan-ability.

### 3. Status pills consistency
- Route order/appeal/automation statuses through soft dark-tuned badge treatments (translucent color bg + solid text + optional dot), so every terminal surface shows status the same way instead of ad-hoc colored text.

### 4. Micro-interactions (fast, exchange-appropriate)
- Refine row hover (already present) + add clear focus rings for keyboard/scanning.
- Polish sidebar active/hover state and header spacing.
- Consistent ≤150ms transitions on dropdowns, dialogs, tabs — nothing that delays a trader.

### 5. Consistency cleanup
- Replace the ~15 stray hardcoded colors (`gray-700/800/900`, `slate-400/500`, `#26A17B`) with the terminal tokens (`text-muted-foreground`, `border-border`, `bg-card`, USDT/asset accent) so dark mode is uniform.
- Normalize card padding and section spacing to match the dense-but-breathable exchange rhythm.

### 6. Table & density refinement
- Keep the dense exchange rows; refine cell padding, header micro-labels, zebra/hover contrast, and sticky headers for long order lists.
- Ensure numeric columns right-align with tnum.

## Explicit Non-Goals
- No switch away from dark; no palette identity change; no new accent color.
- No layout, navigation, or control repositioning.
- No workflow, API, Binance-integration, calculation, or data changes.
- No heavy/flashy animations (no blob/parallax added to data views).
- Main ERP (white) theme untouched — this is `.terminal`-scoped only.

## Rollout
1. **Foundation:** terminal elevation tokens + scrollbar/table refinements in `.terminal` CSS block.
2. **Shell:** `TerminalSidebar`, `TerminalHeader` spacing/active/hover polish.
3. **High-traffic surfaces:** Dashboard, Orders, Ad Manager, Payer, Small Payments — apply badge/number/spacing consistency + remove stray hardcoded colors.
4. **Remaining surfaces:** Analytics, MPI, Assets, Appeals, Automation, Settings, Users, Audit/Logs.

## Verification
- Typecheck after each phase.
- Playwright dark-mode screenshots of Dashboard + Orders before/after to confirm recognizability and polish (terminal routes may need auth; capture what's reachable).
- Confirm no ERP (light) theme drift and no shifted controls.
