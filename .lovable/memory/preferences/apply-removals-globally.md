---
name: Apply removals/changes everywhere, not just the screenshotted spot
description: When the owner says a metric/element is useless, remove it across every surface that shows it; ask if scope is unclear
type: preference
---

When the owner says something is "of no use" / should be removed / changed, treat it as a **global instruction**, not a one-widget fix.

**How to apply:**
1. Grep the whole codebase for that field/label/metric before editing.
2. Remove or change it in every surface that renders it (summary strips, desk/zone headers, tables, tooltips, exports, widgets).
3. If some occurrence is arguably still useful, ASK before leaving it in — never silently keep it.

**Why:** Partial application forces the owner to re-report the same issue (e.g. "surplus" removed from the ads summary strip but left in the Buy/Sell Desk headers).
