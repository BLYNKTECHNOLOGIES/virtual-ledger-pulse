
-- GM Role
INSERT INTO public.raci_roles (id, name, description, department, display_order, color)
VALUES ('a1000001-a000-4000-a000-000000000002', 'General Manager', 'Central command authority responsible for integrated control over operations, finance, compliance, risk, and stakeholder management. Final decision-making authority across all functional domains except Director/Board reserved matters.', 'Management', 0, '#DC2626')
ON CONFLICT DO NOTHING;

-- New categories for GM scope
INSERT INTO public.raci_categories (id, name, icon, display_order) VALUES
  ('c1000001-c000-4000-c000-000000000010', 'Financial Control & Liquidity Management', '🏦', 10),
  ('c1000001-c000-4000-c000-000000000011', 'Complaints & Dispute Authority', '📋', 11),
  ('c1000001-c000-4000-c000-000000000012', 'Law Enforcement & Regulatory Interface', '⚖️', 12),
  ('c1000001-c000-4000-c000-000000000013', 'Accounting & Taxation', '📊', 13),
  ('c1000001-c000-4000-c000-000000000014', 'Communication Control', '📡', 14),
  ('c1000001-c000-4000-c000-000000000015', 'Workforce Authority & HR', '🧑‍💼', 15)
ON CONFLICT DO NOTHING;

-- Tasks: Financial Control & Liquidity
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000101', 'c1000001-c000-4000-c000-000000000010', 'Bank account operations', 'Full authority over all bank account operations and fund movements', 1),
  ('d1000001-d000-4000-d000-000000000102', 'c1000001-c000-4000-c000-000000000010', 'Fund allocation across platforms', 'Allocate liquidity across ads and trading channels', 2),
  ('d1000001-d000-4000-d000-000000000103', 'c1000001-c000-4000-c000-000000000010', 'Liquidity distribution governance', 'Ensure continuous liquidity availability with no operational disruption', 3),
  ('d1000001-d000-4000-d000-000000000104', 'c1000001-c000-4000-c000-000000000010', 'Resolve banking failures', 'Handle settlement mismatches, debit/credit discrepancies', 4),
  ('d1000001-d000-4000-d000-000000000105', 'c1000001-c000-4000-c000-000000000010', 'Payment system governance', 'End-to-end control over payment systems and fund routing', 5),
  ('d1000001-d000-4000-d000-000000000106', 'c1000001-c000-4000-c000-000000000010', 'High-value transaction approvals', 'Approve transactions above defined thresholds', 6)
ON CONFLICT DO NOTHING;

-- Tasks: Complaints & Dispute Authority
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000110', 'c1000001-c000-4000-c000-000000000011', 'Handle internal complaints', 'Resolution of all internal organizational complaints', 1),
  ('d1000001-d000-4000-d000-000000000111', 'c1000001-c000-4000-c000-000000000011', 'Handle external complaints', 'Resolution of all external/customer complaints', 2),
  ('d1000001-d000-4000-d000-000000000112', 'c1000001-c000-4000-c000-000000000011', 'Platform dispute resolution', 'Handle platform-level disputes and escalations', 3),
  ('d1000001-d000-4000-d000-000000000113', 'c1000001-c000-4000-c000-000000000011', 'Fraud investigation oversight', 'Oversee fraud investigations and account freezes', 4),
  ('d1000001-d000-4000-d000-000000000114', 'c1000001-c000-4000-c000-000000000011', 'Suspicious transaction review', 'Review and decide on high-risk client and transaction matters', 5)
ON CONFLICT DO NOTHING;

-- Tasks: Law Enforcement & Regulatory
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000120', 'c1000001-c000-4000-c000-000000000012', 'Handle police notices', 'Primary authority for all police and enforcement inquiries', 1),
  ('d1000001-d000-4000-d000-000000000121', 'c1000001-c000-4000-c000-000000000012', 'Regulatory communications', 'Manage all regulatory correspondence and compliance reporting', 2),
  ('d1000001-d000-4000-d000-000000000122', 'c1000001-c000-4000-c000-000000000012', 'Legal advisor coordination', 'Coordinate with legal advisors for defensible responses', 3),
  ('d1000001-d000-4000-d000-000000000123', 'c1000001-c000-4000-c000-000000000012', 'Documentation for legal matters', 'Ensure proper documentation for all legal/regulatory matters', 4)
ON CONFLICT DO NOTHING;

