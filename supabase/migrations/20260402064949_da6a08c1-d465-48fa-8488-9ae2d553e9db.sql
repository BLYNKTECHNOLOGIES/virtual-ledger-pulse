
-- MD Role
INSERT INTO raci_roles (id, name, description, department, display_order, is_active, color)
VALUES ('a1000001-a000-4000-a000-000000000004', 'Managing Director', 'Enterprise Governance, Finance, Compliance & Sales Control Authority – Abhishek Singh Tomar. Ultimate executive authority over finance, compliance, and sales-side operations.', 'Executive', 4, true, '#dc2626');

-- New categories for MD
INSERT INTO raci_categories (id, name, description, icon, display_order, is_active) VALUES
('c1000001-c000-4000-c000-000000000021', 'Financial Governance & CFO Functions', 'Fund flow architecture, liquidity, expenses, profitability, and banking coordination', 'DollarSign', 21, true),
('c1000001-c000-4000-c000-000000000022', 'Taxation & Regulatory Structuring', 'TDS implementation, tax compliance, and financial structuring for regulatory efficiency', 'FileText', 22, true),
('c1000001-c000-4000-c000-000000000023', 'Expense, Cost & Infrastructure Governance', 'Company-wide expenses, cost allocation, office infrastructure and rent compliance', 'Building', 23, true),
('c1000001-c000-4000-c000-000000000024', 'Operational & Structural Architecture', 'Operational workflows, reporting hierarchies, and governance frameworks', 'Network', 24, true);

-- Tasks under Financial Governance (c...021)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000001', 'c1000001-c000-4000-c000-000000000021', 'Fund flow architecture design & control', 'Design and control end-to-end fund flow across operational channels', 1, true),
('f2000001-f000-4000-f000-000000000002', 'c1000001-c000-4000-c000-000000000021', 'Liquidity availability assurance', 'Ensure continuous liquidity availability across all channels', 2, true),
('f2000001-f000-4000-f000-000000000003', 'c1000001-c000-4000-c000-000000000021', 'Company expense oversight', 'Oversee and control all company-wide expenses', 3, true),
('f2000001-f000-4000-f000-000000000004', 'c1000001-c000-4000-c000-000000000021', 'Profitability metrics supervision', 'Monitor and optimize profitability metrics and cost efficiency', 4, true),
('f2000001-f000-4000-f000-000000000005', 'c1000001-c000-4000-c000-000000000021', 'Banking coordination oversight', 'Supervise banking coordination via GM', 5, true);

-- Tasks under Taxation (c...022)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000006', 'c1000001-c000-4000-c000-000000000022', 'Taxation model definition', 'Define company taxation model and TDS implementation', 1, true),
('f2000001-f000-4000-f000-000000000007', 'c1000001-c000-4000-c000-000000000022', 'TDS integration in transaction lifecycle', 'Embed TDS into operational transaction flow', 2, true),
('f2000001-f000-4000-f000-000000000008', 'c1000001-c000-4000-c000-000000000022', 'Financial regulatory structuring', 'Structure finances for regulatory efficiency and compliance', 3, true);

-- Tasks under Expense & Infrastructure (c...023)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000009', 'c1000001-c000-4000-c000-000000000023', 'Cost allocation strategy', 'Define and control cost allocation across departments', 1, true),
('f2000001-f000-4000-f000-000000000010', 'c1000001-c000-4000-c000-000000000023', 'Office infrastructure & rent compliance', 'Ensure office infrastructure meets compliance standards', 2, true),
('f2000001-f000-4000-f000-000000000011', 'c1000001-c000-4000-c000-000000000023', 'Expenditure justification & control', 'All expenditures must be justified and aligned with financial strategy', 3, true);

-- Tasks under Operational Architecture (c...024)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000012', 'c1000001-c000-4000-c000-000000000024', 'Operational workflow definition', 'Define operational workflows and process architecture', 1, true),
('f2000001-f000-4000-f000-000000000013', 'c1000001-c000-4000-c000-000000000024', 'Reporting hierarchy design', 'Design and maintain reporting hierarchies', 2, true),
('f2000001-f000-4000-f000-000000000014', 'c1000001-c000-4000-c000-000000000024', 'Governance framework alignment', 'Ensure alignment between Finance, Compliance, and Operations', 3, true);

