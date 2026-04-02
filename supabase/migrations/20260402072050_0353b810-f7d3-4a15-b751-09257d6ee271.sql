
-- Role: External Compliance Officer
INSERT INTO raci_roles (id, name, description, department, display_order, is_active, color)
VALUES ('a1000001-a000-4000-a000-000000000006', 'External Compliance Officer', 'ECO – Legal Interface, Enforcement Handling & Banking Control Authority', 'Compliance', 6, true, '#f59e0b')
ON CONFLICT (id) DO NOTHING;

-- Categories
INSERT INTO raci_categories (id, name, description, icon, display_order, is_active) VALUES
('c1000001-c000-4000-c000-000000000027', 'Law Enforcement & Regulatory Notices', 'Police notices, enforcement communications, regulatory inquiries', 'Shield', 27, true),
('c1000001-c000-4000-c000-000000000028', 'Banking Relationship Management', 'Bank relationships, account issues, freezes, liens', 'Building2', 28, true),
('c1000001-c000-4000-c000-000000000029', 'Payment Dispute & Recovery', 'Wrong payments, unauthorized transfers, recovery procedures', 'RefreshCw', 29, true),
('c1000001-c000-4000-c000-000000000030', 'Legal Representation & Documentation', 'Legal matters, enforcement proceedings, evidence submissions', 'Scale', 30, true),
('c1000001-c000-4000-c000-000000000031', 'External Compliance Fulfillment', 'Platform compliance, banking channel compliance, audit-ready docs', 'ClipboardCheck', 31, true)
ON CONFLICT (id) DO NOTHING;

-- Tasks
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
-- Law Enforcement
('d1000001-d000-4000-d000-000000000082', 'c1000001-c000-4000-c000-000000000027', 'Police Notice Response Management', 'Receive, review, and respond to police notices', 1, true),
('d1000001-d000-4000-d000-000000000083', 'c1000001-c000-4000-c000-000000000027', 'Regulatory Authority Communication', 'Handle enforcement department and regulatory inquiries', 2, true),
('d1000001-d000-4000-d000-000000000084', 'c1000001-c000-4000-c000-000000000027', 'Case-User Identification & Isolation', 'Identify and isolate users/accounts linked to notices', 3, true),
('d1000001-d000-4000-d000-000000000085', 'c1000001-c000-4000-c000-000000000027', 'Internal Data Coordination for Legal', 'Coordinate internal data collection via GM/ICO for legal responses', 4, true),
-- Banking
('d1000001-d000-4000-d000-000000000086', 'c1000001-c000-4000-c000-000000000028', 'Bank Relationship Maintenance', 'Maintain and manage relationships with banks and payment institutions', 1, true),
('d1000001-d000-4000-d000-000000000087', 'c1000001-c000-4000-c000-000000000028', 'Account Freeze & Lien Handling', 'Handle account freezes, liens, and restrictions', 2, true),
('d1000001-d000-4000-d000-000000000088', 'c1000001-c000-4000-c000-000000000028', 'Banking Dispute Resolution', 'Resolve escalations with banking authorities', 3, true),
-- Payment Disputes
('d1000001-d000-4000-d000-000000000089', 'c1000001-c000-4000-c000-000000000029', 'Wrong Payment Recovery', 'Initiate payment recollection for wrong/unauthorized payments', 1, true),
('d1000001-d000-4000-d000-000000000090', 'c1000001-c000-4000-c000-000000000029', 'Disputed Transaction Resolution', 'Handle disputed transactions and coordinate recovery', 2, true),
('d1000001-d000-4000-d000-000000000091', 'c1000001-c000-4000-c000-000000000029', 'Financial Loss Minimization', 'Maximize recovery and minimize financial loss from disputes', 3, true),
-- Legal Representation
('d1000001-d000-4000-d000-000000000092', 'c1000001-c000-4000-c000-000000000030', 'Company Legal Representation', 'Represent the Company in legal matters under PoA', 1, true),
('d1000001-d000-4000-d000-000000000093', 'c1000001-c000-4000-c000-000000000030', 'Legal Documentation & Evidence', 'Prepare legal replies, documentation, and evidence submissions', 2, true),
('d1000001-d000-4000-d000-000000000094', 'c1000001-c000-4000-c000-000000000030', 'Enforcement Proceedings Management', 'Handle enforcement proceedings and coordinate with legal advisors', 3, true),
-- External Compliance
('d1000001-d000-4000-d000-000000000095', 'c1000001-c000-4000-c000-000000000031', 'Platform Compliance Fulfillment', 'Ensure compliance requirements met across all platforms', 1, true),
('d1000001-d000-4000-d000-000000000096', 'c1000001-c000-4000-c000-000000000031', 'Banking Channel Compliance', 'Maintain compliance across banking channels', 2, true),
('d1000001-d000-4000-d000-000000000097', 'c1000001-c000-4000-c000-000000000031', 'Audit-Ready Documentation', 'Maintain compliance records and audit-ready documentation', 3, true),
('d1000001-d000-4000-d000-000000000098', 'c1000001-c000-4000-c000-000000000031', 'External Communication Bridge', 'Central bridge between Company and external authorities/banks/legal', 4, true),
('d1000001-d000-4000-d000-000000000099', 'c1000001-c000-4000-c000-000000000031', 'PoA-Authorized Actions', 'Execute actions under Power of Attorney as legally permitted', 5, true)
ON CONFLICT (id) DO NOTHING;

