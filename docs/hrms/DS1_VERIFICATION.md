# DS1 verification — 17 October 2026, 18:52 IST

Database/data only; no screen, hook, edge-function or payroll edits.

| Check | Result |
|---|---|
| Active title/grade/department copies | 37 holders; zero mismatches |
| Active linked logins | Zero mismatches |
| Open onboarding | Zero title/department mismatches |
| Departed title/grade history | 19 rows; unchanged hash `76507581d9468ecaa7bbf275a5ac0aab` |
| Closed onboarding | 59 rows; unchanged full-row hash `244f81d50f708f4e6d300e5af9944d76` |
| Catalogue / reporting | 46 designations; zero blueprint mismatches and loops |
| Grades | L4: 1; L5: 12; L6: 9; L7: 9; L8: 7; NULL: 8; L1–L3: 0 |
| JDs | 41/41 linked; zero title mismatches |
| RACI | Six linked roles; 44 cells each |
| Planning | 15 planned, 20 undecided, 11 outside |
| Workforce before/after | 27 lines, 55 required, 31 on roll, 1 training, 1 joining, net 23; 16 requirements |
| Quiz grades | Four roles, all 8 |
| Rollback probes | Department refusal, designation change, rename, history preservation, cycle refusal, NULL default, grade bounds, clear designation, login sync, work-info insertion, NULL-input approval passed |

The live baseline differed from the prompt before catalogue writes; DS1 preserved the actual totals.

RACI KRA/KPI counts (tables not written): GM 4/12, CTO 4/11, CFO 4/12, Operations Manager 4/14, Internal Compliance Officer 3/10, External Compliance Officer 4/10. RACI IDs, colors, descriptions and ordering were not changed.

All probes rolled back. First catalogue attempt rolled back on legacy grade 9; corrected execution updated grades before clearing old reporting edges. An approval probe initially chose a holder without a registration and rolled back; a matching registration then passed.

459 pre-existing linter findings; none newly introduced. Unrelated remediation excluded.