# ERP-Wide UI/UX Audit & Improvement Plan

> Scope: main ERP app shell + modules. EXCLUDED: `src/pages/terminal/**`, `src/components/terminal/**`, login/register, all Supabase/edge/hook business logic. Frontend/presentation only. **Note:** dev auth is `external_unmanaged`, so authenticated pages could not be screenshotted — findings are from static source analysis of App.tsx, the shell (Layout/AppSidebar/TopHeader/MobileBottomNav), `index.css` tokens, and representative page/component sources.

## 1. Module-by-module

| Route | Module | Grade | Top issues |
|---|---|---|---|
| /dashboard | Dashboard | B | `h1` = `text-xl md:text-2xl` (differs from peers); DB-persisted layout must be preserved; verify KPI cards use tinted-icon + hover-lift pattern uniformly |
| /sales | Sales | B | `h1` = `text-xl md:text-3xl` (unique scale); dense toolbars; check TableSkeleton on all tabs |
| /purchase | Purchase | B | mirrors Sales; header/toolbar drift vs Sales |
| /bams | BAMS | B | verify tinted-badge + skeleton consistency; mobile 390px table overflow |
| /clients | Clients | B | `h1` = `text-2xl` vs 3xl elsewhere; empty/skeleton coverage |
| /clients/:id | Client Detail | B | tab-heavy; mobile tab scroll + header actions crowding |
| /ra-dashboard | RA Dashboard | C? | confirm skeletons/empty states exist |
| /leads | Leads | C? | confirm design-system alignment (badges, table header style) |
| /user-management | User Management | B | dialog-heavy; focus-ring/label a11y pass |
| /compliance | Compliance | C? | verify skeletons + empty states |
| /stock | Stock Mgmt | B | `text-2xl` header; numeric right-align/tabular-nums audit |
| /accounting | Accounting | B | `text-2xl` header; multi-tab loading states |
| /statistics | Statistics | B | `text-3xl` header (outlier high); chart color tokens |
| /profit-loss | Profit & Loss | B- | many `text-2xl font-bold` KPI values (font-weight drift); **no print stylesheet** for a report page |
| /financials | Financials | B- | `text-3xl`; **hardcoded hex chart colors** `#059669`/`#dc2626` (lines 344-351); no print styles |
| /risk-management | Risk Mgmt | C? | verify empty states/skeletons |
| /ad-manager | Ad Manager | B | uses TableSkeleton; check header pattern |
| /tasks, /erp-entry, /reconciliation | Ops | B | verify skeleton/empty parity |
| /utility (+invoice-creator, payment-screenshot) | Utility | C? | landing hub polish; generator pages layout |
| /profile, /shortcuts, /raci | Misc | C? | low-traffic; header consistency |
| /hrms/** (~90 routes) | HRMS (Horilla) | B-/C | presentation-only in scope; heavy volume, inconsistent headers/skeletons across sub-pages; treat as one workstream |
| * (404) | NotFound | C | unbranded bare page, raw `<a href="/">`, `bg-muted`, no shell/logo |

## 2. Cross-cutting findings (specific)

**A. No route-level code-splitting (highest bundle impact).** `src/App.tsx` statically imports ~130 page modules (0 `React.lazy`/`Suspense`). Entire HRMS + all ERP pages ship in the initial bundle. File: `src/App.tsx` (lines ~1-135 imports).

**B. No shared PageHeader component.** Heading scale varies per page: `text-3xl` (Statistics, Financials), `text-2xl` (Stock, Accounting, Clients, Dashboard@md), `text-xl md:text-3xl` (Sales). Weight varies `font-semibold` vs `font-bold` (ProfitLoss KPIs). No single title/description/actions primitive.

**C. Hardcoded colors bypassing tokens.** `src/pages/Financials.tsx` lines 344-351 use raw hex `#059669`, `#dc2626` in Recharts fills/strokes instead of `hsl(var(--success))`/`hsl(var(--destructive))`.

**D. No print stylesheet.** `rg "@media print"` → none. Report pages (ProfitLoss, Financials, statements, invoices) have no print layout.

**E. Inconsistent loading/empty states.** `TableSkeleton`/`CardSkeleton` exist (`src/components/ui/skeleton.tsx`) but referenced in only ~9 non-terminal/non-HRMS files; many pages likely use ad-hoc spinners or none.

**F. Sidebar shell brand + a11y.** `AppSidebar.tsx` header is a flat `bg-primary` block; loading state uses `animate-pulse`/`animate-spin`. Footer hardcodes `© 2025`. Good: correct brand logos already wired (`blynk-logo-white.svg`, `blynk-icon.svg`) — must be preserved. Opportunity for a tasteful brand moment (subtle) without gradient overload.

**G. 404/fallback unbranded.** `src/pages/NotFound.tsx` is outside the app shell, uses raw anchor + `text-4xl font-bold`, no logo/CTA button.

**H. Positives (preserve).** No `confirm()` usage (AlertDialog pattern holds); `.page-mount`/`.stagger-children` motion utilities present; main-ERP command palette exists (`src/components/shortcuts/CommandPalette.tsx` + `ShortcutsProvider`); token system in `index.css` is well-structured for light/dark.

## 3. Prioritized phased plan (frontend-only)

**Phase 1 — Route code-splitting (impact: high / effort: med).** Convert `src/App.tsx` page imports to `React.lazy` + a single `<Suspense>` fallback (branded skeleton). Keep the shell (Layout, providers, AuthCheck) eager. Preserve all route paths, guards, and the terminal/HRMS/login trees exactly. *Pure frontend; touches only App.tsx + a fallback component.*

**Phase 2 — Shared PageHeader + heading scale normalization (high / low).** Add `src/components/shared/PageHeader.tsx` (title/description/actions slots, one type scale e.g. `text-2xl font-semibold tracking-tight`). Adopt across Dashboard, Sales, Purchase, Clients, Stock, Accounting, Statistics, ProfitLoss, Financials. Presentation-only swaps.

**Phase 3 — Loading/empty-state consistency (med / med).** Standardize `TableSkeleton`/`CardSkeleton` + a shared `EmptyState` (icon tile + copy + optional CTA) across ERP pages lacking them. No data logic changes — only render-branch UI.

**Phase 4 — Token hygiene + report print styles (med / low-med).** Replace hardcoded hex in `Financials.tsx` charts with semantic tokens; add a scoped `@media print` block in `index.css` for report/statement/invoice pages (hide nav/toolbars, black-on-white tables). Verify dark-mode completeness on flagged pages.

**Phase 5 — Shell brand moments + 404 polish (low-med / low).** Subtle brand treatment in sidebar header + a branded, shell-consistent `NotFound` (logo, `Button` CTA, tokens). Restrained — no gradient overload. Preserve existing logos and DB-persisted sidebar order.

**Phase 6 — HRMS presentation sweep (med / high).** Apply PageHeader + skeleton/empty primitives across `src/pages/horilla/**` in grouped passes (employee, attendance, leave, payroll, recruitment, PMS). Presentation-only; **flag review** because volume increases regression risk.

*Any item that would require reading/altering a query, mutation, or hook is out of scope and must be flagged before implementation.*

## 4. Quick wins (≤10)
1. Replace `#059669`/`#dc2626` in `Financials.tsx` with success/destructive tokens.
2. Normalize all page `h1` to one scale via PageHeader.
3. Branded, shell-aware `NotFound` with `Button` CTA (drop raw `<a>`).
4. Make sidebar `© 2025` a dynamic year.
5. Swap sidebar loading `animate-pulse` for token skeleton.
6. Ensure every table header uses `bg-muted/50` 11px uppercase pattern.
7. Right-align + `tabular-nums` on all numeric cells (ProfitLoss/Financials/Stock).
8. Add `@media print` to hide chrome on report pages.
9. Add `<Suspense>` branded fallback for lazy routes.
10. Audit focus rings/labels on User-Management dialogs.

## 5. Protected zones (do not modify)
- Terminal: `src/pages/terminal/**`, `src/components/terminal/**` (just redesigned).
- Login/register (just rebuilt).
- New brand logos (`src/assets/brand/*`).
- Dashboard layout DB persistence, per-user quick replies, cross-account appeal sync — preserve exactly.
- All Supabase/edge/hook business logic — no changes.

## Deliverable note
On approval (build mode), this audit will be written verbatim to `.lovable/erp-audit.md`, and the chat reply will be kept to ≤10 lines listing the phase titles only.