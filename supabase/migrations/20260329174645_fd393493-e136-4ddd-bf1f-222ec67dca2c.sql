-- Clear all old WebAuthn credentials - they are bound to the old domain (blynkex.lovable.app)
-- and cannot work on erp.blynkex.com. All users must re-register.
DELETE FROM terminal_webauthn_credentials;

-- Also clear any active biometric sessions since credentials are gone
DELETE FROM terminal_biometric_sessions;