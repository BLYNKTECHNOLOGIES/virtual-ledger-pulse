# Quiz (Blynk CBT) inside HRMS

Build the role-based pre-interview screening test from the uploaded specification as a new **Quiz** area under HRMS, plus a public candidate test runner. The specification is implemented in full, but in phases — each phase is verified before the next starts.

## How it fits this ERP (differences from the uploaded brief)

The brief assumes a standalone app on a fresh backend. Adapted decisions:

- Everything lives in this project on the existing connected database. All new tables are prefixed `cbt_` so nothing collides with HRMS/ERP tables.
- Candidates never sign in and never see HRMS. They use a public route `/test` (start → register → instructions → sections → finish), reached with the 6-character drive code. Only the edge functions touch data on their behalf.
- Staff screens live under `/hrms/quiz/*` with a new "Quiz" group in the HRMS sidebar. Access is gated by new granular permissions (`quiz_view`, `quiz_manage`, `quiz_evaluate`, `quiz_admin`) mapped onto the existing role matrix — so an evaluator can grade written answers without seeing candidate identities or any other HRMS data.
- Candidate identity, retention and consent follow the brief. Client emails rule does not apply here: candidate email is required by the brief for HR contact.
- The brief's indigo light-theme tokens are scoped to the Quiz/test surfaces only (a `cbt` token namespace), so the ERP's own Blynk cyan theme is untouched.
- Existing recruitment candidates are linked by mobile number where one already exists, so a screened candidate can be opened from the recruitment pipeline later.

## Phases

### Phase 1 — Data and scoring core
- All tables from the brief (settings, roles/blueprints, question bank with versions and separate answer keys, drives, candidates, attempts, sections, items, written evaluations, extensions, resume codes, proctor events, rate limits, audit log), RLS on every one, grants tuned per role.
- Attempt reference sequence `BVT-CBT-2026-000123`.
- Scoring functions in Postgres only: `cbt_score_section`, `cbt_finalize_attempt`, `cbt_sweep_attempt`, `cbt_sweep_expired`, `cbt_rescore_attempt`, all SECURITY DEFINER with fixed search_path.
- Typing, data entry, match-pair, objective (MCQ/numeric/SJT) and written scoring exactly as specified, including gates, weights, negative marking and the two test vectors (typing 19.6/21.2/87.5 and data entry 75.0) proven by SQL before moving on.
- Nightly sweep + retention job on cron.

### Phase 2 — Candidate edge functions
Code-verify, register, instructions/start, section start, save answer, typing sync (prefix-extend only, 409 otherwise), submit section, heartbeat, resume, proctor event, finish. Server clock authoritative (`server_now` in every response), blueprint snapshot frozen at start, rate limiting and lockout, device block for phones/tablets, single active session by nonce.

### Phase 3 — Candidate test runner UI
Public `/test` flow built for 1366×768: top bar with section rail and timer pill, objective layout with question palette and all five palette states, typing word-commit screen with 3-line passage window, data entry two-column screen, match-pairs screen with M/X keys, written screen with word count, transition screens, submit/time-up modals, full-screen enforcement with warning ladder, copy/paste blocking, autosave state. All wording used verbatim from the brief.

### Phase 4 — HRMS Quiz staff area
Sidebar group "Quiz" with: Dashboard, Drives, Candidates & Attempts, Attempt detail (section breakdown, gates, proctor timeline, re-score, grant time, invalidate, resume code), Evaluations (blind written grading queue), Question bank (versions, approval workflow, key corrections with re-score offer), Roles & blueprints, Settings. Decision badges and score colouring per the brief, works from 1280px up.

### Phase 5 — Seed content and verification
12 role blueprints with their exact sections, weights, gates and cut-offs; 3 typing passages (450+ words) and the practice passage; 16 data entry records; 40 match pairs; 3 items per objective tag; 1 reading stimulus with 5 questions; 1 written prompt per tag — all seeded as "needs review" so nothing is served until a super admin approves it. Then the brief's verification list is run end to end (sandbox drive attempt, gate failure, auto-submit, resume, key correction re-score), plus `docs/SPEC.md` saved verbatim and a dated State Log entry.

## Technical notes

- Scoring never happens in the browser; live WPM on screen is display-only.
- Question keys sit in their own table readable only by staff roles; edge functions read them through the scoring functions, never over the API.
- Served question versions become immutable; edits fork a new version, and key corrections write an audit row and can re-score affected attempts.
- Cron: expired-attempt sweep every minute, abandonment sweep, retention anonymiser daily.
- Verification at each phase is done by me against the live database and a real sandbox attempt, not by inspection alone.

## Open point

Phase 1 and 2 are backend-only, so nothing visible changes until Phase 3. I will report after each phase.
