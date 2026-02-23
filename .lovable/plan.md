

# Biometric (Fingerprint) Authentication for Terminal Access

## Overview

This plan implements **WebAuthn-based biometric authentication** (fingerprint, Face ID, Windows Hello) as a mandatory second factor for accessing the P2P Trading Terminal. It also adds an **automatic session timeout** after inactivity.

## How It Works (Non-Technical)

1. **One-time setup**: When a user first tries to access the Terminal, they will be prompted to register their fingerprint (or Face ID / Windows Hello depending on their device). This is a one-time process per device.

2. **Every Terminal access**: After logging into the ERP normally (email + password), whenever the user navigates to the Terminal, a biometric prompt appears. They must verify their fingerprint to enter.

3. **Auto-lockout**: If the user is inactive in the Terminal for 12 minutes, the Terminal session locks automatically. They must re-authenticate with their fingerprint to continue.

4. **Device support**: Works on laptops with fingerprint readers, phones with fingerprint/Face ID, and Windows Hello. If a device has no biometric hardware, a security key (USB) can be used as fallback.

---

## Technical Implementation

### 1. Database Changes

**New table: `terminal_webauthn_credentials`**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Credential record ID |
| user_id | uuid (FK -> users) | The user who owns this credential |
| credential_id | text | WebAuthn credential ID (base64url) |
| public_key | text | Stored public key (base64url) |
| sign_count | integer | Replay attack counter |
| device_name | text | Friendly name (e.g. "MacBook Pro") |
| created_at | timestamptz | When registered |
| last_used_at | timestamptz | Last successful auth |

**New table: `terminal_biometric_sessions`**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Session ID |
| user_id | uuid (FK -> users) | User |
| session_token | text (unique) | Random token stored in sessionStorage |
| authenticated_at | timestamptz | When fingerprint was verified |
| expires_at | timestamptz | Auto-expiry (authenticated_at + 12 min) |
| is_active | boolean | Whether session is still valid |

**New RPC functions:**
- `store_webauthn_credential(...)` -- saves credential after registration
- `get_webauthn_credentials(p_user_id)` -- retrieves user's credentials for verification
- `create_terminal_biometric_session(p_user_id)` -- creates session after successful biometric auth
- `validate_terminal_biometric_session(p_user_id, p_token)` -- checks if session is still valid
- `extend_terminal_biometric_session(p_user_id, p_token)` -- resets the 12-min timer on activity
- `revoke_terminal_biometric_session(p_user_id)` -- invalidates session (logout)

### 2. Edge Function: `terminal-webauthn`

Handles the server-side WebAuthn ceremony:
- **POST /challenge** -- generates a random challenge for registration or authentication
- **POST /register** -- verifies and stores the credential after fingerprint enrollment
- **POST /verify** -- verifies the biometric assertion and creates a biometric session

### 3. Frontend Components

**`src/hooks/useWebAuthn.ts`**
- Wraps the browser's `navigator.credentials.create()` and `navigator.credentials.get()` APIs
- Handles base64url encoding/decoding of WebAuthn data
- Functions: `registerBiometric()`, `authenticateBiometric()`, `isBiometricAvailable()`

**`src/hooks/useTerminalBiometricSession.ts`**
- Manages the biometric session lifecycle
- Stores session token in `sessionStorage` (not localStorage -- clears on tab close)
- Provides `isAuthenticated`, `authenticate()`, `logout()`
- Runs an inactivity timer that auto-locks after 12 minutes of no mouse/keyboard activity
- On activity, extends the session expiry

**`src/components/terminal/BiometricRegistrationDialog.tsx`**
- Shown when user has no registered credentials
- Guides user through fingerprint enrollment
- Shows device compatibility info

**`src/components/terminal/BiometricAuthGate.tsx`**
- Inserted into `TerminalLayout` between `TerminalAccessGate` and the actual Terminal content
- If no valid biometric session exists, shows a lock screen with a "Verify Fingerprint" button
- If no credentials registered, shows registration flow first

**`src/components/terminal/TerminalInactivityMonitor.tsx`**
- Listens for mouse, keyboard, scroll, and touch events
- After 12 minutes of inactivity, revokes the biometric session and shows the lock screen
- Shows a warning toast at 10 minutes

### 4. Modified Files

**`src/components/terminal/TerminalLayout.tsx`**
- Add `BiometricAuthGate` wrapper inside `TerminalAccessGate`
- Add `TerminalInactivityMonitor` inside the authenticated terminal view

The flow becomes:
```text
TerminalAuthProvider
  -> TerminalAccessGate (checks terminal roles)
    -> BiometricAuthGate (checks fingerprint session)
      -> SidebarProvider + Terminal content
      -> TerminalInactivityMonitor
```

### 5. Admin Management

**`src/pages/terminal/TerminalUsers.tsx`** (existing)
- Add ability for admins to view registered biometric devices per user
- Add ability to revoke/reset a user's biometric credentials (e.g., if they get a new device)

### 6. Security Considerations

- WebAuthn credentials never leave the device -- only a signed challenge is sent to the server
- The biometric session token is stored in `sessionStorage` (cleared on tab/browser close)
- Server validates challenges with a nonce to prevent replay attacks
- `sign_count` is tracked to detect cloned authenticators
- All biometric events (registration, auth, timeout, revocation) are logged to `system_action_logs`

### 7. Implementation Order

1. Database migration (tables + RPCs)
2. Edge function `terminal-webauthn`
3. `useWebAuthn` hook
4. `useTerminalBiometricSession` hook
5. `BiometricRegistrationDialog` component
6. `BiometricAuthGate` component
7. `TerminalInactivityMonitor` component
8. Update `TerminalLayout` to integrate all pieces
9. Admin credential management in Terminal Users page
10. Audit logging for all biometric events

