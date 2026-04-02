
-- Role
INSERT INTO public.raci_roles (id, name, description, department, display_order, color)
VALUES ('a1000001-a000-4000-a000-000000000001', 'Operations Manager', 'End-to-end orchestration, control, and governance of all P2P trading operations. Ensures operational seamlessness, commercial efficiency, compliance adherence, and audit-compliant traceability.', 'Operations', 1, '#4F46E5')
ON CONFLICT DO NOTHING;

-- Categories
INSERT INTO public.raci_categories (id, name, icon, display_order) VALUES
  ('c1000001-c000-4000-c000-000000000001', 'Ad Governance & Market Positioning', '📊', 1),
  ('c1000001-c000-4000-c000-000000000002', 'Order Lifecycle Governance', '🔄', 2),
  ('c1000001-c000-4000-c000-000000000003', 'Appeals Management', '⚖️', 3),
  ('c1000001-c000-4000-c000-000000000004', 'Compliance & Risk Mitigation', '🛡️', 4),
  ('c1000001-c000-4000-c000-000000000005', 'Team Governance & Discipline', '👥', 5),
  ('c1000001-c000-4000-c000-000000000006', 'Pricing & Profitability Control', '💰', 6),
  ('c1000001-c000-4000-c000-000000000007', 'Platform Operations & Client Management', '🌐', 7),
  ('c1000001-c000-4000-c000-000000000008', 'Payment Flow Oversight', '💳', 8),
  ('c1000001-c000-4000-c000-000000000009', 'Escalation Framework', '🚨', 9)
ON CONFLICT DO NOTHING;

-- Tasks: Ad Governance
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000001', 'c1000001-c000-4000-c000-000000000001', 'Create & deploy advertisements', 'Create, deploy, and activate ads across platforms', 1),
  ('d1000001-d000-4000-d000-000000000002', 'c1000001-c000-4000-c000-000000000001', 'Monitor & optimize ad performance', 'Ensure continuous ad visibility, competitiveness, and execution readiness', 2),
  ('d1000001-d000-4000-d000-000000000003', 'c1000001-c000-4000-c000-000000000001', 'Deactivate underperforming ads', 'Remove inactive, mispriced, or strategically misaligned ads', 3),
  ('d1000001-d000-4000-d000-000000000004', 'c1000001-c000-4000-c000-000000000001', 'Dynamic ad optimization', 'Optimize based on market conditions, competitive positioning, and available liquidity', 4),
  ('d1000001-d000-4000-d000-000000000005', 'c1000001-c000-4000-c000-000000000001', 'Ad ranking & conversion validation', 'Continuous checks on ad ranking position, live availability, conversion efficiency', 5)
ON CONFLICT DO NOTHING;

-- Tasks: Order Lifecycle
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000010', 'c1000001-c000-4000-c000-000000000002', 'Supervise payment verification', 'Ensure strict payment confirmation protocols prior to coin release', 1),
  ('d1000001-d000-4000-d000-000000000011', 'c1000001-c000-4000-c000-000000000002', 'Monitor real-time order queues', 'Identify and resolve operational bottlenecks in order processing', 2),
  ('d1000001-d000-4000-d000-000000000012', 'c1000001-c000-4000-c000-000000000002', 'Authorize coin release', 'Zero unauthorized or unverified coin release enforcement', 3),
  ('d1000001-d000-4000-d000-000000000013', 'c1000001-c000-4000-c000-000000000002', 'Maintain order throughput', 'Ensure optimal processing efficiency and SLA adherence', 4)
ON CONFLICT DO NOTHING;

-- Tasks: Appeals
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000020', 'c1000001-c000-4000-c000-000000000003', 'Oversee appeals lifecycle', 'End-to-end management of appeals from initiation to resolution', 1),
  ('d1000001-d000-4000-d000-000000000021', 'c1000001-c000-4000-c000-000000000003', 'Ensure timely appeal resolution', 'Minimize resolution timelines with proper documentation', 2),
  ('d1000001-d000-4000-d000-000000000022', 'c1000001-c000-4000-c000-000000000003', 'Reduce appeal frequency', 'Implement controls to prevent recurring appeal patterns', 3)
ON CONFLICT DO NOTHING;

