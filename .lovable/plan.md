
# Implementation Plan: Tab Grouping with PIN Protection & Enhanced Drag-Drop

## Overview
This plan implements two main features:
1. **Tab Grouping with PIN Protection**: Group specific tabs under collapsible headers that require PIN authentication (07172525) to access
2. **Enhanced Drag-Drop**: Make all tabs (including grouped ones) draggable with position persistence per user

## Current State Analysis

### Existing Implementation
- Sidebar uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop
- Tab ordering is stored in `user_sidebar_preferences` table (JSON `sidebar_order` column)
- `useSidebarPreferences` hook handles saving/loading tab order per user ID
- `DraggableSidebarItem` component renders individual draggable items

### Tab Grouping Requirements
| Group Name | Child Tabs | PIN Code |
|------------|------------|----------|
| HR Management | HRMS, Payroll, EMS | 07172525 |
| Finance & Analytics | Accounting, P&L, Financials, Statistics | 07172525 |

---

## Implementation Details

### Phase 1: Create PIN Dialog Component

**New File: `src/components/sidebar/PinProtectionDialog.tsx`**

A reusable dialog that:
- Shows a PIN input with 8-digit numeric field
- Validates against the provided PIN code
- Returns success/failure callback
- Uses masked input (dots) for security
- Tracks unlock state per session

### Phase 2: Create Collapsible Sidebar Group Component

**New File: `src/components/sidebar/CollapsibleSidebarGroup.tsx`**

A collapsible group component that:
- Shows group header with expand/collapse chevron
- Requires PIN entry on first expand attempt (per session)
- Stores unlock state in session storage (clears on browser close)
- Contains child tabs rendered inside
- Supports drag-drop for child items
- Is itself draggable as a unit

### Phase 3: Create Context for PIN Unlock State

**New File: `src/contexts/PinUnlockContext.tsx`**

Context to manage which groups are unlocked in the current session:
```typescript
interface PinUnlockContextType {
  unlockedGroups: Set<string>;
  unlockGroup: (groupId: string) => void;
  isGroupUnlocked: (groupId: string) => boolean;
}
```

### Phase 4: Update AppSidebar Configuration

**Modified File: `src/components/AppSidebar.tsx`**

#### New Configuration Structure

```typescript
interface SidebarGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  pinProtected: boolean;
  pinCode?: string;
  children: SidebarItem[];
}

const sidebarConfig = {
  // Regular standalone items
  standaloneItems: [
    { id: "dashboard", title: "Dashboard", ... },
    { id: "stock", title: "Stock Management", ... },
    { id: "sales", title: "Sales", ... },
    { id: "purchase", title: "Purchase", ... },
    { id: "bams", title: "BAMS", ... },
    { id: "clients", title: "Clients", ... },
    { id: "leads", title: "Leads", ... },
    { id: "user-management", title: "User Management", ... },
    { id: "compliance", title: "Compliance", ... },
    { id: "risk-management", title: "Risk Management", ... },
    { id: "video-kyc", title: "Video KYC", ... },
    { id: "kyc-approvals", title: "KYC Approvals", ... },
  ],
  
  // Grouped items
  groups: [
    {
      id: "hr-management",
      title: "HR Management",
      icon: Users,
      color: "text-pink-600",
      bgColor: "bg-pink-100",
      pinProtected: true,
      pinCode: "07172525",
      children: [
        { id: "hrms", title: "HRMS", ... },
        { id: "payroll", title: "Payroll", ... },
        { id: "ems", title: "EMS", ... },
      ]
    },
    {
      id: "finance-analytics",
      title: "Finance & Analytics",
      icon: BarChart3,
      color: "text-green-600",
      bgColor: "bg-green-100",
      pinProtected: true,
      pinCode: "07172525",
      children: [
        { id: "accounting", title: "Accounting", ... },
        { id: "profit-loss", title: "P&L", ... },
        { id: "financials", title: "Financials", ... },
        { id: "statistics", title: "Statistics", ... },
      ]
    }
  ]
};
```

