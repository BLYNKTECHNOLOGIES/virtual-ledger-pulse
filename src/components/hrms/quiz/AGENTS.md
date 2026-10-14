# Quiz (HRMS) rules

- Quiz staff actions (drives, resume codes, add time, invalidate, decision override) go only through audited cbt_* SECURITY DEFINER RPCs that check cbt_can_manage, because every HR change to a test must be recorded in cbt_audit_log.
- Question bank writes (items, status, subjects, import, settings) go only through cbt_save_question / cbt_set_question_status / cbt_save_subject / cbt_import_questions / cbt_update_settings; a subject's key (= category_tag) never changes and only its display name is editable, because sections and the LMS (lms_modules.quiz_tag) reference the key.
- Tests draw only from their own pool plus Shared (pickQuestions filters pool), because hiring and staff content must never mix.