-- Tasks: Compliance & Risk
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000030', 'c1000001-c000-4000-c000-000000000004', 'Enforce internal compliance frameworks', 'Ensure adherence to internal policies and platform regulatory requirements', 1),
  ('d1000001-d000-4000-d000-000000000031', 'c1000001-c000-4000-c000-000000000004', 'TDS alignment within transaction flow', 'Ensure taxation obligations are met within transaction lifecycle', 2),
  ('d1000001-d000-4000-d000-000000000032', 'c1000001-c000-4000-c000-000000000004', 'Detect third-party payment discrepancies', 'Identify suspicious patterns, fraudulent layering, mule behavior', 3),
  ('d1000001-d000-4000-d000-000000000033', 'c1000001-c000-4000-c000-000000000004', 'Initiate account freezes & Re-KYC', 'Freeze suspicious accounts and trigger re-verification processes', 4),
  ('d1000001-d000-4000-d000-000000000034', 'c1000001-c000-4000-c000-000000000004', 'Prevent non-compliant customer engagement', 'Proactive identification and prevention of engagement with flagged entities', 5)
ON CONFLICT DO NOTHING;

-- Tasks: Team Governance
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000040', 'c1000001-c000-4000-c000-000000000005', 'Supervise operational personnel', 'Supervise P2P Executives, Payment Team, KYC/Compliance Team', 1),
  ('d1000001-d000-4000-d000-000000000041', 'c1000001-c000-4000-c000-000000000005', 'Allocate shifts & workloads', 'Assign shifts, workloads, and priorities based on operational needs', 2),
  ('d1000001-d000-4000-d000-000000000042', 'c1000001-c000-4000-c000-000000000005', 'Conduct daily operational briefings', 'Daily team alignment and communication of priorities', 3),
  ('d1000001-d000-4000-d000-000000000043', 'c1000001-c000-4000-c000-000000000005', 'Monitor team performance metrics', 'Track individual and team-level KPIs', 4),
  ('d1000001-d000-4000-d000-000000000044', 'c1000001-c000-4000-c000-000000000005', 'Initiate PIP for underperformers', 'Place employees on Performance Improvement Plans when necessary', 5)
ON CONFLICT DO NOTHING;

-- Tasks: Pricing
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000050', 'c1000001-c000-4000-c000-000000000006', 'Supervise pricing strategies', 'Oversee rate adjustments and pricing alignment', 1),
  ('d1000001-d000-4000-d000-000000000051', 'c1000001-c000-4000-c000-000000000006', 'Maintain minimum spread thresholds', 'Eliminate loss-making trades and ensure positive margins', 2),
  ('d1000001-d000-4000-d000-000000000052', 'c1000001-c000-4000-c000-000000000006', 'Monitor daily P&L', 'Continuous monitoring of profit/loss and volume-to-margin efficiency', 3)
ON CONFLICT DO NOTHING;

-- Tasks: Platform & Client
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000060', 'c1000001-c000-4000-c000-000000000007', 'Ensure platform functionality', 'Uninterrupted platform operations with compliance checkpoint alignment', 1),
  ('d1000001-d000-4000-d000-000000000061', 'c1000001-c000-4000-c000-000000000007', 'Oversee client onboarding/offboarding', 'Manage operational-level client lifecycle', 2),
  ('d1000001-d000-4000-d000-000000000062', 'c1000001-c000-4000-c000-000000000007', 'Maintain client relationship management', 'Structured engagement at relationship management level', 3)
ON CONFLICT DO NOTHING;

-- Tasks: Payment Flow
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000070', 'c1000001-c000-4000-c000-000000000008', 'Ensure smooth transaction flow', 'Non-custodial oversight of payment channels', 1),
  ('d1000001-d000-4000-d000-000000000071', 'c1000001-c000-4000-c000-000000000008', 'Identify payment disruptions', 'Detect and flag disruptions in payment processing', 2),
  ('d1000001-d000-4000-d000-000000000072', 'c1000001-c000-4000-c000-000000000008', 'Escalate fund issues to GM', 'Mandatory escalation of all fund-related matters', 3)
ON CONFLICT DO NOTHING;

-- Tasks: Escalation
INSERT INTO public.raci_tasks (id, category_id, name, description, display_order) VALUES
  ('d1000001-d000-4000-d000-000000000080', 'c1000001-c000-4000-c000-000000000009', 'Level 1: Self-resolution', 'Resolve operational issues within authority', 1),
  ('d1000001-d000-4000-d000-000000000081', 'c1000001-c000-4000-c000-000000000009', 'Escalate to General Manager (L2)', 'Fund decisions, banking disruptions, high-value fraud', 2),
  ('d1000001-d000-4000-d000-000000000082', 'c1000001-c000-4000-c000-000000000009', 'Escalate to Director/Founder (L3)', 'Regulatory or law enforcement matters', 3)
