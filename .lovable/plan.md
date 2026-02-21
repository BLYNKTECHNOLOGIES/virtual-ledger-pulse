

## Organization Structure Setup -- Updated Plan

### Corrections Applied in This Update

1. **Removed Finance Manager and Payment Processor from Marketing/Relationship department** -- They do not belong under Relationship Manager. The Marketing/Relationship department only has the Head and Relationship Managers.
2. **Renamed PPS to "Payment Processor"** everywhere it appears.

### Corrected Hierarchy

```text
Managing Director (can be multiple)
└── Deputy Managing Director (can be multiple)
    └── General Manager (can be multiple, department-scoped)
        ├── CCO (Chief Compliance Officer)
        │   ├── Head Internal Compliance
        │   │   └── Internal Compliance Officer
        │   │       └── KYC Executive
        │   └── Head External Compliance
        │       ├── Field Compliance Officer
        │       └── Compliance Filing Executive
        │
        ├── Chief Executive Officer (CEO)
        │   └── Operations Manager
        │       └── Assistant Manager (covers all shifts)
        │           └── Team Lead
        │               ├── Sales Executive
        │               └── Purchase Executive
        │
        ├── Relationship / Marketing Head
        │   └── Relationship Manager
        │
        └── CFO (Chief Financial Officer)
            ├── Finance Head - Operations
            │   └── Finance Manager
            │       └── Payment Processor
            └── Finance Head - Taxation And Banking
                ├── Accountant
                │   └── Operator / Data Entry
                └── Banking Officer
```

### Departments (unchanged from previous plan)

| Department | Code | Level | Status |
|---|---|---|---|
| Management | MGMT | 1 | NEW |
| Operations | OPS | 2 | UPDATE |
| Compliance | COMP | 2 | UPDATE |
| Marketing / Relationship | MKT | 2 | NEW |
| Finance | FIN | 2 | UPDATE |
| Accounts / Taxation and Banking | ACCT | 2 | NEW |
| Administrative | ADMIN | 3 | EXISTS |
| Support Staff | SUPPORT | 4 | EXISTS |

### Positions Per Department

**Management (MGMT):**
- Managing Director (L10) -- top
- Deputy Managing Director (L9) -- reports to MD
- General Manager (L8) -- reports to Deputy MD
- Chief Executive Officer (L9) -- reports to GM

**Compliance (COMP):**
- CCO (L8) -- reports to GM
- Head Internal Compliance (L7) -- reports to CCO
- Head External Compliance (L7) -- reports to CCO
- Internal Compliance Officer (L6) -- reports to Head Internal
- Field Compliance Officer (L6) -- reports to Head External
- KYC Executive (L5) -- reports to ICO
- Compliance Filing Executive (L5) -- reports to Head External

**Operations (OPS):**
- Operations Manager (L8) -- reports to CEO
- Assistant Manager (L7) -- reports to Ops Manager
- Team Lead (L6) -- reports to Assistant Manager
- Sales Executive (L5) -- reports to Team Lead
- Purchase Executive (L5) -- reports to Team Lead

**Marketing / Relationship (MKT):**
- Relationship / Marketing Head (L8) -- reports to GM
- Relationship Manager (L6) -- reports to R/M Head

**Finance (FIN):**
- CFO (L9) -- reports to GM
- Finance Head - Operations (L8) -- reports to CFO
- Finance Manager (L7) -- reports to Finance Head Ops
- Payment Processor (L5) -- reports to Finance Manager

**Accounts / Taxation and Banking (ACCT):**
- Finance Head - Taxation And Banking (L8) -- reports to CFO
- Accountant (L6) -- reports to Finance Head T&B
- Banking Officer (L6) -- reports to Finance Head T&B
- Operator / Data Entry (L5) -- reports to Accountant

### Database Changes

**Migration 1: Add reporting chain to positions table**
```sql
ALTER TABLE positions ADD COLUMN reports_to_position_id UUID REFERENCES positions(id);
```

**Data operations:**
- Insert Management, Marketing/Relationship, and Accounts departments
- Update hierarchy levels on existing departments
- Delete the 2 existing misplaced positions (MD and Deputy MD under Administrative)
- Insert all positions listed above with correct department and reports_to_position_id mappings

### Code Changes

**`src/components/hrms/OrgChartView.tsx`**
- Rebuild Department and Position view showing positions grouped by department with visual reporting chain using `reports_to_position_id`
- Employee Hierarchy view uses `reporting_manager_id` from employees table
- Department badge on nodes so same-title positions across departments are distinguishable

**`src/pages/horilla/OrganizationPage.tsx`**
- Fix Add Department button flow

**`src/components/hrms/DepartmentFormDialog.tsx`**
- Verify and fix save logic

No employee table schema changes needed -- `reporting_manager_id`, `department_id`, and `position_id` already exist.

