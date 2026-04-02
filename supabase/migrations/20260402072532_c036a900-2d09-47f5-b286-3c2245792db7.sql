
-- Deactivate all old fragmented categories
UPDATE raci_categories SET is_active = false WHERE id::text LIKE 'c1000001%';

-- Deactivate all old tasks
UPDATE raci_tasks SET is_active = false WHERE id::text LIKE 'd1000001%';

-- Delete old assignments linked to deactivated tasks
DELETE FROM raci_assignments WHERE task_id::text LIKE 'd1000001%';

-- ============================================================
-- 10 UNIFIED MASTER CATEGORIES
-- ============================================================
INSERT INTO raci_categories (id, name, description, icon, display_order, is_active) VALUES
('c2000001-c000-4000-c000-000000000001', 'Ads, Sales & Purchase Operations', 'Sales strategy, purchase strategy, ad management, liquidity alignment', 'TrendingUp', 1, true),
('c2000001-c000-4000-c000-000000000002', 'Order Lifecycle Execution', 'Order processing, payment verification, coin release, queue monitoring', 'PackageCheck', 2, true),
('c2000001-c000-4000-c000-000000000003', 'Compliance, KYC & Risk', 'KYC approval, onboarding, offboarding, risk flagging, policy enforcement', 'ShieldCheck', 3, true),
('c2000001-c000-4000-c000-000000000004', 'Fraud, Suspicious Activity & Freezes', 'Fraud detection, account freezes, suspicious transactions, escalations', 'AlertTriangle', 4, true),
('c2000001-c000-4000-c000-000000000005', 'Appeals & Dispute Management', 'Appeal handling, escalation, resolution, reduction strategy', 'MessageSquare', 5, true),
('c2000001-c000-4000-c000-000000000006', 'Finance, Banking & Fund Flow', 'Fund allocation, liquidity, banking issues, payment monitoring, recovery', 'Landmark', 6, true),
('c2000001-c000-4000-c000-000000000007', 'Legal, Enforcement & External Compliance', 'Police notices, regulatory communication, legal representation, compliance', 'Scale', 7, true),
('c2000001-c000-4000-c000-000000000008', 'Technology, ERP & Platform', 'Tech stack, ERP development, platform onboarding, workflow automation, analytics', 'Code', 8, true),
('c2000001-c000-4000-c000-000000000009', 'HR & Organizational Control', 'Hiring strategy, performance management, PIP, training & SOP enforcement', 'Users', 9, true),
('c2000001-c000-4000-c000-000000000010', 'Strategic & Organizational Decisions', 'Business strategy, expansion decisions, high-value risk decisions', 'Target', 10, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TASKS (d2-prefix)
-- ============================================================

-- Cat 1: Ads, Sales & Purchase Operations
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('d2000001-d000-4000-d000-000000000001', 'c2000001-c000-4000-c000-000000000001', 'Sales Strategy (Sell-side)', 'Sell-side sales strategy and revenue planning', 1, true),
('d2000001-d000-4000-d000-000000000002', 'c2000001-c000-4000-c000-000000000001', 'Purchase Strategy (Buy-side)', 'Buy-side procurement strategy and asset acquisition', 2, true),
('d2000001-d000-4000-d000-000000000003', 'c2000001-c000-4000-c000-000000000001', 'Ad Creation & Optimization', 'Create and optimize trading advertisements', 3, true),
('d2000001-d000-4000-d000-000000000004', 'c2000001-c000-4000-c000-000000000001', 'Ad Monitoring & Positioning', 'Monitor ad performance and market positioning', 4, true),
('d2000001-d000-4000-d000-000000000005', 'c2000001-c000-4000-c000-000000000001', 'Liquidity Alignment with Ads', 'Align liquidity availability with active ads', 5, true),

-- Cat 2: Order Lifecycle Execution
('d2000001-d000-4000-d000-000000000006', 'c2000001-c000-4000-c000-000000000002', 'Order Processing', 'End-to-end order processing and execution', 1, true),
('d2000001-d000-4000-d000-000000000007', 'c2000001-c000-4000-c000-000000000002', 'Payment Verification', 'Verify incoming payments before processing', 2, true),
('d2000001-d000-4000-d000-000000000008', 'c2000001-c000-4000-c000-000000000002', 'Coin Release', 'Release crypto assets after payment confirmation', 3, true),
('d2000001-d000-4000-d000-000000000009', 'c2000001-c000-4000-c000-000000000002', 'Queue Monitoring', 'Monitor order queues and processing pipeline', 4, true),
('d2000001-d000-4000-d000-000000000010', 'c2000001-c000-4000-c000-000000000002', 'Delay Intervention', 'Intervene in delayed or stuck orders', 5, true),

-- Cat 3: Compliance, KYC & Risk
('d2000001-d000-4000-d000-000000000011', 'c2000001-c000-4000-c000-000000000003', 'KYC Approval', 'Review and approve/reject KYC submissions', 1, true),
('d2000001-d000-4000-d000-000000000012', 'c2000001-c000-4000-c000-000000000003', 'User Onboarding', 'Onboard new users post-KYC validation', 2, true),
('d2000001-d000-4000-d000-000000000013', 'c2000001-c000-4000-c000-000000000003', 'User Offboarding', 'Execute user offboarding for policy violations', 3, true),
('d2000001-d000-4000-d000-000000000014', 'c2000001-c000-4000-c000-000000000003', 'Risk Flagging', 'Identify and flag high-risk users', 4, true),
('d2000001-d000-4000-d000-000000000015', 'c2000001-c000-4000-c000-000000000003', 'Re-KYC Initiation', 'Initiate re-KYC for suspicious accounts', 5, true),
('d2000001-d000-4000-d000-000000000016', 'c2000001-c000-4000-c000-000000000003', 'Internal Policy Enforcement', 'Enforce all internal compliance policies', 6, true),

-- Cat 4: Fraud, Suspicious Activity & Freezes
('d2000001-d000-4000-d000-000000000017', 'c2000001-c000-4000-c000-000000000004', 'Fraud Detection', 'Detect fraudulent activities and patterns', 1, true),
('d2000001-d000-4000-d000-000000000018', 'c2000001-c000-4000-c000-000000000004', 'Account Freeze', 'Freeze accounts linked to suspicious activity', 2, true),
('d2000001-d000-4000-d000-000000000019', 'c2000001-c000-4000-c000-000000000004', 'Suspicious Transaction Handling', 'Review and act on suspicious transactions', 3, true),
('d2000001-d000-4000-d000-000000000020', 'c2000001-c000-4000-c000-000000000004', 'High-Risk Case Escalation', 'Escalate high-risk cases to appropriate authority', 4, true),

-- Cat 5: Appeals & Dispute Management
('d2000001-d000-4000-d000-000000000021', 'c2000001-c000-4000-c000-000000000005', 'Appeal Handling', 'Handle incoming appeals from users', 1, true),
('d2000001-d000-4000-d000-000000000022', 'c2000001-c000-4000-c000-000000000005', 'Appeal Escalation', 'Escalate unresolved appeals to higher authority', 2, true),
('d2000001-d000-4000-d000-000000000023', 'c2000001-c000-4000-c000-000000000005', 'Appeal Resolution', 'Resolve appeals with documented outcomes', 3, true),
('d2000001-d000-4000-d000-000000000024', 'c2000001-c000-4000-c000-000000000005', 'Appeal Reduction Strategy', 'Implement strategies to reduce appeal volume', 4, true),

-- Cat 6: Finance, Banking & Fund Flow
('d2000001-d000-4000-d000-000000000025', 'c2000001-c000-4000-c000-000000000006', 'Fund Allocation', 'Allocate funds across operational channels', 1, true),
('d2000001-d000-4000-d000-000000000026', 'c2000001-c000-4000-c000-000000000006', 'Liquidity Management', 'Ensure continuous liquidity availability', 2, true),
('d2000001-d000-4000-d000-000000000027', 'c2000001-c000-4000-c000-000000000006', 'Banking Issue Handling', 'Resolve banking failures and account issues', 3, true),
('d2000001-d000-4000-d000-000000000028', 'c2000001-c000-4000-c000-000000000006', 'Payment Flow Monitoring', 'Monitor payment flows and settlement processes', 4, true),
('d2000001-d000-4000-d000-000000000029', 'c2000001-c000-4000-c000-000000000006', 'Wrong Payment Recovery', 'Recover wrongly credited or debited payments', 5, true),

-- Cat 7: Legal, Enforcement & External Compliance
('d2000001-d000-4000-d000-000000000030', 'c2000001-c000-4000-c000-000000000007', 'Police / Legal Notice Handling', 'Receive and respond to police and legal notices', 1, true),
('d2000001-d000-4000-d000-000000000031', 'c2000001-c000-4000-c000-000000000007', 'Regulatory Communication', 'Handle regulatory and departmental communications', 2, true),
('d2000001-d000-4000-d000-000000000032', 'c2000001-c000-4000-c000-000000000007', 'Legal Representation', 'Represent company in legal proceedings', 3, true),
('d2000001-d000-4000-d000-000000000033', 'c2000001-c000-4000-c000-000000000007', 'External Compliance Fulfillment', 'Meet external compliance requirements across platforms', 4, true),

-- Cat 8: Technology, ERP & Platform
('d2000001-d000-4000-d000-000000000034', 'c2000001-c000-4000-c000-000000000008', 'Tech Stack & Architecture', 'Design and manage core technology stack', 1, true),
('d2000001-d000-4000-d000-000000000035', 'c2000001-c000-4000-c000-000000000008', 'ERP Development', 'Develop and maintain ERP systems', 2, true),
('d2000001-d000-4000-d000-000000000036', 'c2000001-c000-4000-c000-000000000008', 'Platform Onboarding', 'Onboard new trading platforms and integrations', 3, true),
('d2000001-d000-4000-d000-000000000037', 'c2000001-c000-4000-c000-000000000008', 'Workflow Automation', 'Automate operational workflows and processes', 4, true),
('d2000001-d000-4000-d000-000000000038', 'c2000001-c000-4000-c000-000000000008', 'Data Analytics & Research', 'Lead data analytics and market research', 5, true),

-- Cat 9: HR & Organizational Control
('d2000001-d000-4000-d000-000000000039', 'c2000001-c000-4000-c000-000000000009', 'Hiring Strategy', 'Define staffing requirements and hiring plans', 1, true),
('d2000001-d000-4000-d000-000000000040', 'c2000001-c000-4000-c000-000000000009', 'Performance Management', 'Monitor and manage employee performance', 2, true),
('d2000001-d000-4000-d000-000000000041', 'c2000001-c000-4000-c000-000000000009', 'PIP / Disciplinary Action', 'Implement performance improvement and disciplinary actions', 3, true),
('d2000001-d000-4000-d000-000000000042', 'c2000001-c000-4000-c000-000000000009', 'Training & SOP Enforcement', 'Enforce training programs and standard procedures', 4, true),

-- Cat 10: Strategic & Organizational Decisions
('d2000001-d000-4000-d000-000000000043', 'c2000001-c000-4000-c000-000000000010', 'Business Strategy', 'Define and execute overall business strategy', 1, true),
('d2000001-d000-4000-d000-000000000044', 'c2000001-c000-4000-c000-000000000010', 'Expansion Decisions', 'Evaluate and decide on business expansion', 2, true),
('d2000001-d000-4000-d000-000000000045', 'c2000001-c000-4000-c000-000000000010', 'High-Value Risk Decisions', 'Make decisions on high-value risk exposure', 3, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RACI ASSIGNMENTS (all 6 roles per task)
-- Role IDs: MD-A=04, MD-S=05, GM=02, OM=01, ICO=03, ECO=06
-- ============================================================

INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
-- Cat 1: Ads, Sales & Purchase Operations
-- Sales Strategy: MD-A=A, MD-S=C, GM=I, OM=R, ICO=I, ECO=I
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable for sell-side strategy'),
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted on sell-side impact'),
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM executes sales strategy'),
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Purchase Strategy: MD-A=C, MD-S=A, GM=I, OM=R, ICO=I, ECO=I
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000004', 'C', 'MD-A consulted on purchase impact'),
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable for buy-side strategy'),
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM executes purchase strategy'),
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Ad Creation: MD-A=A, MD-S=C, GM=I, OM=R, ICO=I, ECO=I
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible for ad creation'),
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Ad Monitoring: MD-A=A, MD-S=C, GM=I, OM=R, ICO=I, ECO=I
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Liquidity Alignment: MD-A=A, MD-S=C, GM=R, OM=I, ICO=I, ECO=I
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable for liquidity'),
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible for fund execution'),
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 2: Order Lifecycle Execution
-- Order Processing: I,I,I,A/R,I,I (OM is both A and R)
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible for order processing'),
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000006', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Payment Verification: I,I,C,A/R,C,I
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000007', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Coin Release: I,I,C,A/R,C,I
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000008', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Queue Monitoring: I,I,I,A/R,I,I
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000009', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Delay Intervention: I,I,C,A/R,I,I
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 3: Compliance, KYC & Risk
-- KYC Approval: A,I,C,I,R,I
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible for KYC'),
('d2000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- User Onboarding: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible for onboarding execution'),
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible for onboarding compliance'),
('d2000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- User Offboarding: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Risk Flagging: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000014', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Re-KYC: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000015', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Internal Policy: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000016', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 4: Fraud, Suspicious Activity & Freezes
-- Fraud Detection: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000017', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Account Freeze: C,I,A,R,C,I
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000004', 'C', 'MD-A consulted'),
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable for freeze decisions'),
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000018', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Suspicious Transaction: A,I,C,R,R,I
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO responsible'),
('d2000001-d000-4000-d000-000000000019', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- High-Risk Escalation: I,I,A,R,C,C
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable'),
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000006', 'C', 'ECO consulted'),

-- Cat 5: Appeals & Dispute Management
-- Appeal Handling: I,I,C,A/R,C,I (OM=A)
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Appeal Escalation: I,I,A,R,C,I
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable'),
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Appeal Resolution: I,I,C,A/R,C,I
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000001', 'A', 'OM accountable and responsible'),
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000023', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Appeal Reduction: A,I,C,R,C,I
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000024', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 6: Finance, Banking & Fund Flow
-- Fund Allocation: A,C,R,I,I,I
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible'),
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000025', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Liquidity Management: A,C,R,I,I,I
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible'),
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000026', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Banking Issue: I,I,A,I,I,R
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable'),
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000027', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO responsible'),

-- Payment Flow Monitoring: I,I,A,R,I,I
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable'),
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000028', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Wrong Payment Recovery: I,I,A,I,I,R
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000002', 'A', 'GM accountable'),
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000029', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO responsible'),

-- Cat 7: Legal, Enforcement & External Compliance
-- Police Notice: I,I,C,I,I,A (ECO=A/R, using A)
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000006', 'A', 'ECO accountable and responsible'),

-- Regulatory Communication: I,I,C,I,I,A
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000006', 'A', 'ECO accountable and responsible'),

-- Legal Representation: I,I,C,I,I,A
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000006', 'A', 'ECO accountable and responsible'),

-- External Compliance: A,I,C,I,C,R
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000006', 'R', 'ECO responsible'),

-- Cat 8: Technology, ERP & Platform
-- Tech Stack: I,A,I,I,I,I
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- ERP Development: I,A,I,I,C,I
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000035', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Platform Onboarding: C,A,I,I,C,I
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000004', 'C', 'MD-A consulted'),
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000036', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Workflow Automation: I,A,I,R,C,I
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000004', 'I', 'MD-A informed'),
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000037', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Data Analytics: C,A,I,I,I,I
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000004', 'C', 'MD-A consulted'),
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed'),
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000038', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 9: HR & Organizational Control
-- Hiring Strategy: A,C,R,I,I,I
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible'),
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000039', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Performance Management: A,I,R,R,I,I
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible'),
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- PIP / Disciplinary: A,I,R,R,I,I
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM responsible'),
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Training & SOP: A,I,C,R,C,I
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-S informed'),
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM responsible'),
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Cat 10: Strategic & Organizational Decisions
-- Business Strategy: A,A,C,I,I,I
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- Expansion Decisions: A,A,C,I,I,I
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-S accountable'),
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000003', 'I', 'ICO informed'),
('d2000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000006', 'I', 'ECO informed'),

-- High-Value Risk: A,C,C,I,C,C
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-A accountable'),
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-S consulted'),
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted'),
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed'),
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000003', 'C', 'ICO consulted'),
('d2000001-d000-4000-d000-000000000045', 'a1000001-a000-4000-a000-000000000006', 'C', 'ECO consulted')

ON CONFLICT DO NOTHING;