-- Tasks in existing categories for MD
-- Sales Operations (under Pricing & Profitability c...006)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000015', 'c1000001-c000-4000-c000-000000000006', 'Sales volume growth oversight', 'Supervise and drive sales volume growth targets', 10, true),
('f2000001-f000-4000-f000-000000000016', 'c1000001-c000-4000-c000-000000000006', 'Profit maximization strategy', 'Define and control profit maximization strategies', 11, true);

-- HR Governance (under Workforce Authority c...015)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000017', 'c1000001-c000-4000-c000-000000000015', 'Organizational hierarchy design', 'Design and control organizational hierarchy and workforce structure', 10, true),
('f2000001-f000-4000-f000-000000000018', 'c1000001-c000-4000-c000-000000000015', 'Hiring & role definition approval', 'Approve hiring requirements and role definitions', 11, true),
('f2000001-f000-4000-f000-000000000019', 'c1000001-c000-4000-c000-000000000015', 'Performance framework approval', 'Approve performance frameworks and efficiency standards', 12, true);

-- Compliance oversight (under Compliance c...004)
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('f2000001-f000-4000-f000-000000000020', 'c1000001-c000-4000-c000-000000000004', 'Enterprise compliance ownership', 'End-to-end compliance ownership across all departments', 12, true),
('f2000001-f000-4000-f000-000000000021', 'c1000001-c000-4000-c000-000000000004', 'Zero tolerance compliance enforcement', 'Zero tolerance for non-compliant activities across organization', 13, true);

