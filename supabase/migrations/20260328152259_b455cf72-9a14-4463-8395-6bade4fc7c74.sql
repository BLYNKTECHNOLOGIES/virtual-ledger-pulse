
-- O11: Add computed duration_hours column to hr_shifts for correct overnight shift handling
ALTER TABLE public.hr_shifts
ADD COLUMN duration_hours NUMERIC GENERATED ALWAYS AS (
  CASE
    WHEN end_time > start_time THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
    ELSE EXTRACT(EPOCH FROM (end_time - start_time + INTERVAL '24 hours')) / 3600
  END
) STORED;