-- RACI Assignments
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
-- ECO primary assignments
('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO handles police notice responses'),
('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for legal notice handling'),
('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-Abhishek informed of police notices'),
('d1000001-d000-4000-d000-000000000083', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO handles regulatory communications'),
('d1000001-d000-4000-d000-000000000083', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for regulatory responses'),
('d1000001-d000-4000-d000-000000000084', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO identifies users linked to notices'),
('d1000001-d000-4000-d000-000000000084', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted for user data and KYC'),
('d1000001-d000-4000-d000-000000000085', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO coordinates data for legal responses'),
('d1000001-d000-4000-d000-000000000085', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted for internal data'),
('d1000001-d000-4000-d000-000000000085', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted for compliance data'),
-- Banking
('d1000001-d000-4000-d000-000000000086', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO manages bank relationships'),
('d1000001-d000-4000-d000-000000000086', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for banking continuity'),
('d1000001-d000-4000-d000-000000000087', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO handles account freezes and liens'),
('d1000001-d000-4000-d000-000000000087', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for freeze decisions'),
('d1000001-d000-4000-d000-000000000087', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-Abhishek informed of account freezes'),
('d1000001-d000-4000-d000-000000000088', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO resolves banking disputes'),
('d1000001-d000-4000-d000-000000000088', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on banking escalations'),
-- Payment Disputes
('d1000001-d000-4000-d000-000000000089', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO initiates wrong payment recovery'),
('d1000001-d000-4000-d000-000000000089', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for recovery outcomes'),
('d1000001-d000-4000-d000-000000000089', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed of payment recovery actions'),
('d1000001-d000-4000-d000-000000000090', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO handles disputed transactions'),
('d1000001-d000-4000-d000-000000000090', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for dispute resolution'),
('d1000001-d000-4000-d000-000000000091', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO drives financial loss minimization'),
('d1000001-d000-4000-d000-000000000091', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for financial exposure'),
-- Legal Representation
('d1000001-d000-4000-d000-000000000092', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO represents Company under PoA'),
('d1000001-d000-4000-d000-000000000092', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for legal positions'),
('d1000001-d000-4000-d000-000000000093', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO prepares legal documentation'),
('d1000001-d000-4000-d000-000000000093', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted for internal evidence'),
('d1000001-d000-4000-d000-000000000094', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO manages enforcement proceedings'),
('d1000001-d000-4000-d000-000000000094', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for enforcement outcomes'),
-- External Compliance
('d1000001-d000-4000-d000-000000000095', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO ensures platform compliance'),
('d1000001-d000-4000-d000-000000000095', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted on internal compliance alignment'),
('d1000001-d000-4000-d000-000000000096', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO maintains banking channel compliance'),
('d1000001-d000-4000-d000-000000000097', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO maintains audit-ready documentation'),
('d1000001-d000-4000-d000-000000000097', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for audit readiness'),
('d1000001-d000-4000-d000-000000000098', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO acts as central external bridge'),
('d1000001-d000-4000-d000-000000000098', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed of external communications'),
('d1000001-d000-4000-d000-000000000099', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO executes PoA-authorized actions'),
('d1000001-d000-4000-d000-000000000099', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for PoA scope')
ON CONFLICT DO NOTHING;

-- KRAs
INSERT INTO role_kras (id, role_id, title, description, weightage, display_order, is_active) VALUES
('e1000001-e000-4000-e000-000000000018', 'a1000001-a000-4000-a000-000000000006', 'Legal & Regulatory Compliance', 'Timely, accurate handling of all law enforcement and regulatory matters', 30, 1, true),
('e1000001-e000-4000-e000-000000000019', 'a1000001-a000-4000-a000-000000000006', 'Banking Relationship Stability', 'Continuity and stability of banking operations and relationships', 25, 2, true),
('e1000001-e000-4000-e000-000000000020', 'a1000001-a000-4000-a000-000000000006', 'Financial Recovery & Dispute Resolution', 'Maximize recovery from disputes, minimize financial losses', 25, 3, true),
('e1000001-e000-4000-e000-000000000021', 'a1000001-a000-4000-a000-000000000006', 'External Compliance & Documentation', 'Audit-ready documentation and external compliance fulfillment', 20, 4, true)
ON CONFLICT (id) DO NOTHING;

-- KPIs
INSERT INTO role_kpis (id, kra_id, role_id, metric, target, measurement_method, frequency, display_order, is_active) VALUES
('f1000001-f000-4000-f000-000000000048', 'e1000001-e000-4000-e000-000000000018', 'a1000001-a000-4000-a000-000000000006', 'Notice Response Time', '< 48 hours', 'Time from receipt to response submission', 'Per incident', 1, true),
('f1000001-f000-4000-f000-000000000049', 'e1000001-e000-4000-e000-000000000018', 'a1000001-a000-4000-a000-000000000006', 'Legal Case Resolution Rate', '≥ 85% favorable', 'Favorable outcomes vs total cases', 'Quarterly', 2, true),
('f1000001-f000-4000-f000-000000000050', 'e1000001-e000-4000-e000-000000000018', 'a1000001-a000-4000-a000-000000000006', 'Compliance Adherence Score', '100% across external bodies', 'External audit results', 'Quarterly', 3, true),
('f1000001-f000-4000-f000-000000000051', 'e1000001-e000-4000-e000-000000000019', 'a1000001-a000-4000-a000-000000000006', 'Banking Issue Resolution Time', '< 5 business days', 'Time from issue to resolution', 'Per incident', 1, true),
('f1000001-f000-4000-f000-000000000052', 'e1000001-e000-4000-e000-000000000019', 'a1000001-a000-4000-a000-000000000006', 'Banking Relationship Stability', 'Zero involuntary closures', 'Account continuity tracking', 'Monthly', 2, true),
('f1000001-f000-4000-f000-000000000053', 'e1000001-e000-4000-e000-000000000020', 'a1000001-a000-4000-a000-000000000006', 'Disputed Payment Recovery Rate', '≥ 75%', 'Recovered amount vs disputed amount', 'Monthly', 1, true),
('f1000001-f000-4000-f000-000000000054', 'e1000001-e000-4000-e000-000000000020', 'a1000001-a000-4000-a000-000000000006', 'Financial Loss Reduction', 'YoY reduction in losses', 'Loss comparison against prior periods', 'Quarterly', 2, true),
('f1000001-f000-4000-f000-000000000055', 'e1000001-e000-4000-e000-000000000020', 'a1000001-a000-4000-a000-000000000006', 'Dispute Resolution Time', '< 10 business days', 'Time from dispute to closure', 'Per incident', 3, true),
('f1000001-f000-4000-f000-000000000056', 'e1000001-e000-4000-e000-000000000021', 'a1000001-a000-4000-a000-000000000006', 'Escalated Legal Issues Count', 'Declining trend', 'Number of issues escalated to MD', 'Monthly', 1, true),
('f1000001-f000-4000-f000-000000000057', 'e1000001-e000-4000-e000-000000000021', 'a1000001-a000-4000-a000-000000000006', 'Enforcement Action Severity Reduction', 'Year-over-year improvement', 'Severity classification tracking', 'Quarterly', 2, true)
ON CONFLICT (id) DO NOTHING;
