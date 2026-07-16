
-- 1) Normalise stray whitespace in positions.title so future matches are deterministic.
UPDATE public.positions
SET title = btrim(title), updated_at = now()
WHERE title <> btrim(title);

-- 2) Create any positions referenced by RazorpayX titles but missing from the table.
--    Match is case- and whitespace-insensitive; canonical title is the trimmed form
--    of the first-seen RazorpayX title (title-case preserved by MIN() on the trimmed
--    variant so we don't downcase "KYC" to "kyc").
INSERT INTO public.positions (title, is_active, hierarchy_level)
SELECT src.canonical_title, true, 5
FROM (
  SELECT
    btrim((m.last_pull_snapshot->>'title'))                                AS canonical_title,
    lower(btrim((m.last_pull_snapshot->>'title')))                         AS norm_title
  FROM public.hr_razorpay_employee_map m
  WHERE m.last_pull_snapshot ? 'title'
    AND btrim(coalesce(m.last_pull_snapshot->>'title','')) <> ''
  GROUP BY 1, 2
) src
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p
  WHERE lower(btrim(p.title)) = src.norm_title
);

-- 3) Backfill hr_employee_work_info.job_position_id for rows where it is NULL
--    by matching the RazorpayX title against the (now complete) positions table.
UPDATE public.hr_employee_work_info wi
SET job_position_id = p.id,
    updated_at = now()
FROM public.hr_razorpay_employee_map m
JOIN public.positions p
  ON lower(btrim(p.title)) = lower(btrim(m.last_pull_snapshot->>'title'))
WHERE m.hr_employee_id = wi.employee_id
  AND wi.job_position_id IS NULL
  AND m.last_pull_snapshot ? 'title'
  AND btrim(coalesce(m.last_pull_snapshot->>'title','')) <> '';

-- 4) Also mirror the fill into hr_employee_onboarding.position_id so onboarding
--    wizards opened for these employees show the linked position (ERP-wins:
--    fill blanks only).
UPDATE public.hr_employee_onboarding ob
SET position_id = p.id,
    updated_at = now()
FROM public.hr_razorpay_employee_map m
JOIN public.positions p
  ON lower(btrim(p.title)) = lower(btrim(m.last_pull_snapshot->>'title'))
WHERE m.hr_employee_id = ob.employee_id
  AND ob.position_id IS NULL
  AND m.last_pull_snapshot ? 'title'
  AND btrim(coalesce(m.last_pull_snapshot->>'title','')) <> '';
