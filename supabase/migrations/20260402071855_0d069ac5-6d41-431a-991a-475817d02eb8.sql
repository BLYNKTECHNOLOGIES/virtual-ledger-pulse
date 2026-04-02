
-- Role
INSERT INTO raci_roles (id, name, description, department, display_order, is_active, color)
VALUES ('a1000001-a000-4000-a000-000000000005', 'Managing Director – Shubham Singh', 'MD – Purchase Operations, Technology, Platform & Data Governance Authority', 'Executive', 5, true, '#0ea5e9')
ON CONFLICT (id) DO NOTHING;

-- Categories
INSERT INTO raci_categories (id, name, description, icon, display_order, is_active) VALUES
('c1000001-c000-4000-c000-000000000020', 'Purchase Operations', 'Buy-side P2P operations and asset acquisition', 'ShoppingCart', 20, true),
('c1000001-c000-4000-c000-000000000021', 'Platform Onboarding & Integration', 'New platform onboarding, payment integrations, external systems', 'Plug', 21, true),
('c1000001-c000-4000-c000-000000000022', 'Technology Development & Architecture', 'Core tech stack, backend architecture, system scalability', 'Code', 22, true),
('c1000001-c000-4000-c000-000000000023', 'ERP & Workflow Management', 'ERP systems, dashboards, workflow automation', 'Settings', 23, true),
('c1000001-c000-4000-c000-000000000024', 'Data Analytics & Research', 'Data collection, analytical modeling, market research', 'BarChart3', 24, true),
('c1000001-c000-4000-c000-000000000025', 'Technology Partnerships & Vendors', 'Vendor management, integration partners, contracts', 'Handshake', 25, true),
('c1000001-c000-4000-c000-000000000026', 'System Optimization & Automation', 'Workflow improvements, automation, error reduction', 'Zap', 26, true)
ON CONFLICT (id) DO NOTHING;

-- Tasks
INSERT INTO raci_tasks (id, category_id, name, description, display_order, is_active) VALUES
('d1000001-d000-4000-d000-000000000060', 'c1000001-c000-4000-c000-000000000020', 'Buy-Side P2P Operations Control', 'Full control over buy-side P2P trading operations', 1, true),
('d1000001-d000-4000-d000-000000000061', 'c1000001-c000-4000-c000-000000000020', 'Asset Acquisition Strategy', 'Competitive purchase pricing and inventory availability', 2, true),
('d1000001-d000-4000-d000-000000000062', 'c1000001-c000-4000-c000-000000000020', 'Liquidity Alignment for Procurement', 'Coordinate purchase liquidity with MD-Abhishek', 3, true),
('d1000001-d000-4000-d000-000000000063', 'c1000001-c000-4000-c000-000000000020', 'Procurement Team Supervision', 'Supervise execution teams handling buy-side', 4, true),
('d1000001-d000-4000-d000-000000000064', 'c1000001-c000-4000-c000-000000000021', 'New Trading Platform Onboarding', 'Lead onboarding of new trading platforms', 1, true),
('d1000001-d000-4000-d000-000000000065', 'c1000001-c000-4000-c000-000000000021', 'Payment Integration Management', 'Onboard and manage payment integrations', 2, true),
('d1000001-d000-4000-d000-000000000066', 'c1000001-c000-4000-c000-000000000021', 'Platform Diversification Strategy', 'Maintain multi-platform diversification', 3, true),
('d1000001-d000-4000-d000-000000000067', 'c1000001-c000-4000-c000-000000000022', 'Core Technology Stack Design', 'Design and oversee core technology stack', 1, true),
('d1000001-d000-4000-d000-000000000068', 'c1000001-c000-4000-c000-000000000022', 'Backend Architecture Oversight', 'Backend architecture design and scalability', 2, true),
('d1000001-d000-4000-d000-000000000069', 'c1000001-c000-4000-c000-000000000022', 'Platform Stability & Performance', 'Ensure platform stability and minimal downtime', 3, true),
('d1000001-d000-4000-d000-000000000070', 'c1000001-c000-4000-c000-000000000023', 'ERP System Development', 'Develop and manage ERP systems', 1, true),
('d1000001-d000-4000-d000-000000000071', 'c1000001-c000-4000-c000-000000000023', 'Internal Dashboard Management', 'Build and maintain internal dashboards', 2, true),
('d1000001-d000-4000-d000-000000000072', 'c1000001-c000-4000-c000-000000000023', 'Workflow Automation Implementation', 'Standardize processes and reduce manual dependency', 3, true),
('d1000001-d000-4000-d000-000000000073', 'c1000001-c000-4000-c000-000000000024', 'Data Collection Frameworks', 'Lead data collection and analytical modeling', 1, true),
('d1000001-d000-4000-d000-000000000074', 'c1000001-c000-4000-c000-000000000024', 'Market Research & Pricing Analysis', 'Conduct market research and pricing trend analysis', 2, true),
('d1000001-d000-4000-d000-000000000075', 'c1000001-c000-4000-c000-000000000024', 'Data-Driven Strategic Insights', 'Provide data-backed recommendations for decisions', 3, true),
('d1000001-d000-4000-d000-000000000076', 'c1000001-c000-4000-c000-000000000025', 'Technology Vendor Selection', 'Identify and manage technology vendors', 1, true),
('d1000001-d000-4000-d000-000000000077', 'c1000001-c000-4000-c000-000000000025', 'Integration Partner Management', 'Manage integration partners and contracts', 2, true),
('d1000001-d000-4000-d000-000000000078', 'c1000001-c000-4000-c000-000000000025', 'Vendor Cost & Performance Review', 'Ensure cost efficiency and performance reliability', 3, true),
('d1000001-d000-4000-d000-000000000079', 'c1000001-c000-4000-c000-000000000026', 'Operational Workflow Optimization', 'Continuously improve operational workflows', 1, true),
('d1000001-d000-4000-d000-000000000080', 'c1000001-c000-4000-c000-000000000026', 'Automation Tool Implementation', 'Implement tools to reduce human error', 2, true),
('d1000001-d000-4000-d000-000000000081', 'c1000001-c000-4000-c000-000000000026', 'Strategic Decision Support', 'Provide technical feasibility inputs for org decisions', 3, true)
ON CONFLICT (id) DO NOTHING;

