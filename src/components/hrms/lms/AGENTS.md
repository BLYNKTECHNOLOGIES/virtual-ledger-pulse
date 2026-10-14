# LMS (HRMS → LMS) rules

- LMS screens read people only through the lms_employee_directory RPC (names and posts), never hr_employees directly, because a trainer can hold the LMS keys without any HRMS access.
- LMS writes touch only the lms_* tables and the private lms-content bucket; moving plan days (extend after a failed test, push back for an absence) goes only through lms_shift_plan, because a half-moved schedule cannot be repaired by hand.
- Tests run in the Quiz module; the LMS records the score, the pass/fail against the LMS pass mark and the quiz reference only, and lms_modules.quiz_tag holds the Quiz subject key.
- A certification is one row per employee and KRA; re-certifying or renewing keeps the replaced one in `previous`, so undo restores it instead of losing history.
- Module links must be http(s) (DB check) and other sites play only in sandboxed frames; chunked uploads are joined into blobs of media types only, because LMS content is entered by trainers and shown to admins.
- The HRMS menu checks default pages against hrms_view/hrms_manage themselves (not their expansion), so an LMS-only trainer sees just the LMS.