-- Tasks: Accounting & Taxation
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000130', 'c1000001-c000-4000-c000-000000000013', 'Company-wide accounting oversight', 'Oversee all accounting systems and financial reporting', 1),
  ('d1000001-d000-4000-d000-000000000131', 'c1000001-c000-4000-c000-000000000013', 'Transaction-level reconciliation', 'Ensure transaction-level financial reconciliation accuracy', 2),
  ('d1000001-d000-4000-d000-000000000132', 'c1000001-c000-4000-c000-000000000013', 'TDS & taxation framework', 'Implement and oversee taxation framework compliance', 3),
  ('d1000001-d000-4000-d000-000000000133', 'c1000001-c000-4000-c000-000000000013', 'Financial audit compliance', 'Ensure records are accurate, auditable, and fully compliant', 4)
ON CONFLICT DO NOTHING;

-- Tasks: Communication Control
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000140', 'c1000001-c000-4000-c000-000000000014', 'Inter-department coordination', 'Manage cross-departmental communication and alignment', 1),
  ('d1000001-d000-4000-d000-000000000141', 'c1000001-c000-4000-c000-000000000014', 'Escalation handling & conflict resolution', 'Final authority on internal escalations and team conflicts', 2),
  ('d1000001-d000-4000-d000-000000000142', 'c1000001-c000-4000-c000-000000000014', 'Client escalation management', 'Handle escalated client issues requiring management intervention', 3),
  ('d1000001-d000-4000-d000-000000000143', 'c1000001-c000-4000-c000-000000000014', 'Banking communication', 'Direct communication with banking partners and institutions', 4)
ON CONFLICT DO NOTHING;

-- Tasks: Workforce Authority
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000150', 'c1000001-c000-4000-c000-000000000015', 'Employee suspension & disciplinary actions', 'Authority to suspend or initiate disciplinary proceedings', 1),
  ('d1000001-d000-4000-d000-000000000151', 'c1000001-c000-4000-c000-000000000015', 'Define staffing & hiring needs', 'Determine staffing requirements and authorize hiring', 2),
  ('d1000001-d000-4000-d000-000000000152', 'c1000001-c000-4000-c000-000000000015', 'Performance feedback to HR', 'Provide structured performance inputs for HR processes', 3)
ON CONFLICT DO NOTHING;

