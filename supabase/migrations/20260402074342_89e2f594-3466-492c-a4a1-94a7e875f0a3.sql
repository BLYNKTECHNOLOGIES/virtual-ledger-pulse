
-- Fix MD-Abhishek name and description
UPDATE raci_roles SET 
  name = 'Managing Director – Abhishek Singh',
  description = 'Ultimate executive authority over finance, compliance, sales-side operations, and HR governance. Ensures full financial discipline, liquidity stability, strict compliance adherence, taxation alignment, and high-efficiency sales operations with maximized revenue throughput.'
WHERE id = 'a1000001-a000-4000-a000-000000000004';

-- Update MD-Shubham description
UPDATE raci_roles SET 
  description = 'Primary authority for purchase-side operations, platform infrastructure, technology ecosystem, and data intelligence. Controls buy-side P2P operations, asset acquisition strategies, ERP systems, workflow automation, and technology partnerships ensuring scalable, secure, and performance-driven systems.'
WHERE id = 'a1000001-a000-4000-a000-000000000005';

-- Update ECO description
UPDATE raci_roles SET 
  description = 'Authorized external representative managing all legal, regulatory, banking, and enforcement-related matters. Single-point interface between the Company and external authorities including law enforcement, banks, and regulatory bodies. Acts under Power of Attorney for legal proceedings and dispute resolution.'
WHERE id = 'a1000001-a000-4000-a000-000000000006';

-- Update GM description (more detailed)
UPDATE raci_roles SET 
  description = 'Central command authority responsible for integrated control over operations, finance, compliance, risk, and stakeholder management. Exercises final decision-making authority across all functional domains. Controls fund allocation, liquidity management, banking relationships, and organizational escalation handling.'
WHERE id = 'a1000001-a000-4000-a000-000000000002';

-- Update OM description (more detailed)
UPDATE raci_roles SET 
  description = 'End-to-end orchestration, control, and governance of all P2P trading operations. Responsible for operational seamlessness, latency optimization, commercial efficiency with maximized sales throughput and spread integrity, full compliance adherence, and audit-compliant traceability across the entire order lifecycle.'
WHERE id = 'a1000001-a000-4000-a000-000000000001';

-- Update ICO description (more detailed)
UPDATE raci_roles SET 
  description = 'End-to-end enforcement of internal compliance frameworks ensuring all users, transactions, communications, and platform activities are fully compliant with internal policies. First line of defense against regulatory, financial, and reputational risk through KYC governance, risk flagging, and internal policy enforcement.'
WHERE id = 'a1000001-a000-4000-a000-000000000003';
