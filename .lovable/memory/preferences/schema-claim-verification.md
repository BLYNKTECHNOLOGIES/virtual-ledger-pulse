---
name: Schema claim verification
description: Never claim a table/column/enum/permission/endpoint as confirmed without checking source; NEW enum values written by code must be pre-verified against pg_enum in the same pass.
type: preference
---
Never state a schema object as "confirmed" without checking information_schema / pg_enum / source.

**Extension (enum-drift class, 3rd recurrence):** Any NEW enum value that code (trigger/function/edge fn) WRITES must be verified against `pg_enum` in the same pass — a failing trigger aborts the whole statement, so an invalid enum write silently arms a landmine that fires later once data flows.

**How to apply:** Before shipping any `UPDATE ... SET status = 'xyz'` or `INSERT ... 'xyz'` where the column is an enum, run `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'type_name'::regtype` and confirm the literal exists — or `ALTER TYPE ... ADD VALUE` in the same migration.
