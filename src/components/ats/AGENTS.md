# ATS rules

- ATS visual primitives stay in AtsUi.tsx and compose existing controls, isolating presentation from data contracts.
- Candidate-visible job notes retain the existing benefits storage/feed key, because renaming the presentation must not break external careers consumers.
- Job list controls and multi-line paste formatting share jobTextFormatting and store literal bullet/number markers in existing plain-text fields, because HRMS and external careers-feed consumers must preserve formatting without a new data contract.
- ATS conversation data access lives in src/lib/ats/conversations.ts and the single realtime channel in src/hooks/ats/useAtsMailRealtime.ts (mounted once in AtsWorkspace), so screens share one query-key family and one subscription.
