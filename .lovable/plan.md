# Add Quiz to HRMS Management navigation

## What will change
- Add a distinct **Quiz** tab under the HRMS **Management** heading.
- Link it to `/hrms/quiz` and keep it visible only to staff with Quiz access.
- Add the Quiz route and a focused Quiz landing page so the tab opens a working destination instead of a blank or missing page.
- Keep the current sidebar collapse, mobile drawer, active-state highlighting, and route preloading behavior intact.

## Technical details
- Use the existing Quiz permission keys already added to the system.
- Follow the current HRMS route and sidebar patterns rather than introducing a separate navigation shell.
- Verify the build and the sidebar-to-page navigation after implementation.
