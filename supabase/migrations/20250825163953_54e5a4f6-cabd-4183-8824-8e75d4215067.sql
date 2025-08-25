-- Add missing columns to employees table for comprehensive employee management
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS middle_name text,
ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS blood_group text,
ADD COLUMN IF NOT EXISTS marital_status text CHECK (marital_status IN ('SINGLE', 'MARRIED', 'OTHER')),
ADD COLUMN IF NOT EXISTS alternate_phone text,
ADD COLUMN IF NOT EXISTS current_address text,
ADD COLUMN IF NOT EXISTS permanent_address text,
ADD COLUMN IF NOT EXISTS emergency_contact_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_relation text,
ADD COLUMN IF NOT EXISTS emergency_contact_number text,
ADD COLUMN IF NOT EXISTS reporting_manager_id uuid REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS work_location text CHECK (work_location IN ('OFFICE', 'REMOTE', 'HYBRID')),
ADD COLUMN IF NOT EXISTS employee_type text CHECK (employee_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT')),
ADD COLUMN IF NOT EXISTS probation_period boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS probation_duration_months integer,
ADD COLUMN IF NOT EXISTS pan_number text,
ADD COLUMN IF NOT EXISTS aadhaar_number text,
ADD COLUMN IF NOT EXISTS bank_account_holder_name text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS account_number text,
ADD COLUMN IF NOT EXISTS ifsc_code text,
ADD COLUMN IF NOT EXISTS upi_id text,
ADD COLUMN IF NOT EXISTS ctc numeric,
ADD COLUMN IF NOT EXISTS basic_salary numeric,
ADD COLUMN IF NOT EXISTS allowances numeric,
ADD COLUMN IF NOT EXISTS incentives numeric,
ADD COLUMN IF NOT EXISTS deductions numeric,
ADD COLUMN IF NOT EXISTS aadhaar_card_url text,
ADD COLUMN IF NOT EXISTS pan_card_url text,
ADD COLUMN IF NOT EXISTS photo_url text,
ADD COLUMN IF NOT EXISTS resume_url text,
ADD COLUMN IF NOT EXISTS offer_letter_url text,
ADD COLUMN IF NOT EXISTS other_certificates_urls text[],
ADD COLUMN IF NOT EXISTS nda_acknowledged boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS nda_acknowledged_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS handbook_acknowledged boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS handbook_acknowledged_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Update existing salary column to be ctc if it exists
UPDATE employees SET ctc = salary WHERE ctc IS NULL AND salary IS NOT NULL;

-- Create function to generate employee ID
CREATE OR REPLACE FUNCTION generate_employee_id(dept text, emp_type text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    dept_code text;
    type_code text;
    counter integer;
    new_id text;
BEGIN
    -- Department codes
    dept_code := CASE 
        WHEN dept = 'Operations' THEN 'OPS'
        WHEN dept = 'Finance' THEN 'FIN'
        WHEN dept = 'Compliance' THEN 'COM'
        WHEN dept = 'Technology' THEN 'TECH'
        WHEN dept = 'HR' THEN 'HR'
        WHEN dept = 'Sales' THEN 'SALES'
        ELSE 'GEN'
    END;
    
    -- Employee type codes
    type_code := CASE 
        WHEN emp_type = 'FULL_TIME' THEN 'FT'
        WHEN emp_type = 'PART_TIME' THEN 'PT'
        WHEN emp_type = 'CONTRACT' THEN 'CT'
        WHEN emp_type = 'INTERN' THEN 'IN'
        WHEN emp_type = 'CONSULTANT' THEN 'CN'
        ELSE 'EMP'
    END;
    
    -- Get next counter
    SELECT COALESCE(MAX(CAST(SUBSTRING(employee_id FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO counter
    FROM employees 
    WHERE employee_id LIKE dept_code || type_code || '%';
    
    -- Format: DEPTTYPE001
    new_id := dept_code || type_code || LPAD(counter::text, 3, '0');
    
    RETURN new_id;
END;
$$;