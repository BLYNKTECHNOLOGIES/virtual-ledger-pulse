-- GAP #1: Add CHECK constraint on hr_leave_requests.status
ALTER TABLE hr_leave_requests ADD CONSTRAINT chk_leave_request_status 
CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled'));

-- GAP #2: Add CHECK constraint on hr_fnf_settlements.status
ALTER TABLE hr_fnf_settlements ADD CONSTRAINT chk_fnf_status 
CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid'));