-- MD RACI Assignments on own tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
-- Financial Governance
('f2000001-f000-4000-f000-000000000001', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD ultimate financial authority'),
('f2000001-f000-4000-f000-000000000002', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000003', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000004', 'a1000001-a000-4000-a000-000000000004', 'R', NULL),
('f2000001-f000-4000-f000-000000000005', 'a1000001-a000-4000-a000-000000000004', 'A', 'Via GM'),
-- Taxation
('f2000001-f000-4000-f000-000000000006', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000007', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000008', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
-- Expense & Infrastructure
('f2000001-f000-4000-f000-000000000009', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000010', 'a1000001-a000-4000-a000-000000000004', 'R', NULL),
('f2000001-f000-4000-f000-000000000011', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
-- Operational Architecture
('f2000001-f000-4000-f000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
-- Sales
('f2000001-f000-4000-f000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD sales authority'),
('f2000001-f000-4000-f000-000000000016', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
-- HR
('f2000001-f000-4000-f000-000000000017', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000018', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
('f2000001-f000-4000-f000-000000000019', 'a1000001-a000-4000-a000-000000000004', 'A', NULL),
-- Compliance
('f2000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000004', 'A', 'Ultimate compliance owner'),
('f2000001-f000-4000-f000-000000000021', 'a1000001-a000-4000-a000-000000000004', 'A', NULL);

-- GM cross-role on MD tasks (GM executes under MD authority)
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f2000001-f000-4000-f000-000000000001', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM executes fund flow'),
('f2000001-f000-4000-f000-000000000002', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM manages liquidity'),
('f2000001-f000-4000-f000-000000000003', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM oversees expenses'),
('f2000001-f000-4000-f000-000000000005', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM banking coordination'),
('f2000001-f000-4000-f000-000000000007', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on TDS'),
('f2000001-f000-4000-f000-000000000009', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM executes cost allocation'),
('f2000001-f000-4000-f000-000000000014', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM maintains governance'),
('f2000001-f000-4000-f000-000000000017', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on hierarchy'),
('f2000001-f000-4000-f000-000000000018', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on hiring'),
('f2000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM executes compliance'),
('f2000001-f000-4000-f000-000000000021', 'a1000001-a000-4000-a000-000000000002', 'R', 'GM enforces zero tolerance');

-- OM cross-role on MD tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f2000001-f000-4000-f000-000000000015', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM executes sales operations'),
('f2000001-f000-4000-f000-000000000016', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM executes profit strategy'),
('f2000001-f000-4000-f000-000000000012', 'a1000001-a000-4000-a000-000000000001', 'C', 'OM consulted on workflows');

-- ICO cross-role on MD tasks
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('f2000001-f000-4000-f000-000000000020', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO executes compliance'),
('f2000001-f000-4000-f000-000000000021', 'a1000001-a000-4000-a000-000000000003', 'R', 'ICO enforces zero tolerance');

-- MD on existing escalation tasks (Level 2 authority)
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD is Director/Founder escalation level');

-- KRAs
INSERT INTO role_kras (id, role_id, title, description, weightage, display_order, is_active) VALUES
('b1000001-b000-4000-b000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'Financial Governance', 'Net profit margin, liquidity stability, cost efficiency, and fund flow control', 30, 1, true),
('b1000001-b000-4000-b000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'Sales & Revenue Performance', 'Revenue growth, volume throughput, spread maintenance, and profit maximization', 25, 2, true),
('b1000001-b000-4000-b000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'Compliance & Regulatory Control', 'Zero compliance breach tolerance, audit readiness, policy adherence across organization', 25, 3, true),
('b1000001-b000-4000-b000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'Organizational Efficiency', 'Employee productivity, operational efficiency, cost-to-output ratio, HR governance', 20, 4, true);

-- KPIs
INSERT INTO role_kpis (id, kra_id, role_id, metric, target, measurement_method, frequency, display_order, is_active) VALUES
('e1000001-e000-4000-e000-000000000035', 'b1000001-b000-4000-b000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'Net Profit Margin', 'Continuous growth', 'Net profit / Revenue', 'Monthly', 1, true),
('e1000001-e000-4000-e000-000000000036', 'b1000001-b000-4000-b000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'Liquidity Stability Index', 'Zero fund shortages', 'Days without liquidity issues', 'Weekly', 2, true),
('e1000001-e000-4000-e000-000000000037', 'b1000001-b000-4000-b000-000000000012', 'a1000001-a000-4000-a000-000000000004', 'Cost Efficiency Ratio', 'Continuous improvement', 'Operating costs / Revenue', 'Monthly', 3, true),
('e1000001-e000-4000-e000-000000000038', 'b1000001-b000-4000-b000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'Revenue Growth', 'MoM increase', 'Monthly revenue comparison', 'Monthly', 4, true),
('e1000001-e000-4000-e000-000000000039', 'b1000001-b000-4000-b000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'Volume Throughput', 'Target achievement', 'Total trading volume', 'Daily', 5, true),
('e1000001-e000-4000-e000-000000000040', 'b1000001-b000-4000-b000-000000000013', 'a1000001-a000-4000-a000-000000000004', 'Spread Maintenance', 'No negative margin trades', 'Trades with positive spread / Total trades', 'Daily', 6, true),
('e1000001-e000-4000-e000-000000000041', 'b1000001-b000-4000-b000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'Compliance Breach Count', 'Zero', 'Number of compliance breaches', 'Monthly', 7, true),
('e1000001-e000-4000-e000-000000000042', 'b1000001-b000-4000-b000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'Audit Readiness Score', '100%', 'Audit checklist completion', 'Quarterly', 8, true),
('e1000001-e000-4000-e000-000000000043', 'b1000001-b000-4000-b000-000000000014', 'a1000001-a000-4000-a000-000000000004', 'Policy Adherence Rate', '100%', 'Compliant actions / Total actions', 'Monthly', 9, true),
('e1000001-e000-4000-e000-000000000044', 'b1000001-b000-4000-b000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'Employee Productivity', 'Continuous improvement', 'Output per employee', 'Monthly', 10, true),
('e1000001-e000-4000-e000-000000000045', 'b1000001-b000-4000-b000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'Operational Efficiency', 'Target achievement', 'Process completion rate within SLA', 'Weekly', 11, true),
('e1000001-e000-4000-e000-000000000046', 'b1000001-b000-4000-b000-000000000015', 'a1000001-a000-4000-a000-000000000004', 'Cost-to-Output Ratio', 'Continuous optimization', 'Total cost / Total output value', 'Monthly', 12, true);
