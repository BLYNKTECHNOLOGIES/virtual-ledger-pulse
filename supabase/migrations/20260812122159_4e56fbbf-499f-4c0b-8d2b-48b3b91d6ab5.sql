CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_fnf_settlement_per_employee
  ON public.hr_fnf_settlements (employee_id)
  WHERE status <> 'cancelled';