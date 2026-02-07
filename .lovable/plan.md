

# Fix Phase 1: Make HRMS an Exact Replica of Horilla

## Problem

The current implementation looks nothing like the actual Horilla application. Based on the screenshots from hr.demo.horilla.com, here are the critical differences:

---

## 1. Sidebar -- Completely Wrong

**Current**: Dark charcoal background (#1e1e2d), coral/red accent (#E8604C), text + icon, collapsible with expand button.

**Horilla actual**: 
- White/light background with a subtle left green border on active item
- Icons only (always collapsed to ~60px wide), NO text labels visible
- Green/teal active indicator (#22c55e) -- NOT coral/red
- Horilla logo at top (small "Horil" text with leaf icon)
- Green floating action button at bottom-left (arrow icon)
- Vertical icon-only navigation, no text, no collapse toggle

**Fix**: Completely rebuild sidebar as icon-only, light theme, green active indicator matching the screenshots.

---

## 2. Header/Top Bar -- Completely Wrong

**Current**: White header with back arrow, title text, search bar, bell icon.

**Horilla actual**:
- Breadcrumb navigation: "Horilla > Module > Page" (green link text)
- Running clock/stopwatch display (showing "10:48:55" style)
- Right side icons: Dark mode toggle (moon), Settings gear, Bell with count badge (3), Globe icon, Grid/table icon
- User avatar with name "Admin Demo" and "Online" status below it
- NO page title in the header -- the breadcrumb serves that purpose

**Fix**: Rebuild header with breadcrumb navigation, clock display, and the exact icon set from Horilla.

---

## 3. Dashboard -- Significantly Different

**Current**: 4 summary cards (Total Employees, Departments, New Hires, Pending Leaves), Gender Distribution pie, Employee Count Trend line, Upcoming Birthdays, Quick Actions.

**Horilla actual** (from screenshots):
- Top row: 4 cards -- "Today's New Joiners (0)", "Leave on today (0)", "Joining this week (0)", "Total Strength (0)" with colored icons (green person, pink person, orange envelope, pink person)
- "Employees Chart" -- Large donut chart (green Active / pink Inactive) with total count centered ("44 Total")
- "Gender Chart" -- Donut chart with male/female stick figure icons in center (blue/pink/purple segments)
- "Objective Status" -- Donut chart (green "Not Started" / pink "Behind")
- "Key Result Status" -- Donut chart
- "Feedback Status" -- Large pie chart (green "Not Started")
- "Candidates Started Onboarding" -- Bar chart by recruitment
- "Employee Work Information" -- Table with employee name + progress bar + percentage
- "Recruitment Analytics" -- Bar chart
- Right panel: "On Leave" section (shows who is on leave today, or "No Records found" with magnifying glass icon)
- Notification dropdown: Shows individual notifications with red dot, timestamp, "by Admin Demo" text, mute/checkAll/close icons

**Fix**: Rebuild dashboard to match Horilla's exact layout with the specific widget names, chart types, donut styles with centered content, and the "On Leave" right panel.

---

## 4. Employee Profile -- Major Differences

**Current**: Simple header with initials avatar, badge ID, status badge. 4 tabs (Personal Info, Work Info, Bank Details, Notes).

**Horilla actual** (from screenshot):
- Large profile section: Avatar image, Name with badge "Admin Demo (HOR1)", email with envelope icon, phone with phone icon, gender with male icon
- Settings gear + left/right navigation arrows at top-right
- THREE-DOT menu (vertical dots) at far right
- **17 tabs** in two rows:
  - Row 1: About (green active), Work Type & Shift, Groups & Permissions, Note, Documents, Mail Log, History, Scheduled Interviews, Leave, Performance, Key Results, Asset, Attendance, Penalty Account, Payroll
  - Row 2: Allowance & Deduction, Bonus Points, Resignation, Projects
- About tab shows: Personal Information on left (Date of birth, Gender, Address, Country, State, City, Qualification, Experience, Emergency Contact, Emergency Contact Name) + Work Information table on right with columns: Badge Id, Job Position, Department, Shift, Work Type, Employee Type, Job Role, Reporting Manager

**Fix**: Completely rebuild employee profile with the exact Horilla layout including all 17+ tabs, the proper profile header, and the split About view.

---

## 5. Color Theme -- Wrong

**Current**: Coral/red (#E8604C) everywhere.

**Horilla actual**: 
- Primary accent is **green/teal** (#22c55e or similar) for sidebar active states, breadcrumb links, active tabs, "Create" buttons
- Cards have a very subtle green/mint left border
- Status badges: green checkmarks, red X marks, yellow for "Joining Not-Set"
- "Create" button: Green background with plus icon
- "Filter" button: Gray outline with filter icon
- Active filter pills: Green "Filters:" label with removable tags

**Fix**: Change the primary accent color from coral to green to match Horilla's actual theme.

---

## Implementation Plan

### Step 1: Update Theme Colors
- Change all `#E8604C` references to green (`#22c55e` / `#009C4A` which is Horilla's brand green)
- Update shared components (StatusBadge, ViewToggle) to use green

### Step 2: Rebuild Sidebar
- Icon-only sidebar (~60px wide), white/light background
- Green left-border indicator on active item
- Horilla logo at top
- Green floating arrow button at bottom
- No collapse toggle -- always icon-only

### Step 3: Rebuild Header
- Breadcrumb: "Horilla > [Module] > [Page]" with green links
- Clock/stopwatch display
- Icon row: dark mode toggle, settings, bell with badge, globe, grid
- User avatar with name and "Online" status

### Step 4: Rebuild Dashboard
- Top 4 cards: "Today's New Joiners", "Leave on today", "Joining this week", "Total Strength" with specific colored icons
- Employees Chart: Donut with Active/Inactive + centered total
- Gender Chart: Donut with male/female icons in center
- Objective Status: Donut chart
- Key Result Status: Donut chart
- Feedback Status: Pie chart
- Candidates Started Onboarding: Bar chart
- Employee Work Information: Table with progress bars
- Recruitment Analytics: Bar chart
- Right sidebar: "On Leave" panel
- Notification dropdown matching Horilla's exact design

### Step 5: Rebuild Employee Profile
- Profile header: Avatar, name (Badge ID), email/phone/gender with icons
- Settings gear, nav arrows, three-dot menu
- 17+ tabs in two rows matching exact Horilla tab names
- About tab: Personal Info on left, Work Information table on right
- All other tabs as placeholders initially

### Step 6: Rebuild Employee Directory
- Match Horilla's candidate card view: Avatar (circle), Name, email, position label, three-dot menu
- 4-column grid layout
- Filter bar: Search, List/Grid toggle, Filter button, Actions dropdown, Create button (green)
- Active filter pills row with "Filters:" green label

### Step 7: Update Notification Dropdown
- Match Horilla's notification panel: mute, check-all, close buttons at top
- Red dot indicators
- Timestamp + "by [user]" format
- "View all Notification" link at bottom

### Technical Details

**Files to modify:**
- `src/components/horilla/HorillaSidebar.tsx` -- Complete rewrite (icon-only, light theme, green accent)
- `src/components/horilla/HorillaHeader.tsx` -- Complete rewrite (breadcrumb, clock, icon row, user section)
- `src/components/horilla/HorillaDashboard.tsx` -- Complete rewrite (all Horilla-specific widgets)
- `src/components/horilla/HorillaNotifications.tsx` -- Restyle to match
- `src/components/horilla/employee/EmployeeDirectory.tsx` -- Restyle cards and filter bar
- `src/components/horilla/employee/EmployeeProfile.tsx` -- Complete rewrite (17 tabs, split layout)
- `src/components/horilla/shared/StatusBadge.tsx` -- Update colors to green theme
- `src/components/horilla/shared/ViewToggle.tsx` -- Update colors
- `src/pages/HorillaHRMS.tsx` -- Update layout for new sidebar style, pass breadcrumb data

**New sub-module support in sidebar:**
- Recruitment module in Horilla has a secondary vertical sub-menu: Dashboard, Recruitment Pipeline, Recruitment Survey, Candidates, Interview, Recruitment, Open Jobs, Stages, Skill Zone
- This needs a hover/flyout sub-menu from the sidebar icons

**No database changes needed** -- this is purely a visual/UI overhaul of Phase 1 components.

