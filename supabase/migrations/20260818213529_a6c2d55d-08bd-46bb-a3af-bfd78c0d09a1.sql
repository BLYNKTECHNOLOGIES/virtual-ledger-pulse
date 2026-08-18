DELETE FROM public.hr_resignation_checklist_template
WHERE item_title IN ('Pending expense claims settled','Tool licenses deactivated','Project handover documentation','Knowledge transfer completed');

UPDATE public.hr_resignation_checklist_template
SET item_title = 'Company Assets returned'
WHERE item_title = 'Company phone returned';

DELETE FROM public.hr_resignation_checklist
WHERE item_title IN ('Pending expense claims settled','Tool licenses deactivated','Project handover documentation','Knowledge transfer completed')
  AND COALESCE(is_completed, false) = false;

UPDATE public.hr_resignation_checklist
SET item_title = 'Company Assets returned'
WHERE item_title = 'Company phone returned';