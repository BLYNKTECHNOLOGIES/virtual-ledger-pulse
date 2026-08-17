# HRMS Glyph & Emoji Cleanup — Full Audit Pass

A repo scan shows the earlier pass removed most pictographic emoji from HRMS, but a second class of informal markers is still in the code: text glyphs used as status indicators (`✓`, `✗`, `○`, `↗`, `•`, `Auto ✓`, `Hire ✓`, `Cancel ✗`) plus a few leftover emoji in shared ERP surfaces. The `✅ Done` in the screenshot comes from a stale preview build of the onboarding table — the current source renders plain `Done`, and the checklist chips there still use `○`/`✓`, which is the real remaining issue on that screen.

## What will change

**1. Status glyphs become real icons**
Every `✓ / ✗ / ○` used as a status marker is replaced with `lucide-react` icons (`CheckCircle2`, `XCircle`, `Circle`, `MinusCircle`) sized to the surrounding text and coloured with semantic tokens (`text-success`, `text-destructive`, `text-muted-foreground`) — no hardcoded colours.

Files: OnboardingDashboard (checklist chips Bank/Salary/DOJ, both table and mobile views), OnboardingWizard (stepper "done" marker), Stage3Documents (Valid PAN), ResignationTab (completion summary), BiometricDeviceDataDialog, BiometricReportUploader, RazorpaySyncPage, MonthlyPayrollCockpitPage ("Auto ✓"), NetVarianceBridge ("ties out ✓"), HorillaDashboard, HRLogsPage, AttendancePunchesPage, RecruitmentPipelinePage (Hire/Cancel), CandidateProfilePage, PayslipsPage PDF (glyph replaced with plain "Paid" text, since PDFs can't render icons).

**2. Onboarding records table gets a proper checklist presentation**
The `○ Bank / ○ Salary / ○ DOJ` chips become compact status pills with an icon plus label, so complete vs. pending reads instantly instead of relying on a circle character.

**3. External-link arrows**
`↗` after "Edit on RazorpayX" / "Open RazorpayX" is replaced with the `ExternalLink` icon (EmployeeSalaryStructure, PayrollDashboardPage).

**4. Bullet characters in UI copy**
`•` used inside rendered lists becomes real `<ul>/<li>` markup or a separator element. `•` used purely as a metadata separator between fields (e.g. "12 imported • 3 skipped") is kept where it reads as typography, not decoration, but standardised to a muted separator span.

**5. Remaining emoji in HR-adjacent and shared ERP surfaces**
Toast titles like `"✅ Success!"` / `"❌ Error"` in UserProfile and ResetPasswordDialog lose the emoji (variant styling already conveys success/failure). HR-related notification/email templates and task emails (`📋`, `⚠️`, `⏰`, `🔔`, `🚨`, `📅`, `👤`) get plain, professional subject lines and label text with the branded HR/task header carrying the visual weight.

**6. Guardrail**
A short note is added to the HRMS conventions doc: status is conveyed by lucide icons + semantic colour tokens, never by emoji or text glyphs.

## Technical notes

- Icon sizing standard: `h-3.5 w-3.5` inline with `text-xs`, `h-4 w-4` with `text-sm`, always `shrink-0` and paired with an accessible text label (no icon-only status without a `title`/`sr-only` label).
- Colours strictly via existing tokens; no `text-emerald-600`-style literals introduced (the one existing literal in Stage3Documents is converted to `text-success` while it is touched).
- Edge function email templates are text/HTML strings — changes there are copy-only, no logic change; affected functions are redeployed and one sample email verified after the change.
- Preview staleness on the onboarding table will be confirmed by rendering the page after the change to make sure no emoji remains.

## Out of scope

Terminal chat surfaces (`ChatBubble`, `ChatImageUpload`, `useBinanceChatWebSocket`) where emoji are user-generated message content or reaction pickers — those stay untouched.
