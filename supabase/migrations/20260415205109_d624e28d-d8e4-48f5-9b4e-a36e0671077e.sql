-- Normalize legacy risk_appetite values to the canonical 5-tier taxonomy
UPDATE public.clients SET risk_appetite = 'HIGH_RISK' WHERE risk_appetite = 'HIGH';
UPDATE public.clients SET risk_appetite = 'CAUTIOUS' WHERE risk_appetite = 'MEDIUM';
UPDATE public.clients SET risk_appetite = 'STANDARD' WHERE risk_appetite = 'LOW';