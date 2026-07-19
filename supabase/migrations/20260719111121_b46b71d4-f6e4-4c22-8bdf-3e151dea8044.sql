
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS use_xpayroll_default_structure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_structure_components jsonb NOT NULL DEFAULT '[
    {"key":"basic","label":"Basic Salary","value":50,"mode":"percentage","taxable":"yes"},
    {"key":"da","label":"DA","value":0,"mode":"percentage","taxable":"yes"},
    {"key":"hra","label":"HRA","value":25,"mode":"percentage","taxable":"partially"},
    {"key":"special","label":"Special Allowance","value":15,"mode":"percentage","taxable":"yes"},
    {"key":"lta","label":"LTA","value":10,"mode":"percentage","taxable":"yes"}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS bonus_types jsonb NOT NULL DEFAULT '[
    {"key":"joining","label":"Joining Bonus","enabled":true},
    {"key":"retention","label":"Retention Bonus","enabled":true},
    {"key":"work_anniversary","label":"Work Anniversary Bonus","enabled":true},
    {"key":"end_of_year","label":"End of year Bonus","enabled":true},
    {"key":"retirement","label":"Retirement Bonus","enabled":true},
    {"key":"profit_sharing","label":"Profit-Sharing Bonus","enabled":true},
    {"key":"diwali","label":"Diwali Bonus","enabled":false},
    {"key":"sign_on","label":"Sign-On Bonus","enabled":false}
  ]'::jsonb;

UPDATE public.hr_razorpay_settings
SET default_structure_components = '[
    {"key":"basic","label":"Basic Salary","value":50,"mode":"percentage","taxable":"yes"},
    {"key":"da","label":"DA","value":0,"mode":"percentage","taxable":"yes"},
    {"key":"hra","label":"HRA","value":25,"mode":"percentage","taxable":"partially"},
    {"key":"special","label":"Special Allowance","value":15,"mode":"percentage","taxable":"yes"},
    {"key":"lta","label":"LTA","value":10,"mode":"percentage","taxable":"yes"}
  ]'::jsonb,
    bonus_types = '[
    {"key":"joining","label":"Joining Bonus","enabled":true},
    {"key":"retention","label":"Retention Bonus","enabled":true},
    {"key":"work_anniversary","label":"Work Anniversary Bonus","enabled":true},
    {"key":"end_of_year","label":"End of year Bonus","enabled":true},
    {"key":"retirement","label":"Retirement Bonus","enabled":true},
    {"key":"profit_sharing","label":"Profit-Sharing Bonus","enabled":true},
    {"key":"diwali","label":"Diwali Bonus","enabled":false},
    {"key":"sign_on","label":"Sign-On Bonus","enabled":false}
  ]'::jsonb
WHERE is_singleton = true;
