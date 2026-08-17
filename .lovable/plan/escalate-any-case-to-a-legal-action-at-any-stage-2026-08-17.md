# Escalate any case to a legal action, at any stage

Today a legal action can only be created standalone from Compliance → Legal. There is no link between a bank case (or a regulatory case) and the legal action that follows from it — `legal_actions` has no case reference column. This plan adds an "Escalate to legal action" flow that works mid-case, keeps both records linked, and shows the linkage on both sides.

## Flow

```text
Bank case (any status except CLOSED)
  └─ [Escalate to legal] button on the case card
        └─ dialog: prefilled from the case (title, bank, amount, description)
             + asks legal-only fields (action type, court, opposing party,
               our lawyer, filing date, next hearing, estimated cost, reason)
                  └─ creates legal_actions row linked to the case
                     + writes a timeline entry on the case
                     + optionally moves case status to ESCALATED
```

Same button is added on regulatory cases so an FIU/RBI matter can also spawn a legal action.

## What gets built

1. **Linkage columns** on `legal_actions`: `bank_case_id`, `regulatory_case_id` (both nullable, FK, indexed) and `escalation_reason`.
2. **EscalateToLegalDialog** — a shared dialog reused by bank cases and regulatory cases:
   - Read-only summary of the source case (case number, bank, type, amount, status).
   - Prefill: title from case title, description from case description, opposing party from bank name where relevant.
   - Required: action type, title, escalation reason. Optional: court, case number, lawyers, dates, estimated cost, priority.
   - Guard: if the case already has a linked legal action, show it and ask to confirm creating another.
3. **Case card action** in Compliance → Banking → Cases: an "Escalate to legal" button, permission-gated (same manage permission used for changing case type), hidden for RESOLVED/CLOSED cases. Once linked, the card shows a "Legal action" chip that deep-links to the Legal tab.
4. **Regulatory cases tab**: same escalate action on each open regulatory case.
5. **Legal tab**: each legal action shows its source case badge (bank case number or regulatory reference) and a filter for "linked to a case / standalone".
6. **Audit**: every escalation writes to `compliance_case_updates` (for bank cases) with the reason, chosen action type and created legal action id, so it appears in the existing case timeline.

## Technical notes

- Migration: `ALTER TABLE public.legal_actions ADD COLUMN bank_case_id uuid REFERENCES public.bank_cases(id) ON DELETE SET NULL, ADD COLUMN regulatory_case_id uuid REFERENCES public.compliance_regulatory_cases(id) ON DELETE SET NULL, ADD COLUMN escalation_reason text;` plus indexes. Existing RLS on `legal_actions` is unchanged.
- No case status is force-changed; a checkbox in the dialog optionally sets the bank case status to `ESCALATED` (only if that value already exists in the case status options — otherwise the checkbox is omitted).
- Creation and the timeline insert run sequentially; failure of the timeline write does not orphan the legal action (it is reported as a warning).
- Command Centre KPIs already read `legal_actions` for hearings; linked actions flow into those counts automatically with no RPC change.
