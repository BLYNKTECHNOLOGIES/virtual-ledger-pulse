## Goal

Copy all user profiles registered on the **ESSL OUT** device (`QJT3242100429`) onto the **ESSL IN** device (`ZHM2255300863`) — **excluding PIN 6 (Abhishek Singh) and PIN 7 (Shubham Singh)** — so employees can punch IN on the new device without being re-enrolled from scratch as a user record.

## Important limitation (biometric templates)

The eSSL ADMS/iclock protocol lets us push **USERINFO** rows (`PIN`, `Name`, `Privilege`, `Group`, `Card`) via queued commands. It does **not** let us push fingerprint / face / palm **templates** — our DB only stores template *metadata* (`hr_biometric_device_templates` has `size_bytes` but no template blob).

Consequence:

- ✅ We can duplicate every included user's **PIN + Name + Privilege + Card + Group** onto the IN device.
- ❌ We cannot push their existing **fingerprint / face templates**. Each user re-enrols biometrics on the IN device once (or you use eSSL's PC/USB tool to copy templates from OUT → IN).

Flagged clearly in the UI so nobody assumes fingerprints magically transferred.

## Plan

### 1. New edge function `hr-essl-clone-users`
Input: `{ source_serial, target_serial, exclude_pins?: string[], triggered_by }`.

For each row in `hr_biometric_device_users` where `device_serial = source_serial` AND `pin NOT IN exclude_pins`:
1. Build `C:<seed>:DATA UPDATE USERINFO PIN=<pin>\tName=<safe name>\tPri=<privilege>\tGrp=<group_no>\tCard=<card_no>` (reuse the ASCII/24-char safety helper from `hr-essl-push/index.ts`).
2. Insert into `hr_biometric_device_commands` with `device_serial = target_serial`, `status = 'pending'`.
3. Log to `hr_essl_pushback_log` with `kind='identity'`, `action='DATA UPDATE USERINFO'`, `status='queued'` (or `error`) so Data Health reflects the clone activity.

Skip PINs already present on the target with the same name (idempotent re-runs). Return `{ queued, skipped, excluded, errors }`.

### 2. UI: "Clone users from another device" action

In `src/pages/horilla/BiometricDevicesPage.tsx`, add a menu action that:
1. Opens a small dialog listing other registered devices with user counts as the source.
2. Shows the biometric-template caveat inline.
3. Provides an "Exclude PINs" field (comma-separated) pre-fillable per invocation.
4. On confirm, invokes `hr-essl-clone-users` and toasts `Queued N users · Excluded M · Skipped K`.

### 3. One-time execution for the current pair

Immediately after the function ships, invoke:
```
source_serial=QJT3242100429
target_serial=ZHM2255300863
exclude_pins=["6","7"]     # Abhishek Singh, Shubham Singh
```
Verify: `hr_biometric_device_commands` shows ~36 pending rows on `ZHM2255300863`; they flip to `done` as the device polls (≤30s per heartbeat).

## Technical notes

- Reuses proven command grammar from `supabase/functions/hr-essl-push/index.ts` — no protocol drift.
- `hr_biometric_device_users` for the new device auto-populates on the device's next `QUERY USERINFO` push after ACK — no direct insert needed.
- No schema changes. No changes to attendance ingestion or the IN/OUT direction logic.
- Templates remain out of scope; documented in the UI warning.

## Out of scope

- Pushing fingerprint / face / palm templates (protocol + data unavailable — recommend eSSL PC-tool USB copy or one-time re-enrolment).
- Changes to punch routing, quarantine, or Data Health screens.
