ALTER TABLE hr_salary_structure_template_items 
ALTER COLUMN calculation_type TYPE text;

-- Update check constraint if any to allow 'formula'
-- No constraint exists currently, so just ensure text type