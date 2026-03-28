
-- Clean up duplicate punches: keep only the first punch per badge per 2-minute window
-- Use a CTE to identify duplicates
WITH ranked AS (
  SELECT id, badge_id, punch_time,
    ROW_NUMBER() OVER (
      PARTITION BY badge_id, 
        date_trunc('minute', punch_time) - (EXTRACT(MINUTE FROM punch_time)::int % 2) * interval '1 minute'
      ORDER BY punch_time ASC
    ) as rn
  FROM hr_attendance_punches
)
DELETE FROM hr_attendance_punches
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Recompute hr_attendance_daily punch_count from cleaned data
UPDATE hr_attendance_daily had
SET punch_count = sub.cnt,
    updated_at = now()
FROM (
  SELECT employee_id, punch_time::date as att_date, COUNT(*) as cnt
  FROM hr_attendance_punches
  GROUP BY employee_id, punch_time::date
) sub
WHERE had.employee_id = sub.employee_id
  AND had.attendance_date = sub.att_date
  AND had.punch_count != sub.cnt;
