
SET session_replication_role = 'replica';

UPDATE clients SET risk_appetite = 'PREMIUM' WHERE risk_appetite = 'LOW';
UPDATE clients SET risk_appetite = 'STANDARD' WHERE risk_appetite = 'MEDIUM';
UPDATE clients SET risk_appetite = 'HIGH_RISK' WHERE risk_appetite = 'HIGH';
UPDATE clients SET risk_appetite = 'STANDARD' WHERE risk_appetite = 'NO_RISK';

UPDATE clients SET default_risk_level = 'PREMIUM' WHERE default_risk_level = 'LOW';
UPDATE clients SET default_risk_level = 'STANDARD' WHERE default_risk_level = 'MEDIUM';
UPDATE clients SET default_risk_level = 'HIGH_RISK' WHERE default_risk_level = 'HIGH';

UPDATE client_onboarding_approvals SET risk_assessment = 'PREMIUM' WHERE risk_assessment = 'LOW';
UPDATE client_onboarding_approvals SET risk_assessment = 'STANDARD' WHERE risk_assessment = 'MEDIUM';
UPDATE client_onboarding_approvals SET risk_assessment = 'HIGH_RISK' WHERE risk_assessment = 'HIGH';

SET session_replication_role = 'origin';
