-- M3: Attendance policy engine
CREATE TABLE IF NOT EXISTS hr_attendance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean DEFAULT false,
  -- Late marking
  late_threshold_minutes int DEFAULT 15, -- minutes after shift start to mark "late"
  half_day_threshold_minutes int DEFAULT 240, -- if worked < this many minutes = half day
  -- Absent marking
  absent_if_no_punch boolean DEFAULT true,
  -- Grace period
  grace_period_minutes int DEFAULT 0,
  -- LOP rules
  late_count_for_lop int DEFAULT 3, -- X lates in a month = 1 LOP
  half_day_count_for_lop int DEFAULT 2, -- X half-days = 1 LOP
  -- Early leave
  early_leave_threshold_minutes int DEFAULT 30, -- leaving this many minutes before shift end
  -- Overtime
  min_overtime_minutes int DEFAULT 30, -- minimum OT to be counted
  -- Active
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hr_attendance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hr_attendance_policies" ON hr_attendance_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert a default policy
INSERT INTO hr_attendance_policies (name, is_default, late_threshold_minutes, half_day_threshold_minutes, grace_period_minutes, late_count_for_lop, half_day_count_for_lop, early_leave_threshold_minutes, min_overtime_minutes)
VALUES ('Default Policy', true, 15, 240, 0, 3, 2, 30, 30);