-- GM RACI Assignments (new GM-specific tasks)
INSERT INTO public.raci_assignments (task_id, role_id, assignment_type) VALUES
  -- Financial Control: GM is A
  ('d1000001-d000-4000-d000-000000000101', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000102', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000103', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000104', 'a1000001-a000-4000-a000-000000000002', 'R'),
  ('d1000001-d000-4000-d000-000000000105', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000106', 'a1000001-a000-4000-a000-000000000002', 'A'),
  -- Complaints: GM is A
  ('d1000001-d000-4000-d000-000000000110', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000111', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000112', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000113', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000114', 'a1000001-a000-4000-a000-000000000002', 'R'),
  -- Law Enforcement: GM is R+A
  ('d1000001-d000-4000-d000-000000000120', 'a1000001-a000-4000-a000-000000000002', 'R'),
  ('d1000001-d000-4000-d000-000000000121', 'a1000001-a000-4000-a000-000000000002', 'R'),
  ('d1000001-d000-4000-d000-000000000122', 'a1000001-a000-4000-a000-000000000002', 'R'),
  ('d1000001-d000-4000-d000-000000000123', 'a1000001-a000-4000-a000-000000000002', 'A'),
  -- Accounting: GM is A
  ('d1000001-d000-4000-d000-000000000130', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000131', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000132', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000133', 'a1000001-a000-4000-a000-000000000002', 'A'),
  -- Communication: GM is A
  ('d1000001-d000-4000-d000-000000000140', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000141', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000142', 'a1000001-a000-4000-a000-000000000002', 'R'),
  ('d1000001-d000-4000-d000-000000000143', 'a1000001-a000-4000-a000-000000000002', 'R'),
  -- Workforce: GM is A
  ('d1000001-d000-4000-d000-000000000150', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000151', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000152', 'a1000001-a000-4000-a000-000000000002', 'R')
ON CONFLICT (task_id, role_id) DO UPDATE SET assignment_type = EXCLUDED.assignment_type;

-- GM cross-role assignments on OM tasks (GM oversight layer)
INSERT INTO public.raci_assignments (task_id, role_id, assignment_type) VALUES
  -- Ad Governance: GM is I (informed)
  ('d1000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000002', 'C'),
  -- Order Lifecycle: GM is I
  ('d1000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000002', 'I'),
  -- Appeals: GM is C
  ('d1000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000002', 'C'),
  -- Compliance: GM is A (overrides OM's R)
  ('d1000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000002', 'A'),
  -- Team Governance: GM is I
  ('d1000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000002', 'C'),
  -- Pricing: GM is C
  ('d1000001-d000-4000-d000-000000000050', 'a1000001-a000-4000-a000-000000000002', 'C'),
  ('d1000001-d000-4000-d000-000000000051', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000052', 'a1000001-a000-4000-a000-000000000002', 'I'),
  -- Payment Flow: GM is A (fund custodian)
  ('d1000001-d000-4000-d000-000000000070', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000071', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000072', 'a1000001-a000-4000-a000-000000000002', 'A'),
  -- Escalation: GM is A for L2, I for L1
  ('d1000001-d000-4000-d000-000000000080', 'a1000001-a000-4000-a000-000000000002', 'I'),
  ('d1000001-d000-4000-d000-000000000081', 'a1000001-a000-4000-a000-000000000002', 'A'),
  ('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000002', 'R')
ON CONFLICT (task_id, role_id) DO UPDATE SET assignment_type = EXCLUDED.assignment_type;

-- OM cross-assignments on GM tasks (OM supports GM)
INSERT INTO public.raci_assignments (task_id, role_id, assignment_type) VALUES
  ('d1000001-d000-4000-d000-000000000101', 'a1000001-a000-4000-a000-000000000001', 'I'),
  ('d1000001-d000-4000-d000-000000000102', 'a1000001-a000-4000-a000-000000000001', 'I'),
  ('d1000001-d000-4000-d000-000000000103', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000104', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000110', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000111', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000112', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000113', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000114', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000140', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000141', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000150', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000151', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000152', 'a1000001-a000-4000-a000-000000000001', 'R')
ON CONFLICT (task_id, role_id) DO UPDATE SET assignment_type = EXCLUDED.assignment_type;

-- GM KRAs
INSERT INTO public.role_kras (id, role_id, title, description, weightage, display_order) VALUES
  ('e1000001-e000-4000-e000-000000000010', 'a1000001-a000-4000-a000-000000000002', 'Financial Control & Liquidity', 'Liquidity stability, zero payment failures, reconciliation accuracy', 30, 1),
  ('e1000001-e000-4000-e000-000000000011', 'a1000001-a000-4000-a000-000000000002', 'Operational Oversight', 'Company-wide completion rate, escalation reduction, system uptime', 20, 2),
  ('e1000001-e000-4000-e000-000000000012', 'a1000001-a000-4000-a000-000000000002', 'Risk, Compliance & Regulatory', 'Fraud incidents, complaint resolution, regulatory handling success', 30, 3),
  ('e1000001-e000-4000-e000-000000000013', 'a1000001-a000-4000-a000-000000000002', 'Workforce & Communication', 'Employee productivity, attrition control, PIP success rate', 20, 4)
ON CONFLICT DO NOTHING;

-- GM KPIs
INSERT INTO public.role_kpis (role_id, kra_id, metric, target, measurement_method, frequency, display_order) VALUES
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000010', 'Liquidity Stability Index', 'Zero fund-related disruptions', 'Count of operations halted due to liquidity', 'Daily', 1),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000010', 'Payment Failure Rate', 'Zero failures', 'Failed payments / total payment attempts', 'Daily', 2),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000010', 'Reconciliation Accuracy', '100%', 'Reconciled vs total transactions', 'Weekly', 3),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000011', 'Company-wide Completion Rate', '≥ 95%', 'Completed orders vs total orders', 'Daily', 1),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000011', 'Escalation Reduction', 'Month-over-month decrease', 'L2+ escalations trend', 'Monthly', 2),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000011', 'System Uptime', '≥ 99.5%', 'Platform uptime / total operational hours', 'Weekly', 3),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000012', 'Fraud Incident Count', 'Month-over-month decrease', 'Confirmed fraud cases per period', 'Monthly', 1),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000012', 'Complaint Resolution Time', '≤ 24 hours', 'Average time from complaint to documented closure', 'Weekly', 2),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000012', 'Regulatory Issue Success Rate', '100%', 'Successfully handled regulatory matters / total', 'Quarterly', 3),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000013', 'Employee Productivity', 'Above benchmark', 'Output per employee vs company targets', 'Monthly', 1),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000013', 'Attrition Rate', '< 10% annually', 'Voluntary exits / average headcount', 'Quarterly', 2),
  ('a1000001-a000-4000-a000-000000000002', 'e1000001-e000-4000-e000-000000000013', 'PIP Success Rate', '≥ 70%', 'Employees who improved post-PIP / total PIPs', 'Quarterly', 3)
ON CONFLICT DO NOTHING;
