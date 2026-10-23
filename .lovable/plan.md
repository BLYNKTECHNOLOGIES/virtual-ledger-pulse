# TAU-FIX-1 — server-side automation

## Changes
- Replace permissive writes on the five automation tables with the requested rights, administrator shortcut, column guards and range checks; preserve signed-in small-order reads.
- Require pricing-manage for manual pricing; reject paused rules and enforce one manual run per rule per 60 seconds atomically. Restrict auto-pay to internal callers.
- Add the exact schedule/run names requested, schedule-owned rest markers and an IST runner using the existing safe ad-rest path. Offline/rest windows last until their end; online only ends a schedule-owned rest. Never touch a person's rest.
- Select only the most-specific matching reply tier, lowest priority number first; preserve claims and deduplication.
- Deploy changed functions and report each requested verification with actual evidence. Do not execute a real merchant schedule against live ads.

## Technical details and assumptions
- No hand edits under `src/`; generated Supabase types are the only permitted exception.
- Existing ad rests are globally serialized, not independently concurrent per account. Preserve that invariant: any active rest blocks a schedule start; go-online must match the schedule rest's account.
- Atomic occurrence claims persist before external work; uncertain/crashed calls are not blindly replayed. Record failures for review instead of risking duplicate ad switches.
- Add 30-day retention to existing cleanup if available, otherwise one daily cleanup.
- Every-minute scheduling is required for minute-sized windows; announce its 1,440 daily checks and cost trade-off before installing it.
- Real-user rollback probes need an available transaction-capable database connection; user-token checks require authorized test tokens. Report limitations rather than impersonating accounts or claiming unperformed checks.