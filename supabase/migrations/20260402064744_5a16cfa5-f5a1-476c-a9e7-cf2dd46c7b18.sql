
INSERT INTO raci_roles (id, name, description, department, display_order, is_active, color)
VALUES ('a1000001-a000-4000-a000-000000000003', 'Internal Compliance Officer', 'Regulatory Control, KYC Governance & Internal Policy Enforcement. First line of defense against non-compliant users, transactions, and internal deviations.', 'Compliance', 3, true, '#9333ea');

INSERT INTO raci_categories (id, name, description, icon, display_order, is_active) VALUES
('c1000001-c000-4000-c000-000000000016', 'KYC Governance & Approval', 'Review, verify, approve/reject KYC submissions and maintain audit trails', 'Shield', 16, true),
('c1000001-c000-4000-c000-000000000017', 'Client Onboarding & Offboarding Control', 'Approve onboarding post-KYC, restrict/offboard non-compliant users', 'UserCheck', 17, true),
('c1000001-c000-4000-c000-000000000018', 'Platform Activity Monitoring', 'Internal surveillance of user activities, transaction behavior, and usage patterns', 'Eye', 18, true),
('c1000001-c000-4000-c000-000000000019', 'Communication Compliance', 'Monitor user chats, internal communications, and customer interaction logs', 'MessageSquare', 19, true),
('c1000001-c000-4000-c000-000000000020', 'Internal Policy Enforcement', 'Maintain and enforce all internal policies across operations', 'BookOpen', 20, true);

INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f1000001-f000-4000-f000-000000000001', 'c1000001-c000-4000-c000-000000000016', 'KYC document review & verification', 'Review Aadhaar, identity proofs for authenticity', 1, true),
('f1000001-f000-4000-f000-000000000002', 'c1000001-c000-4000-c000-000000000016', 'KYC approval / rejection decisions', 'Approve or reject KYC submissions with justification', 2, true),
('f1000001-f000-4000-f000-000000000003', 'c1000001-c000-4000-c000-000000000016', 'Identity-payment source matching', 'Ensure user identity matches payment sources', 3, true),
('f1000001-f000-4000-f000-000000000004', 'c1000001-c000-4000-c000-000000000016', 'Fake / manipulated document detection', 'Detect forged or tampered identity documents', 4, true),
('f1000001-f000-4000-f000-000000000005', 'c1000001-c000-4000-c000-000000000016', 'KYC audit trail maintenance', 'Maintain approval/rejection logs for audit', 5, true),
('f1000001-f000-4000-f000-000000000006', 'c1000001-c000-4000-c000-000000000017', 'Client onboarding approval post-KYC', 'Approve client onboarding after KYC validation', 1, true),
('f1000001-f000-4000-f000-000000000007', 'c1000001-c000-4000-c000-000000000017', 'User restriction based on compliance risk', 'Restrict users with suspicious history or compliance risk', 2, true),
('f1000001-f000-4000-f000-000000000008', 'c1000001-c000-4000-c000-000000000017', 'Client offboarding for policy violations', 'Execute offboarding for fraud, violations, or repeated non-compliance', 3, true),
('f1000001-f000-4000-f000-000000000009', 'c1000001-c000-4000-c000-000000000018', 'Transaction behavior monitoring', 'Monitor transaction patterns for suspicious activity', 1, true),
('f1000001-f000-4000-f000-000000000010', 'c1000001-c000-4000-c000-000000000018', 'Layering / routing detection', 'Detect transaction layering, routing, or mule behavior', 2, true),
('f1000001-f000-4000-f000-000000000011', 'c1000001-c000-4000-c000-000000000018', 'Unusual volume/frequency flagging', 'Flag abnormal transaction frequency or volume', 3, true),
('f1000001-f000-4000-f000-000000000012', 'c1000001-c000-4000-c000-000000000018', 'High-risk user identification', 'Proactively identify and classify high-risk users', 4, true),
('f1000001-f000-4000-f000-000000000013', 'c1000001-c000-4000-c000-000000000019', 'User chat monitoring', 'Monitor user chats for non-compliant wording', 1, true),
('f1000001-f000-4000-f000-000000000014', 'c1000001-c000-4000-c000-000000000019', 'Prohibited keyword detection', 'Detect prohibited keywords and off-platform deal attempts', 2, true),
('f1000001-f000-4000-f000-000000000015', 'c1000001-c000-4000-c000-000000000019', 'Communication violation escalation', 'Trigger warnings, restrictions, or escalation for violations', 3, true),
('f1000001-f000-4000-f000-000000000016', 'c1000001-c000-4000-c000-000000000020', 'Policy knowledge maintenance', 'Maintain updated knowledge of all internal policies', 1, true),
('f1000001-f000-4000-f000-000000000017', 'c1000001-c000-4000-c000-000000000020', 'Operations policy alignment checks', 'Ensure all operations align strictly with policies', 2, true),
('f1000001-f000-4000-f000-000000000018', 'c1000001-c000-4000-c000-000000000020', 'Policy deviation prevention', 'Prevent any deviation without documented approval', 3, true),
('f1000001-f000-4000-f000-000000000019', 'c1000001-c000-4000-c000-000000000020', 'Account freeze / Re-KYC recommendations', 'Recommend account freezes, Re-KYC, or transaction restrictions', 4, true),
('f1000001-f000-4000-f000-000000000020', 'c1000001-c000-4000-c000-000000000004', 'Compliance advisory to OM & GM', 'Provide compliance inputs and act as validation layer', 10, true),
('f1000001-f000-4000-f000-000000000021', 'c1000001-c000-4000-c000-000000000004', 'Risk classification framework enforcement', 'Enforce user risk classification framework', 11, true),
('f1000001-f000-4000-f000-000000000022', 'c1000001-c000-4000-c000-000000000009', 'High-risk fraud case escalation to GM', 'Escalate high-risk fraud, legal/regulatory exposure to GM', 10, true),
('f1000001-f000-4000-f000-000000000023', 'c1000001-c000-4000-c000-000000000009', 'Large-scale suspicious activity escalation', 'Escalate large-scale suspicious activity patterns', 11, true);

