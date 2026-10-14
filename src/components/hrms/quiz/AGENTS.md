# Quiz (HRMS) rules

- Quiz staff actions (drives, resume codes, add time, invalidate, decision override) go only through audited cbt_* SECURITY DEFINER RPCs that check cbt_can_manage, because every HR change to a test must be recorded in cbt_audit_log.
- Question bank writes (items, status, subjects, import, settings) go only through cbt_save_question / cbt_set_question_status / cbt_save_subject / cbt_import_questions / cbt_update_settings; a subject's key (= category_tag) never changes and only its display name is editable, because sections and the LMS (lms_modules.quiz_tag) reference the key.
- Tests draw only from their own pool plus Shared (pickQuestions filters pool), because hiring and staff content must never mix.
- Readiness (cbt_blueprint_readiness, used by the test editor and cbt_drive_readiness) must count exactly the way cbt-start-attempt picks — pool + Shared, section subjects, level, generated sources always ready — because a "ready" test must never serve an empty section.
- Generated data-entry records and match pairs are built only in supabase/functions/_shared/cbtGenerate.ts and keep their answer in cbt_attempt_items.generated_key, which buildState never selects, because keys must never reach candidates.
- Try runs are sandbox drives with is_try_run; every list and statistic excludes them and cbt_purge_try_runs deletes them after 3 days, because HR rehearsals must never count.
- Written grades are stored out of 20 everywhere; AI totals out of a guide's max_marks are scaled to 20 in supabase/functions/_shared/cbtAiGrade.ts, because cbt_score_section scores written items as total/20.
- AI grades are applied only by cbt_ai_record (confident, unflagged, not within the borderline margin of a cut-off or pass mark); everything else waits in "Needs a check" and graders get one hr_notifications notice per attempt (cbt_grading_notices), because an AI mistake must never flip a decision near a cut-off.
- Graders read answers only through cbt_grading_queue (no identity, no try runs), because grading stays blind without widening table reads.
