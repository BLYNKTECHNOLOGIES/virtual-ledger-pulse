# UI/UX Audit — Monthly Payroll Cockpit + all 10 step tools

Presentation-only audit. No query, RPC, edge-function, mutation, gate, permission or workflow change is proposed anywhere below. Deliverable requested: report first, implementation only after approval.

## 1. Cockpit main page (`MonthlyPayrollCockpitPage.tsx`, 549 lines)

What exists today: a page header, a control card (month select + "x/10 steps complete" + Close month), a flat "Tools" chip row of 9 buttons, then 10 equally-weighted step cards stacked vertically.

Findings:

1. **No sense of "where am I".** All 10 cards look the same weight; the one step that actually needs action today is not distinguishable from the seven that are done or not yet due. There is no progress rail, no "current step" anchor, no jump list.
2. **Progress is a bare number.** `doneCount/10` is text only — no bar, no per-stage grouping (attendance → compensation → run → reconcile → close).
3. **Tools row is undifferentiated.** Nine identical secondary buttons, several of which duplicate the per-step "Open …" button, with no grouping (routine vs diagnostics) and no icons.
4. **Hardcoded colour utilities** (`text-emerald-500`, `bg-blue-500/15`, `text-amber-500`, `bg-emerald-600/15`) in StepBadge / StepIcon / card borders / DetailLine — breaks theming and violates the project's semantic-token rule. Should be `success` / `info`-style tokens plus destructive/warning tokens.
5. **Status vocabulary is inconsistent**: "Done", "Auto", "Ready to acknowledge", "Pending", "Skipped", "Blocked" mix acknowledgement state and live state in one badge, so an operator can't tell "system says complete" from "human confirmed".
6. **Action column is bottom-anchored on mobile.** At 390px the card collapses to icon block → detail → buttons; the primary "Mark done" ends up below a long detail sentence, and buttons are `size="sm"` (below comfortable tap target).
7. **Blocked-state copy is buried.** The step-5 gate reasons render as small amber text inside the middle column instead of as a prominent, scannable blocker list next to the disabled action.
8. **Close month affordance** shows "Close month (N blockers)" as an outline button that opens a dialog only to say "cannot close" — the blocker list should be visible/expandable inline before clicking.
9. **No dense/compact mode and no collapse for completed steps** — a fully-closed month still requires scrolling 10 tall cards.
10. **Full-width not used.** Cards stretch, but content sits in three fixed-ish columns (`min-w-[280px]` / `min-w-[200px]`) with a lot of dead space on wide desktops.

## 2. Per-step findings (tools opened via `CockpitToolSheet`)

| # | Step | Tool | Key UI/UX issues |
|---|---|---|---|
| 1 | Lock attendance | AttendancePeriodLockPage (373) | Dialog-driven; lock state not summarised as a timeline; no visual of which date ranges are locked |
| 2 | Watchdog / stale sessions | AttendanceStaleSessionsPage (279) | Plain table, no severity ordering or empty-state celebration; row actions not grouped |
| 3 | Salary revisions | SalaryRevisionsPage (868) | Heaviest offender after diagnostics: tab filters + wide table + tooltip-only explanations; critical push/verify state hidden in tooltips instead of visible badges |
| 4 | LOP push | PayrollInputsPage (803), deduction tab + `focus=lop` | Opens the generic inputs page; the LOP focus is not visually announced, so the operator lands on a full additions/deductions screen and must re-orient |
| 5 | Inputs push | PayrollInputsPage (803) | Two tabs with near-identical dense tables; verification state (`pushed` vs `readback verified`) needs a consistent two-stage indicator; bulk dialog is a separate 412-line surface with its own layout language |
| 6 | Run on RazorpayX | external link | Only step with no in-app surface — the card should read as an explicit hand-off (external panel styling), currently it looks like the others with amber body text |
| 7 | Import payslips / emails | PayslipEmailDispatchPanel (720) + PayslipHistoryImportPage (335) | Two different container widths (`max-w-5xl` vs `md:max-w-6xl` dialog) inside a full-bleed sheet; import → email sequence isn't shown as a sequence |
| 8 | Shadow compare | ShadowPayrollPage (537) | `max-w-7xl mx-auto` inside an already-centred sheet → double gutters; variance results need a clearer headline number before the table |
| 9 | Drift review | DataHealthPage | Already redesigned (command bar + worklist) — should become the visual template the rest adopt |
| 10 | Close month | in-page dialog | See finding 8 above |
| — | Salary register import | SalaryRegisterImportPage (884) | Long single-column flow; upload → map → preview → commit not shown as stages |
| — | System pulse | SystemPulsePage (445) | Tile grid fine; colour tokens hardcoded |
| — | RazorpayX diagnostics | RazorpaySyncPage (3407) | Largest surface in the module: `p-6 max-w-6xl` (wastes wide screens), 64 hardcoded colour utilities, a `▼` glyph in a section comment, many long truncated-error tables, sticky roadmap navigator competing with the cockpit's own chrome |