-- ICO RACI Assignments on own tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f1000001-f000-4000-f000-000000000001', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO primary reviewer'),
('f1000001-f000-4000-f000-000000000002', 'a1000001-a000-4000-a000-000000000003', 'A', 'Final KYC authority'),
('f1000001-f000-4000-f000-000000000003', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000004', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000005', 'a1000001-a000-4000-a000-000000000003', 'A', 'Audit trail ownership'),
('f1000001-f000-4000-f000-000000000006', 'a1000001-a000-4000-a000-000000000003', 'A', 'Final approval post-KYC'),
('f1000001-f000-4000-f000-000000000007', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000008', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000012', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000013', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000014', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000015', 'a1000001-a000-4000-a000-000000000003', 'A', NULL),
('f1000001-f000-4000-f000-000000000016', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000017', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000018', 'a1000001-a000-4000-a000-000000000003', 'A', NULL),
('f1000001-f000-4000-f000-000000000019', 'a1000001-a000-4000-a000-000000000003', 'R', NULL),
('f1000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000003', 'R', 'Advisory to OM & GM'),
('f1000001-f000-4000-f000-000000000021', 'a1000001-a000-4000-a000-000000000003', 'A', NULL),
('f1000001-f000-4000-f000-000000000022', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO escalates to GM'),
('f1000001-f000-4000-f000-000000000023', 'a1000001-a000-4000-a000-000000000003', 'R', NULL);

-- OM cross-role on ICO tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f1000001-f000-4000-f000-000000000001', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed of KYC outcomes'),
('f1000001-f000-4000-f000-000000000006', 'a1000001-a000-4000-a000-000000000001', 'C', 'OM consulted on onboarding'),
('f1000001-f000-4000-f000-000000000008', 'a1000001-a000-4000-a000-000000000001', 'C', 'OM consulted on offboarding'),
('f1000001-f000-4000-f000-000000000009', 'a1000001-a000-4000-a000-000000000001', 'C', 'OM consulted on suspicious patterns'),
('f1000001-f000-4000-f000-000000000015', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed of chat violations'),
('f1000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM receives compliance inputs');

-- GM cross-role on ICO tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f1000001-f000-4000-f000-000000000002', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed of KYC decisions'),
('f1000001-f000-4000-f000-000000000008', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed of offboarding'),
('f1000001-f000-4000-f000-000000000012', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on high-risk users'),
('f1000001-f000-4000-f000-000000000015', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on serious violations'),
('f1000001-f000-4000-f000-000000000019', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for freeze decisions'),
('f1000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM receives compliance advisory'),
('f1000001-f000-4000-f000-000000000022', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM resolves escalated fraud cases'),
('f1000001-f000-4000-f000-000000000023', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM resolves large-scale suspicious activity');

-- ICO on existing OM compliance tasks (correct IDs)
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('d1000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted on compliance enforcement'),
('d1000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible for non-compliant customer prevention'),
('d1000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted on third-party discrepancies'),
('d1000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted on account freezes');

-- KRAs
INSERT INTO role_kras (id, role_id, title, description, weightage, display_order, is_active) VALUES
('b1000001-b000-4000-b000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'Compliance & KYC Accuracy', 'Ensure highest accuracy in KYC verification, zero false approvals, and complete audit trails', 40, 1, true),
('b1000001-b000-4000-b000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'Risk Detection & Prevention', 'Proactive identification of high-risk users, suspicious transactions, and communication violations', 35, 2, true),
('b1000001-b000-4000-b000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'Operational Efficiency', 'Maintain fast KYC turnaround, efficient onboarding, and comprehensive monitoring coverage', 25, 3, true);

-- KPIs
INSERT INTO role_kpis (id, kra_id, role_id, metric, target, measurement_method, frequency, display_order, is_active) VALUES
('e1000001-e000-4000-e000-000000000025', 'b1000001-b000-4000-b000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'KYC Accuracy Rate', '≥ 99%', 'Correct approvals / Total approvals', 'Monthly', 1, true),
('e1000001-e000-4000-e000-000000000026', 'b1000001-b000-4000-b000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'False Approval Rate', '≈ 0%', 'False approvals / Total approvals', 'Monthly', 2, true),
('e1000001-e000-4000-e000-000000000027', 'b1000001-b000-4000-b000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'Policy Violation Detection Rate', '≥ 95%', 'Detected violations / Total violations', 'Monthly', 3, true),
('e1000001-e000-4000-e000-000000000028', 'b1000001-b000-4000-b000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'Audit Trail Completeness', '100%', 'Documented decisions / Total decisions', 'Monthly', 4, true),
('e1000001-e000-4000-e000-000000000029', 'b1000001-b000-4000-b000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'Risky Users Identified', 'Continuous improvement', 'Count of flagged high-risk users', 'Weekly', 5, true),
('e1000001-e000-4000-e000-000000000030', 'b1000001-b000-4000-b000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'Fraud Incident Reduction', 'QoQ decrease', 'Fraud incidents compared to prior quarter', 'Quarterly', 6, true),
('e1000001-e000-4000-e000-000000000031', 'b1000001-b000-4000-b000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'Early Detection Efficiency', '≥ 90% pre-escalation', 'Issues caught before escalation / Total issues', 'Monthly', 7, true),
('e1000001-e000-4000-e000-000000000032', 'b1000001-b000-4000-b000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'KYC Turnaround Time', '≤ 24 hours', 'Average time from submission to decision', 'Weekly', 8, true),
('e1000001-e000-4000-e000-000000000033', 'b1000001-b000-4000-b000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'Onboarding Efficiency', '≥ 90% within SLA', 'Onboardings completed within SLA / Total', 'Monthly', 9, true),
('e1000001-e000-4000-e000-000000000034', 'b1000001-b000-4000-b000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'Chat Compliance Monitoring Coverage', '100% coverage', 'Monitored chats / Total chats', 'Daily', 10, true);
