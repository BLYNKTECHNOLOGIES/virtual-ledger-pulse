# UM-R0 — design review only

No application changes; review of the proposed atomic UI script.

| ID | OK / change | One-line note |
|---|---|---|
| D1 | OK | Preserve existing tab permissions; map `settings` to `online`, fall back only after permissions finish loading, and retain unrelated URL parameters. |
| D2 | OK | Filter before slicing into pages of 50; reset the page on filter changes and derive “No role” from the existing role mapping. |
| D3 | Change | Matrix is fine; templates are an explicit selection-behaviour exception—keep the existing create payload and do not copy Edit role’s function queries/writes. |
| D5 | OK | Remove duplicate save-result toasts only; retain validation, later-operation error handling, audits and self-role permission invalidations. |
| D6 | OK | Replace debug details with the disabled button and reason; retain the exact creation checks and loading state. |
| D7 | OK | “Online now” fits the existing view; it means activity within five minutes, not guaranteed current presence. |
| D8 | Change | Explicit extra-read exception to “every query unchanged”; execute only for Super Admins with the identical pending query and key. |
| D11 | OK | Clear all three picks on Cancel, matching the existing dismiss handler; do not change approval validation or submissions. |
| D12 | OK | Limit `showFallback={false}` to inline action gates; retain page-level denial and every permission check. |
| D16 | OK | Null-safe search fixes the confirmed unsafe `last_name.toLowerCase()`; safely handle every nullable searched field. |
| (a) | OK | The current New user dialog supplies no role, and the live creation RPC inserts none. |
| (b) | Change | Say “Rejects the sign-up and attempts account removal”; deletion errors are not checked, so email/phone reuse is not guaranteed. |
| (c) | Change | Say “Requires sign-in again at the next successful session check”; checks run every 30 seconds, not immediate server-side revocation. |
| (d) | OK | Live `users.role_id` FK is `NO ACTION`; “Move them to another role first” is appropriate for assigned roles. |

- D1/D2/D3/D8/D11/D16 are small behaviour exceptions, not strictly cosmetic; record them explicitly while leaving calls, authorization and audits unchanged.
- Existing provisioning conflict: New user currently calls `create_user_with_password`, whereas the standing rule requires `create-erp-user` for linked Auth/ERP accounts; flag separately, not a silent redesign fix.
- Keep Blynk cyan and existing typography/tokens; tables must fit without unnecessary horizontal scrolling, phone cards must retain all actions, and tier chips must not redefine hierarchy.

## Verification boundary

Reviewed current page/dialog/hook source, live creation function and role foreign key, project rules, and the supplied Horilla repository reference. Account creation, rejection and forced logout were not executed; no test accounts or records were created. The future atomic script still needs review against these constraints.