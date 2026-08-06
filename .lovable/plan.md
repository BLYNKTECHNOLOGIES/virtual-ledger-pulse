# Show ERP account link status on the employee Asset tab

## Goal
On each employee's Asset tab, show clearly whether that person has an ERP account linked to their HRMS record (via badge ID), so gaps in ERP account creation are visible.

## What the user sees

A new "ERP Account" card sits above "Assigned Assets" with one of these states:

- **Linked** (green): shows the ERP user's name, email, role and badge ID used for the match.
- **Linked by email only** (amber): an ERP account exists with the same email, but the ERP user record has no badge ID (or a different one) — flagged as "Badge ID not set on ERP account", since badge ID is the intended anchor.
- **No ERP account** (red): no ERP user matches by badge ID or email.
- **No badge ID on HRMS record** (amber): the employee has no badge ID, so linking cannot be anchored.

The card is read-only (no account creation from here).

## Current state found
- 34 active employees; only 4 match an ERP user by badge ID, 19 more match by email, 11 have no ERP account at all. Only 7 of 36 ERP users carry a badge ID — so a badge-only check alone would look alarmingly empty; the email fallback plus a "badge missing" warning gives the true picture.

## Technical notes
- Edit `src/pages/horilla/EmployeeProfilePage.tsx`, Asset tab block (~line 1338).
- New react-query hook in the same file: query `users` for `id, name, email, badge_id, role_id, is_active` filtered by the employee's badge ID (case/space-insensitive) and, separately, by email; prefer the badge match.
- Render with existing HRMS primitives (`StatusPill` tones emerald / amber / destructive), matching the card styling used elsewhere on the page. Mobile card + desktop layout consistent with the current tab.
- No schema, RLS, or backend changes; no writes.
