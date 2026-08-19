-- 1) Template: keep the experience row, rename it, drop the relieving row
UPDATE hr_resignation_checklist_template
SET item_title = 'Relieving cum experience letter issued', sequence = 13
WHERE item_title = 'Experience letter issued';

DELETE FROM hr_resignation_checklist_template
WHERE item_title = 'Relieving letter issued';

-- 2) Existing employee checklists: fold relieving completion into experience row
UPDATE hr_resignation_checklist c
SET is_completed = true,
    completed_at = COALESCE(c.completed_at, r.completed_at)
FROM hr_resignation_checklist r
WHERE r.employee_id = c.employee_id
  AND r.item_title = 'Relieving letter issued'
  AND r.is_completed
  AND c.item_title = 'Experience letter issued';

DELETE FROM hr_resignation_checklist WHERE item_title = 'Relieving letter issued';

UPDATE hr_resignation_checklist
SET item_title = 'Relieving cum experience letter issued'
WHERE item_title = 'Experience letter issued';