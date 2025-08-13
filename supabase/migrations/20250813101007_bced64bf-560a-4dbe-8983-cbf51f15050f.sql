-- Find and drop all validation triggers
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT trigger_name, event_object_table FROM information_schema.triggers 
             WHERE action_statement ILIKE '%validate_negative_values%' 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON ' || r.event_object_table;
    END LOOP;
END $$;

-- Drop the validation function
DROP FUNCTION IF EXISTS public.validate_negative_values() CASCADE;

-- Verify no more validation triggers
SELECT trigger_name FROM information_schema.triggers WHERE action_statement ILIKE '%validate%';