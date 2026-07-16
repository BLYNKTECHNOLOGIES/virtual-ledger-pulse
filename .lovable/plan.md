# HRMS UI Refinement — Medium Refresh

Refine every major HRMS surface with a consistent visual language. No business logic, permissions, data flows, or workflow changes — presentation only. All colors go through semantic tokens so light and dark themes stay aligned.

## Design language (applied everywhere)

- **Section anatomy**: eyebrow (uppercase 10px tracked) → title → helper line → content. Consistent card padding (`p-4 sm:p-6`), 12–14px radius, hairline border, optional soft tinted gradient by state.
- **Status system**: emerald = done/ok, primary = active/in-progress, amber = pending/attention, destructive = failed, muted = locked/neutral. Same pill shape everywhere: rounded-full, 10px uppercase, bordered, tinted 10% bg.
- **Numbers**: `tabular-nums` on every metric, count, percentage, currency. Stat cards get a single accent glyph, a large tabular number, and a one-line delta.
- **Typography rhythm**: page H1 24/28 semibold tracking-tight; section H2 18 semibold; card title 15/16 semibold; body 13–14; helper 12 muted. Line-height slightly relaxed for helpers.
- **Density**: keep information density but add breathing room between grouped controls (`gap-3`) and between sections (`space-y-6`). Sticky sub-headers where lists get long.
- **Motion**: 150–200ms transitions on hover/active, subtle scale-95 on tap, no bounce.

## Scope by area

### 1. HR shell (HorillaHeader, HRMS layout, home dashboard)

- Refine `HorillaHeader`: tighter height on mobile, clearer active-route indicator, cleaner dark-mode toggle grouping with the profile menu, and a compact breadcrumb slot.
- Left rail: unified active-state (left accent bar + tinted row), consistent icon size, collapsible on desktop with tooltips, off-canvas drawer on mobile.
- HR home cards: convert to a bento-style grid (2 cols on mobile, 3–4 on desktop) with tokenized stat cards, delta chips, and an "Alerts" strip for onboarding gaps and pending approvals.

### 2. Onboarding & Employee list

- Onboarding dashboard header: page title, description, and primary actions in a single sticky bar; secondary filters collapse under a "Filters" chevron on mobile.
- Completeness pills: single unified pill component (DOJ • Designation • Bank • Salary • Identity) with a tri-state (missing / partial / done); tap to jump to the missing section.
- Bulk Completion Panel: split into three quiet cards (Salary, Work info, Bank) each with an inline preview row of what will change; footer summary always visible on mobile.
- Employee list rows: avatar + name + subtitle (badge id · department), status pill on the right, completeness dots underneath on mobile. Swipe row → open profile drawer on mobile.
- Employee profile: consistent tabbed header (Overview / Work / Payroll / Bank / History) using shadcn tabs, hero card with avatar + key facts, and section cards below.

### 3. Attendance & Biometric

- Attendance tabs: sticky month/team filters, day cells with tokenized state colors (present / absent / leave / holiday / weekly-off), legend in a collapsible accordion.
- Punch view: two-column timeline (in / out) with device chip, replacing the current text-heavy list.
- Biometric Devices page: card grid with device status dot (online/offline/never-seen), last-heartbeat relative time, and a compact "commands queue" strip. Details drawer instead of full-page modals.
- Biometric Device Data Dialog: staged progress (Fetch → Acknowledge → Cleanup) with a linear stepper and live counts.

### 4. Payroll & RazorpayX Sync

- Salary Revision Dialog: three-step layout (Effective date → New CTC & break-up → Review), sticky footer with primary action, mobile full-height.
- Payroll pages: run-month picker as a segmented control, KPI strip (headcount • gross • net • tax • pending) using the shared stat card.
- RazorpayX Sync page: keep the station roadmap already refined; align surrounding cards to the new anatomy (eyebrow + title + helper), unify the "How this page works" glossary as a dismissible callout, and give the Simple/Advanced toggle a segmented control style.
- Bulk Push confirmation dialogs: consistent masked-value chips and a diff-preview list with additions/removals color-tokenized.

## Order of execution

1. HR shell + shared primitives (StatCard, SectionHeader, StatusPill, CompletenessPill, Stepper) — 1 pass, unlocks the rest.
2. RazorpayX Sync + Salary Revision (payroll cluster).
3. Onboarding dashboard, Bulk Completion, Employee list & profile.
4. Attendance tabs, Punch view, Biometric devices.

Each step is a self-contained batch; the app stays functional between batches.

## Technical notes

- Add reusable primitives under `src/components/hrms/` (SectionHeader, StatCard, StatusPill, CompletenessPill, Stepper, KpiStrip). All use `cn` + semantic tokens, no hardcoded colors.
- Extend `index.css` only if a new token is truly missing (e.g. `--warning`, `--warning-foreground`). Prefer using existing `--primary`, `--muted`, `--accent`, `--destructive`, `--emerald-*` via tailwind's palette for status accents.
- Zero changes to: routes, permissions, RPCs, edge functions, database, react-query keys, forms' validation, or any business rule (payroll math, LOP, KYC, RazorpayX pilots, biometric ack, etc.).
- Mobile: every long list gets `overflow-x-auto no-scrollbar` rails or vertical stacks; every dialog fills the viewport on `sm` down; every sticky bar respects safe-area insets.

## Out of scope

- No new features, no data-model or API changes.
- No changes to notification behavior, toasts copy, or existing dialogs' fields.
- No changes to auth, RLS, or edge functions.

I'll start with step 1 (shell + shared primitives) once you approve.
