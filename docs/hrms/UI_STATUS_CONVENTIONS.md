# HRMS UI status conventions

Status in HRMS (and all ERP surfaces) is conveyed by **lucide-react icons + semantic colour tokens** — never by emoji or text glyphs.

Forbidden in rendered UI copy, toast titles, badges, table cells, email subjects and notification titles:
`✅ ❌ ⚠️ ⏰ 📋 🔔 🚨 📅 👤 ✓ ✗ ○ ↗ •` (as decoration/status markers).

Use instead:

| Meaning | Icon | Colour token |
| --- | --- | --- |
| Complete / valid / verified | `CheckCircle2` (or `Check` inside a stepper bubble) | `text-success` |
| Failed / invalid / rejected | `XCircle` | `text-destructive` |
| Pending / not started | `Circle` | `text-muted-foreground` |
| External link | `ExternalLink` | inherits |

Rules:
- Inline sizing: `h-3 w-3` with `text-[10px]/text-xs`, `h-3.5 w-3.5` with `text-sm`; always `shrink-0`.
- Never icon-only without an accessible label (`aria-label` or `title`).
- No hardcoded colour utilities (`text-emerald-600`, `text-white`) — semantic tokens only.
- Lists use `<ul>/<li>` with borders or icons, not `•` characters.
- PDF output has no icon support: use plain words ("Paid", "Verified").
- Email templates: the branded HR/task header carries the visual weight; subjects stay plain text.