-- RACI Assignments
INSERT INTO raci_assignments (task_id, role_id, assignment_type, notes) VALUES
('d1000001-d000-4000-d000-000000000060', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: ultimate authority on buy-side ops'),
('d1000001-d000-4000-d000-000000000060', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM executes buy-side operations'),
('d1000001-d000-4000-d000-000000000061', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: acquisition strategy owner'),
('d1000001-d000-4000-d000-000000000062', 'a1000001-a000-4000-a000-000000000005', 'R', 'MD-Shubham coordinates liquidity for procurement'),
('d1000001-d000-4000-d000-000000000062', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for overall liquidity'),
('d1000001-d000-4000-d000-000000000062', 'a1000001-a000-4000-a000-000000000002', 'C', 'GM consulted on fund availability'),
('d1000001-d000-4000-d000-000000000063', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham supervises procurement teams'),
('d1000001-d000-4000-d000-000000000063', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM manages day-to-day procurement execution'),
('d1000001-d000-4000-d000-000000000064', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham leads platform onboarding'),
('d1000001-d000-4000-d000-000000000065', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham owns payment integrations'),
('d1000001-d000-4000-d000-000000000065', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed of payment integration changes'),
('d1000001-d000-4000-d000-000000000066', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham drives platform diversification'),
('d1000001-d000-4000-d000-000000000067', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: core tech stack authority'),
('d1000001-d000-4000-d000-000000000068', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: backend architecture owner'),
('d1000001-d000-4000-d000-000000000069', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: platform stability authority'),
('d1000001-d000-4000-d000-000000000069', 'a1000001-a000-4000-a000-000000000001', 'I', 'OM informed of platform stability status'),
('d1000001-d000-4000-d000-000000000070', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: ERP system owner'),
('d1000001-d000-4000-d000-000000000071', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: dashboard management authority'),
('d1000001-d000-4000-d000-000000000072', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: workflow automation authority'),
('d1000001-d000-4000-d000-000000000072', 'a1000001-a000-4000-a000-000000000001', 'C', 'OM consulted on workflow changes'),
('d1000001-d000-4000-d000-000000000073', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: data framework owner'),
('d1000001-d000-4000-d000-000000000074', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: market research authority'),
('d1000001-d000-4000-d000-000000000075', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: strategic data insights owner'),
('d1000001-d000-4000-d000-000000000075', 'a1000001-a000-4000-a000-000000000004', 'C', 'MD-Abhishek consulted on strategic decisions'),
('d1000001-d000-4000-d000-000000000075', 'a1000001-a000-4000-a000-000000000002', 'I', 'GM informed of data insights'),
('d1000001-d000-4000-d000-000000000076', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: vendor selection authority'),
('d1000001-d000-4000-d000-000000000077', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: integration partner management'),
('d1000001-d000-4000-d000-000000000078', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: vendor performance review'),
('d1000001-d000-4000-d000-000000000079', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: workflow optimization authority'),
('d1000001-d000-4000-d000-000000000079', 'a1000001-a000-4000-a000-000000000001', 'R', 'OM implements workflow changes'),
('d1000001-d000-4000-d000-000000000080', 'a1000001-a000-4000-a000-000000000005', 'A', 'MD-Shubham: automation tool owner'),
('d1000001-d000-4000-d000-000000000081', 'a1000001-a000-4000-a000-000000000005', 'R', 'MD-Shubham provides technical feasibility inputs'),
('d1000001-d000-4000-d000-000000000081', 'a1000001-a000-4000-a000-000000000004', 'A', 'MD-Abhishek accountable for final strategic decisions'),
('d1000001-d000-4000-d000-000000000001', 'a1000001-a000-4000-a000-000000000005', 'I', 'MD-Shubham informed of sell-side ad management'),
('d1000001-d000-4000-d000-000000000050', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-Shubham consulted on pricing strategy'),
('d1000001-d000-4000-d000-000000000051', 'a1000001-a000-4000-a000-000000000005', 'C', 'MD-Shubham consulted on spread thresholds')
ON CONFLICT DO NOTHING;

-- KRAs (using e-prefix pattern)
INSERT INTO role_kras (id, role_id, title, description, weightage, display_order, is_active) VALUES
('e1000001-e000-4000-e000-000000000014', 'a1000001-a000-4000-a000-000000000005', 'Purchase Operations Efficiency', 'Cost-optimized, scalable buy-side operations with continuous inventory', 25, 1, true),
('e1000001-e000-4000-e000-000000000015', 'a1000001-a000-4000-a000-000000000005', 'Technology & Platform Excellence', 'Robust, secure, high-performance technology infrastructure', 30, 2, true),
('e1000001-e000-4000-e000-000000000016', 'a1000001-a000-4000-a000-000000000005', 'Data Intelligence & Analytics', 'Accurate data-driven insights enhancing strategic decisions', 20, 3, true),
('e1000001-e000-4000-e000-000000000017', 'a1000001-a000-4000-a000-000000000005', 'System Optimization & Automation', 'Reduced manual dependency, improved workflow efficiency', 25, 4, true)
ON CONFLICT (id) DO NOTHING;

-- KPIs (using f1-prefix pattern)
INSERT INTO role_kpis (id, kra_id, role_id, metric, target, measurement_method, frequency, display_order, is_active) VALUES
('f1000001-f000-4000-f000-000000000037', 'e1000001-e000-4000-e000-000000000014', 'a1000001-a000-4000-a000-000000000005', 'Purchase Cost Efficiency', 'Competitive vs market benchmark', 'Avg purchase price vs market rate', 'Daily', 1, true),
('f1000001-f000-4000-f000-000000000038', 'e1000001-e000-4000-e000-000000000014', 'a1000001-a000-4000-a000-000000000005', 'Inventory Availability', '99%+ uptime', 'Asset availability during trading hours', 'Daily', 2, true),
('f1000001-f000-4000-f000-000000000039', 'e1000001-e000-4000-e000-000000000014', 'a1000001-a000-4000-a000-000000000005', 'Spread Support Contribution', 'Positive spread maintenance', 'Buy-sell spread analysis', 'Weekly', 3, true),
('f1000001-f000-4000-f000-000000000040', 'e1000001-e000-4000-e000-000000000015', 'a1000001-a000-4000-a000-000000000005', 'System Uptime', '≥ 99.5%', 'Platform uptime monitoring', 'Monthly', 1, true),
('f1000001-f000-4000-f000-000000000041', 'e1000001-e000-4000-e000-000000000015', 'a1000001-a000-4000-a000-000000000005', 'Performance Efficiency', 'Page load < 3s, API < 500ms', 'Performance monitoring tools', 'Monthly', 2, true),
('f1000001-f000-4000-f000-000000000042', 'e1000001-e000-4000-e000-000000000015', 'a1000001-a000-4000-a000-000000000005', 'Automation Coverage', '≥ 70% of repeatable workflows', 'Automated vs manual process ratio', 'Quarterly', 3, true),
('f1000001-f000-4000-f000-000000000043', 'e1000001-e000-4000-e000-000000000016', 'a1000001-a000-4000-a000-000000000005', 'Insight Accuracy Rate', '≥ 90%', 'Decision outcomes vs predictions', 'Quarterly', 1, true),
('f1000001-f000-4000-f000-000000000044', 'e1000001-e000-4000-e000-000000000016', 'a1000001-a000-4000-a000-000000000005', 'Forecasting Efficiency', 'Within 10% variance', 'Forecast vs actual comparison', 'Monthly', 2, true),
('f1000001-f000-4000-f000-000000000045', 'e1000001-e000-4000-e000-000000000017', 'a1000001-a000-4000-a000-000000000005', 'Workflow Efficiency Improvement', '≥ 20% YoY improvement', 'Process time reduction metrics', 'Quarterly', 1, true),
('f1000001-f000-4000-f000-000000000046', 'e1000001-e000-4000-e000-000000000017', 'a1000001-a000-4000-a000-000000000005', 'Manual Error Reduction', '≥ 50% reduction', 'Error logs before vs after automation', 'Quarterly', 2, true),
('f1000001-f000-4000-f000-000000000047', 'e1000001-e000-4000-e000-000000000017', 'a1000001-a000-4000-a000-000000000005', 'System Adoption Rate', '≥ 90% across teams', 'Active usage vs total users', 'Monthly', 3, true)
ON CONFLICT (id) DO NOTHING;
