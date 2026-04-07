

## Update Client Onboarding Approval Form (Buyer)

### Problem
In the buyer approval dialog (`ClientOnboardingApprovals.tsx`), the "Order Information" section displays phone and state as read-only text. Phone is not editable at all, and state is editable but not mandatory. For buyer approvals, phone and state must be mandatory and editable.

### Changes (Single File: `ClientOnboardingApprovals.tsx`)

**1. Add `client_phone` to formData state**
- Add `client_phone` field to the `formData` state object and `resetForm`
- Pre-populate it from `selectedApproval.client_phone` in `handleApprovalClick`

**2. Update "Order Information" section (lines 862-884)**
- Client Name: keep as read-only display text (no edit)
- Order Amount, Email: keep as read-only display
- Phone: replace static text with an editable `Input` field bound to `formData.client_phone`, marked with `*`
- State: replace static text with editable `Input` (or move existing state input here), marked with `*`

**3. Remove duplicate state field from compliance form**
- The state `Input` currently at line 953-961 will be moved up into Order Information, avoiding duplication

**4. Add mandatory validation in `handleApprove`**
- Before approval, validate that `formData.client_phone` is not empty
- Validate that `formData.client_state` is not empty
- Show toast errors if missing: "Phone number is mandatory for buyer approval" / "State is mandatory for buyer approval"

**5. Pass phone & state to mutation**
- In `approveClientMutation`, use `formData.client_phone` and `formData.client_state` (instead of `approval.client_phone` / `approval.client_state`) when creating/updating the client record
- Also update the approval record with the edited phone/state values

### What stays the same
- Client name remains non-editable (display only)
- Seller approval form (`SellerOnboardingApprovals.tsx`) is untouched — no mandatory phone/state there
- All other form fields (monthly limit, risk, purpose, compliance notes) unchanged

