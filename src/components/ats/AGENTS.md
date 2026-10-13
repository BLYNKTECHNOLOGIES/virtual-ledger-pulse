# ATS rules

- ATS visual primitives stay in AtsUi.tsx and compose existing controls, isolating presentation from data contracts.
- ATS conversation data access lives in src/lib/ats/conversations.ts and the single realtime channel in src/hooks/ats/useAtsMailRealtime.ts (mounted once in AtsWorkspace), so screens share one query-key family and one subscription.
