# Impact Analysis: Erasing Existing Onboarding Systems

## What Would Be Removed

There are **3 existing onboarding systems** to erase:


| System       | File(s)                      | What it does                                                                         |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------ |
| **System 1** | `OnboardingPage.tsx`         | Hired candidates → checklist tasks → "Convert to Employee" button                    |
| **System 2** | `OnboardingChecklistTab.tsx` | Post-creation checklist inside HRMS → Employee Lifecycle tab                         |
| **System 3** | `OnboardingDialog.tsx`       | Quick onboard from `job_applicants` (currently **orphaned** — not imported anywhere) |


Plus supporting pages:

- `OnboardingStagesPage.tsx` — manages `hr_onboarding_stages` and `hr_onboarding_tasks`

## Database Tables Affected

These existing tables would become unused:

- `hr_onboarding_stages` — stage definitions
- `hr_onboarding_tasks` — task definitions per stage
- `hr_onboarding_task_employees` — checklist completion tracking per employee

## Consequences — What Gets Affected

### 1. No other functionality breaks

- `OnboardingDialog.tsx` is **orphaned** (zero imports) — safe to remove
- `OnboardingPage.tsx` and `OnboardingStagesPage.tsx` are **not routed** in `App.tsx` — they exist as files but have no active routes
- `OnboardingChecklistTab.tsx` is used **only** inside `EmployeeLifecycleTab.tsx` as the "Onboarding" sub-tab — replacing it is clean

### 2. Dashboard widget has a minor dependency

- `RealDataWidgets.tsx` queries `hr_candidates` with `start_onboard = true` to show pending onboarding count. This would need to point to the new `hr_employee_onboarding` table instead.

### 3. `hr_candidates` table stays — used elsewhere

- `CandidatesListPage.tsx`, `SkillZonePage.tsx`, `RecruitmentSurveyPage.tsx`, and `HorillaDashboard.tsx` all query `hr_candidates`. The table itself must NOT be dropped — only the onboarding flow built on top of it changes.

### 4. "Convert to Employee" logic disappears — by design

- `OnboardingPage.tsx` has a `convertToEmployeeMutation` that creates `hr_employees` + `hr_employee_work_info` directly. This is exactly what the new pipeline replaces with deferred creation at Stage 5.

## Summary


| Concern                 | Risk                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| Routes breaking         | **None** — the old pages aren't routed in App.tsx                              |
| Other features affected | **Minimal** — only the dashboard widget onboarding count needs re-pointing     |
| Data loss               | **None** — existing `hr_employees` records stay; old tables just become unused |
| `hr_candidates` table   | **Safe** — used by recruitment, skill zones, surveys; stays untouched          |
| `OnboardingDialog.tsx`  | **Zero risk** — already orphaned                                               |


**Verdict**: Safe to fully replace. The only change needed outside the onboarding system itself is updating 1 dashboard widget query. update dashboard widget with new syste widgets