-- Deactivate 13 expired biometric sessions still marked is_active = true
UPDATE terminal_biometric_sessions
SET is_active = false
WHERE is_active = true AND expires_at < now();