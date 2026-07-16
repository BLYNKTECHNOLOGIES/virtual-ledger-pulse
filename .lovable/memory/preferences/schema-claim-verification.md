---
name: Schema claim verification
description: Never claim a schema object as confirmed without checking source; every schema identifier written by new code (columns, NEW./OLD. fields, enum literals, permissions, endpoints) must be pre-verified in the same pass.
type: preference
---
Never state a schema object as "confirmed" without checking information_schema / pg_enum / source.

**Generalized rule (4 recurrences: enum-drift + plpgsql late-binding column ref):** EVERY schema identifier appearing in newly written code must be verified against the live schema in the same pass. plpgsql resolves `NEW.<field>` at runtime, so a wrong column name compiles clean and only fires later — same landmine shape as an invalid enum literal.

**Checklist before shipping any SQL / trigger / edge fn:**
- Table names → `information_schema.tables`
- Column names (incl. every `NEW.x` / `OLD.x` in triggers) → `information_schema.columns`
- Enum literals written by code → `pg_enum` (or `ALTER TYPE ADD VALUE` in same migration)
- Permission strings → `app_permission` enum
- API endpoints → source collection/doc