### Phase 5: Update Sidebar Preferences Hook

**Modified File: `src/hooks/useSidebarPreferences.tsx`**

Add support for storing:
1. **Item order** (array of item IDs including group IDs)
2. **Group expanded states** (optional enhancement)

The existing `sidebar_order` JSON field can store:
```json
{
  "order": ["dashboard", "stock", "hr-management", "sales", "finance-analytics", ...],
  "groupOrder": {
    "hr-management": ["hrms", "payroll", "ems"],
    "finance-analytics": ["accounting", "profit-loss", "financials", "statistics"]
  }
}
```

### Phase 6: Update DraggableSidebarItem

**Modified File: `src/components/DraggableSidebarItem.tsx`**

- Handle both regular items and group headers
- Pass through to CollapsibleSidebarGroup for groups
- Maintain existing drag behavior for items

### Phase 7: Update App.tsx for Provider

**Modified File: `src/App.tsx`**

Wrap application with `PinUnlockProvider`:
```tsx
<PinUnlockProvider>
  <SidebarEditProvider>
    {/* existing app content */}
  </SidebarEditProvider>
</PinUnlockProvider>
```

---

## UI/UX Design

### Collapsed Group View
```text
┌─────────────────────────────────┐
│ ⋮⋮ [👥] HR Management    🔒 ▶  │
└─────────────────────────────────┘
```

### Expanded Group View (After PIN Entry)
```text
┌─────────────────────────────────┐
│ ⋮⋮ [👥] HR Management    🔓 ▼  │
├─────────────────────────────────┤
│    ⋮⋮ [👤] HRMS               │
│    ⋮⋮ [💰] Payroll            │
│    ⋮⋮ [👤] EMS                │
└─────────────────────────────────┘
```

### PIN Dialog
```text
┌──────────────────────────────────┐
│     🔒 Enter PIN to Access       │
│                                  │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┐      │
│  │ • │ • │ • │ • │ • │ • │ • │ • │      │
│  └──┴──┴──┴──┴──┴──┴──┴──┘      │
│                                  │
│      [Cancel]     [Unlock]       │
└──────────────────────────────────┘
```

---

## Technical Considerations

### Security Notes
- PIN is stored in component (not sent to server for validation)
- Unlock state stored in sessionStorage (clears on browser close)
- This is for **testing convenience** only, not production security
- For production, implement server-side PIN validation

### Drag-Drop Behavior
- Groups can be dragged as a unit
- Items within groups can be reordered within the group
- Items cannot be dragged out of groups (by design for this feature)
- Both group order and internal item order are persisted

### Session State
- Unlock state persists for browser session only
- Closing browser requires re-entering PIN
- Each group tracks its own unlock state independently

---

## Files to Create
| File | Purpose |
|------|---------|
| `src/components/sidebar/PinProtectionDialog.tsx` | PIN entry modal dialog |
| `src/components/sidebar/CollapsibleSidebarGroup.tsx` | Collapsible group with PIN protection |
| `src/contexts/PinUnlockContext.tsx` | Session-based unlock state management |

## Files to Modify
| File | Changes |
|------|---------|
| `src/components/AppSidebar.tsx` | New grouping configuration, integrate groups |
| `src/hooks/useSidebarPreferences.tsx` | Extended order storage format |
| `src/components/DraggableSidebarItem.tsx` | Support for group item type |
| `src/App.tsx` | Add PinUnlockProvider wrapper |

---

## Summary

| Feature | Implementation |
|---------|----------------|
| Tab Grouping | Group headers with collapsible children |
| PIN Protection | 8-digit PIN dialog with session-based unlock |
| Drag-Drop Groups | Groups draggable as units using dnd-kit |
| Drag-Drop Items | Items within groups reorderable |
| Position Persistence | Extended preferences hook with group support |
| Session-Only Unlock | SessionStorage for unlock state |
