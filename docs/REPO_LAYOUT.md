# Repository layout

Keep the root clean. Anything not part of the shipping app belongs in one of these buckets.

## Locations

| Kind | Location |
|---|---|
| App source | `src/` |
| Edge functions | `supabase/functions/<name>/index.ts` |
| Database migrations | `supabase/migrations/` (agent-managed) |
| HRMS operational docs | `docs/` (top level) |
| State log (living) | `docs/STATE_LOG.md` |
| External API reference PDFs | `docs/reference/<vendor>/` |
| Archived / one-off scripts | `.archive/scripts/` (never imported by app code) |

## Rules

- No scratch `.py` / `.sh` scripts at repo root — move to `.archive/scripts/` with a `.bak` suffix so it's obvious they are not live.
- No third-party API reference PDFs mixed with HRMS-relevant docs — nest under `docs/reference/<vendor>/`.
- When an edge function is retired, delete the folder in the same commit that ships its replacement — do not leave zombie folders. See `hr-promote-scheduled-salary-revisions` (live) vs `apply-scheduled-salary-revisions` (removed).
- Every table-creating migration must include the four-step GRANT / ENABLE RLS / CREATE POLICY sequence per project rules.