ON CONFLICT DO NOTHING;

-- RACI Assignments
INSERT INTO public.raci_assignments (task_id, role_id, assignment_type) VALUES
  ('d1000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000002', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000003', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000004', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000005', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000010', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000011', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000012', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000013', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000020', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000021', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000022', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000030', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000031', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000032', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000033', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000034', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000040', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000041', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000042', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000043', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000044', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000050', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000051', 'a1000001-a000-4000-a000-000000000001', 'A'),
  ('d1000001-d000-4000-d000-000000000052', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000060', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000061', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000062', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000070', 'a1000001-a000-4000-a000-000000000001', 'C'),
  ('d1000001-d000-4000-d000-000000000071', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000072', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000080', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000081', 'a1000001-a000-4000-a000-000000000001', 'R'),
  ('d1000001-d000-4000-d000-000000000082', 'a1000001-a000-4000-a000-000000000001', 'C')
ON CONFLICT (task_id, role_id) DO UPDATE SET assignment_type = EXCLUDED.assignment_type;

-- KRAs
INSERT INTO public.role_kras (id, role_id, title, description, weightage, display_order) VALUES
  ('e1000001-e000-4000-e000-000000000001', 'a1000001-a000-4000-a000-000000000001', 'Operational Efficiency', 'Completion rates, order processing times, appeal ratios, ad uptime', 30, 1),
  ('e1000001-e000-4000-e000-000000000002', 'a1000001-a000-4000-a000-000000000001', 'Financial Performance', 'Sales volume achievement, spread integrity, volume-to-profit optimization', 25, 2),
  ('e1000001-e000-4000-e000-000000000003', 'a1000001-a000-4000-a000-000000000001', 'Workforce Productivity', 'Per-employee output, operational efficiency, error rate minimization', 20, 3),
  ('e1000001-e000-4000-e000-000000000004', 'a1000001-a000-4000-a000-000000000001', 'Risk & Compliance', 'Fraud detection, high-risk account reduction, zero unauthorized releases', 25, 4)
ON CONFLICT DO NOTHING;

-- KPIs
INSERT INTO public.role_kpis (role_id, kra_id, metric, target, measurement_method, frequency, display_order) VALUES
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000001', 'Order Completion Rate', '≥ 95%', 'System-tracked completion vs total orders', 'Daily', 1),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000001', 'Order Processing Time', '≤ Defined SLA', 'Average time from payment to coin release', 'Daily', 2),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000001', 'Appeal Ratio', '≤ 2%', 'Appeals raised vs total orders processed', 'Weekly', 3),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000001', 'Ad Uptime & Visibility', '≥ 98%', 'Ad live hours vs operational hours', 'Daily', 4),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000002', 'Sales Volume Achievement', 'Meet/exceed targets', 'Total sales volume vs monthly target', 'Monthly', 1),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000002', 'Spread Integrity', 'Zero negative margin trades', 'Trades with negative spread / total trades', 'Daily', 2),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000002', 'Volume-to-Profit Ratio', 'Continuous improvement', 'Gross profit per unit volume trend', 'Weekly', 3),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000003', 'Per Employee Sales Output', 'Above benchmark', 'Total volume / active operators', 'Monthly', 1),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000003', 'Per Employee Operational Efficiency', 'Above benchmark', 'Orders handled per operator per shift', 'Weekly', 2),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000003', 'Error Rate', '< 0.5%', 'Operational errors / total transactions', 'Monthly', 3),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000004', 'Fraud Detection Effectiveness', 'Continuous improvement', 'Flagged fraudulent accounts vs confirmed fraud', 'Monthly', 1),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000004', 'High-Risk Account Reduction', 'Month-over-month decrease', 'Active high-risk accounts trend', 'Monthly', 2),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000004', 'Unauthorized Release Incidents', 'Zero tolerance', 'Count of unauthorized coin releases', 'Daily', 3),
  ('a1000001-a000-4000-a000-000000000001', 'e1000001-e000-4000-e000-000000000004', 'Compliance Audit Score', '≥ 95%', 'Internal audit compliance checklist', 'Quarterly', 4)
ON CONFLICT DO NOTHING;