Cross-cutting issues in the sheet layer (`CockpitToolSheet.tsx`): each tool brings its own page padding, own max-width, and own header, so opening two tools in a row feels like two different products. The sheet header is a thin bar with only a title and "Back to cockpit" — no month context, no step number, no breadcrumb back to the step that opened it.

## 3. Recommended improvements (presentation only)

**Cockpit shell**
- Stage-grouped progress rail at the top (Attendance · Compensation · Run · Reconcile · Close) with a real progress bar and a "current step" anchor button that scrolls to the first actionable step.
- Split the badge into two small chips: *system* (live status) and *you* (acknowledgement) — keeps all existing states, removes the ambiguity.
- Completed steps collapse to a single dense row; the active step renders expanded and visually elevated.
- Blockers surfaced inline: a compact list next to the disabled action, and the same list mirrored in the Close-month card before the dialog.
- Tools row split into "Routine" and "Diagnostics" groups with icons; per-step duplicates de-emphasised.
- Replace every hardcoded colour utility with semantic tokens; icons per `docs/hrms/UI_STATUS_CONVENTIONS.md`.
- Mobile: action buttons move to a full-width sticky footer inside the card, minimum 40px targets.
- Desktop: content grid widens (`xl` two-column detail) so long detail lines don't wrap in a 280px gutter.

**Sheet layer**
- One shared tool shell: consistent padding, full-bleed width, and a header showing `Step N · <label> · <month>` plus Back-to-cockpit. Individual tool pages drop their own `max-w-*` and outer padding when rendered inside the sheet (they keep it when routed standalone).

**Per tool**
- Adopt the Data Health pattern (sticky command bar + KPI strip + worklist) for Salary Revisions, Payroll Inputs, Stale Sessions, System Pulse and RazorpayX Diagnostics.
- Payroll Inputs: announce the LOP focus with a filter chip when opened from step 4; two-stage push/verify indicator used identically in both tabs.
- Shadow Payroll and Salary Register: stage strip (Upload → Map → Preview → Commit / Run → Compare → Explain) above the existing content.
- RazorpayX Diagnostics: remove the width cap, tokenise colours, drop the glyph, collapse the probe tables into accordion sections.

**Explicitly unchanged:** all react-query keys and RPC calls (`hr_cockpit_month_state`, `hr_cockpit_ack_step`, `hr_close_payroll_month`), the step-5 gate logic in `usePayrollStepGate`, URL params (`period`, `tab`, `focus`), the acknowledge/undo/close dialogs' behaviour, permissions, and every push/verify path.

## 4. Suggested delivery order (after approval)

1. Cockpit shell (progress rail, step card redesign, tokens, mobile actions).
2. Shared sheet shell + width/padding normalisation across all tools.
3. Payroll Inputs + Salary Revisions (steps 3–5, highest daily usage).
4. Shadow Payroll, Salary Register, Payslip import/email stage strips.
5. RazorpayX Diagnostics and System Pulse cleanup.

Each stage ends with typecheck + build and a visual pass at 390px and 1440px.
