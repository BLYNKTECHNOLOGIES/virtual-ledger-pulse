

## Migrate Risk Levels from 3-Category to 5-Category System

### New Risk Level Categories

| Old Value | New Value | Display Label | Color Scheme |
|-----------|-----------|---------------|--------------|
| LOW | PREMIUM | Premium | `bg-emerald-100 text-emerald-800` |
| *(new)* | ESTABLISHED | Established | `bg-blue-100 text-blue-800` |
| MEDIUM | STANDARD | Standard | `bg-yellow-100 text-yellow-800` |
| *(new)* | CAUTIOUS | Cautious | `bg-orange-100 text-orange-800` |
| HIGH | HIGH_RISK | High Risk | `bg-red-100 text-red-800` |
| NO_RISK | *(remove)* | — | — |

### Data Migration (SQL)

Update all existing client records to map old values to new:
```sql
UPDATE clients SET risk_appetite = 'PREMIUM' WHERE risk_appetite = 'LOW';
UPDATE clients SET risk_appetite = 'STANDARD' WHERE risk_appetite = 'MEDIUM';
UPDATE clients SET risk_appetite = 'HIGH_RISK' WHERE risk_appetite = 'HIGH';
UPDATE clients SET risk_appetite = 'STANDARD' WHERE risk_appetite = 'NO_RISK';

-- Same for default_risk_level
UPDATE clients SET default_risk_level = 'PREMIUM' WHERE default_risk_level = 'LOW';
UPDATE clients SET default_risk_level = 'STANDARD' WHERE default_risk_level = 'MEDIUM';
UPDATE clients SET default_risk_level = 'HIGH_RISK' WHERE default_risk_level = 'HIGH';

-- Update onboarding approvals risk_assessment
UPDATE client_onboarding_approvals SET risk_assessment = 'PREMIUM' WHERE risk_assessment = 'LOW';
UPDATE client_onboarding_approvals SET risk_assessment = 'STANDARD' WHERE risk_assessment = 'MEDIUM';
UPDATE client_onboarding_approvals SET risk_assessment = 'HIGH_RISK' WHERE risk_assessment = 'HIGH';
```

### Files to Update (10 files)

**1. `src/components/clients/steps/Step1BasicInfo.tsx`**
- Replace LOW/MEDIUM/HIGH/NO_RISK SelectItems with PREMIUM/ESTABLISHED/STANDARD/CAUTIOUS/HIGH_RISK

**2. `src/components/clients/ClientDashboard.tsx`**
- Update `getRiskBadge()` color map with all 5 new levels
- Update any default values

**3. `src/components/clients/ClientOverviewPanel.tsx`**
- Replace 3 SelectItems (LOW/MEDIUM/HIGH) with 5 new levels
- Change default fallback from `'MEDIUM'` to `'STANDARD'`

**4. `src/components/clients/EditClientDetailsDialog.tsx`**
- Replace 3 SelectItems with 5 new levels

**5. `src/components/clients/AddClientDialog.tsx`**
- Replace default `risk_appetite: 'MEDIUM'` with `'STANDARD'`
- Replace 3 SelectItems with 5 new levels

**6. `src/components/clients/ClientOnboardingApprovals.tsx`**
- Replace default `risk_assessment: 'HIGH'` with `'HIGH_RISK'`
- Replace 3 SelectItems in the approval form with 5 new levels
- Update all other default references

**7. `src/components/clients/ClientDirectoryFilters.tsx`**
- Update `RISK_LEVELS` array from `['HIGH', 'MEDIUM', 'LOW', 'NO_RISK']` to `['PREMIUM', 'ESTABLISHED', 'STANDARD', 'CAUTIOUS', 'HIGH_RISK']`

**8. `src/components/clients/ViewFullProfileDialog.tsx`**
- No code change needed (displays dynamic value), but badge will show new labels automatically

**9. `src/components/clients/MonthlyLimitsPanel.tsx`**
- Update fallback from `'MEDIUM'` to `'STANDARD'`

**10. `src/components/clients/KYCDocumentsDialog.tsx`**
- Displays `risk_assessment` dynamically — no change needed

### Summary
- 1 data migration (update existing LOW→PREMIUM, MEDIUM→STANDARD, HIGH→HIGH_RISK, NO_RISK→STANDARD)
- ~8 UI files updated to reflect the new 5-level system with consistent color coding
- All defaults changed from MEDIUM to STANDARD
- Approval flow defaults changed from HIGH to HIGH_RISK

