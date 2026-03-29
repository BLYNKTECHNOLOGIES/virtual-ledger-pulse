-- Remove bonus points table and all related policies
DROP POLICY IF EXISTS "authenticated_all_hr_bonus_points" ON public.hr_bonus_points;
DROP TABLE IF EXISTS public.hr_bonus_points CASCADE;