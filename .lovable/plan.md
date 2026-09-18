# Fix Quiz management and add role/blueprint editing

## What will change
- Trace and correct the server-side Quiz management check causing repeated role/question failures, without weakening access control.
- Route role creation and editing through protected database actions so failures return a clear reason instead of a generic row-security error.
- Add an Edit action to every role, covering cut-offs, active status, and ordered blueprint sections.
- Keep role names and departments controlled by the linked company position.

## Verification
- Verify the affected role has Quiz management access in the live database.
- Test create and update behavior at the database boundary, including denial without permission.
- Verify the Quiz page builds and the edit dialog works on desktop and mobile widths.
