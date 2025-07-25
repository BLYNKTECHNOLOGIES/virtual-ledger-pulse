-- Remove all investigation-related data
-- Delete in proper order to respect foreign key relationships

-- Delete investigation updates first (references investigation_id)
DELETE FROM investigation_updates;

-- Delete investigation steps (references investigation_id) 
DELETE FROM investigation_steps;

-- Delete all account investigations (both active and past cases)
DELETE FROM account_investigations;

-- Delete lien updates (references lien_case_id)
DELETE FROM lien_updates;

-- Delete all lien cases (past cases)
DELETE FROM lien_cases;