# Sidebar: hide scrollbar in collapsed (icon-rail) mode

## Goal
Remove the visible scrollbar from the ERP sidebar when it is collapsed to the icon rail, while keeping scrolling functional so the previous icon-rail scrolling fix remains intact.

## Current state
- `src/components/AppSidebar.tsx` renders `SidebarContent` with explicit overflow:  
  `overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:overflow-x-hidden`.
- This keeps scroll capability in the collapsed state but also renders the native scrollbar, which the user wants gone.

## Change
1. Add a tiny utility CSS class in `src/index.css` that hides the scrollbar visually while preserving scroll:
   ```css
   .scrollbar-hidden {
     -ms-overflow-style: none;
     scrollbar-width: none;
   }
   .scrollbar-hidden::-webkit-scrollbar {
     display: none;
   }
   ```
2. In `src/components/AppSidebar.tsx`, conditionally apply that class to `SidebarContent` when `isCollapsed` is true.

## Verification
- Collapse the sidebar and confirm no scrollbar track is visible.
- Verify that with many menu items, the icon rail still scrolls via mousewheel/touch.
- Expand the sidebar and confirm the normal scrollbar is still visible.
