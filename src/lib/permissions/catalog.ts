/**
 * ERP PERMISSION LIBRARY — SINGLE SOURCE OF TRUTH
 * ------------------------------------------------
 * Every ERP permission the app understands is declared here once. The role
 * editor, the sidebar, page gates and the verification script all read this
 * file, so a permission can never again exist in the UI but not in the
 * database enum (`public.app_permission`) — or the reverse.
 *
 * Granularity rule: a module gets a view/manage pair; a separately navigable
 * page or an irreversible action gets its own key. Not every button gets a
 * permission.
 *
 * Terminal has its own permission system (`useTerminalAuth` /
 * `public.terminal_permission`). Its catalog is described in
 * `src/lib/permissions/terminalCatalog.ts` for documentation parity; ERP roles
 * only carry `terminal_view` (standby sign-in) and `terminal_destructive`.
 * `terminal_manage` is deprecated: it is kept in the enum and aliased onto
 * `terminal_view` so legacy roles keep working, but it is no longer offered.
 */

export type PermissionTier = 'view' | 'manage' | 'approve' | 'destructive' | 'special';

export interface PermissionDef {
  /** Enum value in public.app_permission */
  id: string;
  /** Short label shown as the chip in the role matrix */
  name: string;
  description: string;
  tier: PermissionTier;
  /** Routes this permission protects (documentation + verification aid) */
  routes?: string[];
}

export interface PermissionModuleDef {
  label: string;
  /** Optional grouping header used to keep the matrix navigable */
  section?: string;
  permissions: PermissionDef[];
}

export const PERMISSION_MODULES: Record<string, PermissionModuleDef> = {
  dashboard: {
    label: 'Dashboard',
    section: 'Core',
    permissions: [
      { id: 'dashboard_view', name: 'View', description: 'View main dashboard', tier: 'view', routes: ['/dashboard'] },
    ],
  },
  sales: {
    label: 'Sales',
    section: 'Operations',
    permissions: [
      { id: 'sales_view', name: 'View', description: 'View sales orders', tier: 'view', routes: ['/sales'] },
      { id: 'sales_manage', name: 'Manage', description: 'Create and edit sales orders', tier: 'manage' },
    ],
  },
  purchase: {
    label: 'Purchase',
    section: 'Operations',
    permissions: [
      { id: 'purchase_view', name: 'View', description: 'View purchase orders', tier: 'view', routes: ['/purchase'] },
      { id: 'purchase_manage', name: 'Manage', description: 'Create and edit purchase orders', tier: 'manage' },
    ],
  },
  stock: {
    label: 'Stock',
    section: 'Operations',
    permissions: [
      { id: 'stock_view', name: 'View', description: 'View inventory and wallet balances', tier: 'view', routes: ['/stock'] },
      { id: 'stock_manage', name: 'Manage', description: 'Manage inventory and movements', tier: 'manage' },
      { id: 'stock_conversion_create', name: 'Create Conversions', description: 'Create stock/product conversions', tier: 'special' },
      { id: 'stock_conversion_approve', name: 'Approve Conversions', description: 'Approve stock/product conversions', tier: 'approve' },
    ],
  },
  erp_entry: {
    label: 'ERP Entry',
    section: 'Operations',
    permissions: [
      { id: 'erp_entry_view', name: 'View', description: 'View the ERP Entry feed', tier: 'view', routes: ['/erp-entry'] },
      { id: 'erp_entry_manage', name: 'Manage', description: 'Approve, reject and trigger syncs from ERP Entry', tier: 'manage' },
    ],
  },
  terminal: {
    label: 'Terminal',
    section: 'Operations',
    permissions: [
      { id: 'terminal_view', name: 'Terminal Access (Standby)', description: 'Lets the user sign into the Terminal in standby mode — biometric enrolment only, nothing else. Operational rights are granted separately inside Terminal → Users & Roles.', tier: 'view', routes: ['/terminal'] },

    ],
  },
  bams: {
    label: 'BAMS (Banking)',
    section: 'Finance',
    permissions: [
      { id: 'bams_view', name: 'View', description: 'View bank accounts and transactions', tier: 'view', routes: ['/bams'] },
      { id: 'bams_manage', name: 'Manage', description: 'Manage bank accounts and transfers', tier: 'manage' },
      { id: 'bams_journal_entry', name: 'Bank Journal Entry', description: 'Access only the Bank Journal Entries section (expense, income & contra entries)', tier: 'special' },
    ],
  },
  tax_management: {
    label: 'Tax Management',
    section: 'Finance',
    permissions: [
      { id: 'tax_management_view', name: 'View', description: 'View TDS/GST records and tax ledgers', tier: 'view', routes: ['/accounting'] },
      { id: 'tax_management_manage', name: 'Manage', description: 'Create and edit tax records and filings', tier: 'manage' },
    ],
  },
  profit_loss: {
    label: 'P&L',
    section: 'Finance',
    permissions: [
      { id: 'profit_loss_view', name: 'View', description: 'View the Profit & Loss statement', tier: 'view', routes: ['/profit-loss'] },
    ],
  },
  financials: {
    label: 'Financials',
    section: 'Finance',
    permissions: [
      { id: 'financials_view', name: 'View', description: 'View balance sheets and financial reports', tier: 'view', routes: ['/financials'] },
      { id: 'financials_manage', name: 'Manage', description: 'Generate/adjust financial statements and account classification', tier: 'manage' },
    ],
  },
  statistics: {
    label: 'Statistics & Analytics',
    section: 'Finance',
    permissions: [
      { id: 'statistics_view', name: 'View', description: 'View business statistics and analytics', tier: 'view', routes: ['/statistics'] },
      { id: 'statistics_manage', name: 'Manage', description: 'Configure statistics and export analytics', tier: 'manage' },
    ],
  },
  accounting_legacy: {
    label: 'Accounting (legacy umbrella — no page of its own)',
    section: 'Finance',
    permissions: [
      { id: 'accounting_view', name: 'View (umbrella)', description: 'Opens no tab itself — silently unlocks Tax Management, P&L and Financials view. Legacy; prefer the specific keys.', tier: 'view' },
      { id: 'accounting_manage', name: 'Manage (umbrella)', description: 'Opens no tab itself — silently unlocks Tax Management and Financials manage. Legacy; prefer the specific keys.', tier: 'manage' },
    ],
  },

  reconciliation: {
    label: 'Reconciliation',
    section: 'Finance',
    permissions: [
      { id: 'reconciliation_view', name: 'View', description: 'Open the shift reconciliation cockpit', tier: 'view', routes: ['/reconciliation'] },
      { id: 'shift_reconciliation_create', name: 'Create', description: 'Submit shift reconciliation records', tier: 'special' },
      { id: 'shift_reconciliation_approve', name: 'Approve', description: 'Approve or reject shift reconciliation (maker-checker)', tier: 'approve' },
    ],
  },
  clients: {
    label: 'Clients',
    section: 'Relationships',
    permissions: [
      { id: 'clients_view', name: 'View', description: 'View clients and KYC status', tier: 'view', routes: ['/clients'] },
      { id: 'clients_manage', name: 'Manage', description: 'Create and edit clients', tier: 'manage' },
      { id: 'ra_assign', name: 'Assign RA', description: 'Assign clients to Relationship Associates', tier: 'special' },
      { id: 'ra_dashboard_view', name: 'RA Dashboard', description: 'Access own Relationship Associate dashboard', tier: 'special', routes: ['/ra-dashboard'] },
      { id: 'video_kyc_view', name: 'Video KYC View', description: 'View video KYC sessions', tier: 'view' },
      { id: 'video_kyc_manage', name: 'Video KYC Manage', description: 'Conduct and record video KYC', tier: 'manage' },
      { id: 'kyc_approvals_view', name: 'KYC Approvals View', description: 'View pending KYC/onboarding approvals', tier: 'view' },
      { id: 'kyc_approvals_manage', name: 'KYC Approvals Manage', description: 'Approve or reject client onboarding', tier: 'approve' },
    ],
  },
  leads: {
    label: 'Leads',
    section: 'Relationships',
    permissions: [
      { id: 'leads_view', name: 'View', description: 'View leads', tier: 'view', routes: ['/leads'] },
      { id: 'leads_manage', name: 'Manage', description: 'Create and edit leads', tier: 'manage' },
    ],
  },
  support: {
    label: 'Support',
    section: 'Relationships',
    permissions: [
      { id: 'support_view', name: 'View', description: 'View customer support tickets', tier: 'view' },
      { id: 'support_manage', name: 'Manage', description: 'Respond to and close support tickets', tier: 'manage' },
    ],
  },
  compliance: {
    label: 'Compliance',
    section: 'Governance',
    permissions: [
      { id: 'compliance_view', name: 'View', description: 'View compliance cases and documents', tier: 'view', routes: ['/compliance'] },
      { id: 'compliance_manage', name: 'Manage', description: 'Create and edit compliance cases', tier: 'manage' },
      { id: 'compliance_approve', name: 'Approve', description: 'Approve/reject investigations (cannot approve own submissions)', tier: 'approve' },
    ],
  },
  risk_management: {
    label: 'Risk Management',
    section: 'Governance',
    permissions: [
      { id: 'risk_management_view', name: 'View', description: 'View risk alerts and exposure', tier: 'view', routes: ['/risk-management'] },
      { id: 'risk_management_manage', name: 'Manage', description: 'Act on risk alerts and thresholds', tier: 'manage' },
    ],
  },
  user_management: {
    label: 'User Management',
    section: 'Administration',
    permissions: [
      { id: 'user_management_view', name: 'View', description: 'View users and roles', tier: 'view', routes: ['/user-management'] },
      { id: 'user_management_manage', name: 'Manage', description: 'Manage users, roles and permissions', tier: 'manage' },
      { id: 'user_management_hr_manage', name: 'HR Manage', description: 'HR: edit user details & delete non-admins. No role/terminal/approval control', tier: 'manage' },
    ],
  },
  report_formats: {
    label: 'Report Formats',
    section: 'Administration',
    permissions: [
      { id: 'report_formats_manage', name: 'Manage', description: 'Configure bank/report import formats', tier: 'manage', routes: ['/settings/report-formats'] },
    ],
  },
  hrms: {
    label: 'HRMS',
    section: 'People',
    permissions: [
      { id: 'hrms_view', name: 'View', description: 'Open HRMS (read-only across every HR area)', tier: 'view', routes: ['/hrms'] },
      { id: 'hrms_manage', name: 'Manage', description: 'Full HR control — employees, attendance, leave, payroll, recruitment, documents, assets, performance, mailbox, data health', tier: 'manage' },
      { id: 'hrms_razorpay_sync', name: 'RazorpayX Sync', description: 'Push/pull payroll data to RazorpayX', tier: 'special' },
      { id: 'payroll_view', name: 'ERP Payroll View', description: 'View payroll data inside the ERP profile surfaces', tier: 'view' },
      { id: 'payroll_manage', name: 'ERP Payroll Manage', description: 'Manage payroll data from ERP profile surfaces', tier: 'manage' },
    ],
  },

  tasks: {
    label: 'Tasks',
    section: 'Workplace',
    permissions: [
      { id: 'tasks_view', name: 'View', description: 'View tasks assigned to or spectated by the user', tier: 'view', routes: ['/tasks'] },
      { id: 'tasks_manage', name: 'Manage', description: 'Create, assign and close tasks', tier: 'manage' },
    ],
  },
  utility: {
    label: 'Utility',
    section: 'Workplace',
    permissions: [
      { id: 'utility_view', name: 'View', description: 'Open the utility hub and its tools', tier: 'view', routes: ['/utility'] },
      { id: 'utility_manage', name: 'Manage', description: 'Manage utility tool configuration', tier: 'manage' },
    ],
  },
  help_assistant: {
    label: 'AI Help Assistant',
    section: 'Workplace',
    permissions: [
      { id: 'help_assistant_view', name: 'View', description: 'Use the AI help assistant', tier: 'view', routes: ['/help-assistant'] },
      { id: 'help_assistant_manage', name: 'Manage', description: 'Administer assistant knowledge and settings', tier: 'manage', routes: ['/help-assistant/admin'] },
    ],
  },
  ems: {
    label: 'EMS (legacy — inert, no surface in the app)',
    section: 'Workplace',
    permissions: [
      { id: 'ems_view', name: 'View (inert)', description: 'Legacy key from the old EMS module. No route, page or control reads it — granting or revoking it changes nothing today. Kept only so old roles keep validating.', tier: 'view' },
      { id: 'ems_manage', name: 'Manage (inert)', description: 'Legacy key from the old EMS module. No route, page or control reads it — granting or revoking it changes nothing today. Kept only so old roles keep validating.', tier: 'manage' },
    ],
  },

  destructive: {
    label: 'Destructive Actions',
    section: 'Danger Zone',
    permissions: [
      { id: 'erp_destructive', name: 'ERP', description: 'Delete/reject ERP records', tier: 'destructive' },
      { id: 'terminal_destructive', name: 'Terminal', description: 'Delete terminal data', tier: 'destructive' },
      { id: 'bams_destructive', name: 'BAMS', description: 'Delete/close bank accounts', tier: 'destructive' },
      { id: 'clients_destructive', name: 'Clients', description: 'Delete/reject clients', tier: 'destructive' },
      { id: 'stock_destructive', name: 'Stock', description: 'Delete stock data', tier: 'destructive' },
    ],
  },
};

/** Order in which sections render in the role matrix. */
export const PERMISSION_SECTION_ORDER = [
  'Core',
  'Operations',
  'Finance',
  'Relationships',
  'Governance',
  'People',
  'Workplace',
  'Administration',
  'Danger Zone',
] as const;

/** Every permission key the app understands (must all exist in the DB enum). */
export const ALL_PERMISSION_KEYS: string[] = Array.from(
  new Set(Object.values(PERMISSION_MODULES).flatMap((m) => m.permissions.map((p) => p.id)))
);

export const PERMISSION_BY_ID: Record<string, PermissionDef & { module: string }> = Object.fromEntries(
  Object.entries(PERMISSION_MODULES).flatMap(([moduleKey, mod]) =>
    mod.permissions.map((p) => [p.id, { ...p, module: moduleKey }])
  )
);

/**
 * Deprecated enum values kept in `public.app_permission` (Postgres cannot drop
 * enum values). They are normalized to their modern key on read and never
 * offered in the UI.
 */
export const LEGACY_PERMISSION_MAP: Record<string, string> = {
  view_dashboard: 'dashboard_view',
  view_sales: 'sales_view',
  view_purchase: 'purchase_view',
  view_bams: 'bams_view',
  view_clients: 'clients_view',
  view_leads: 'leads_view',
  view_user_management: 'user_management_view',
  view_hrms: 'hrms_view',
  view_payroll: 'payroll_view',
  view_compliance: 'compliance_view',
  view_stock: 'stock_view',
  view_stock_management: 'stock_view',
  view_inventory: 'stock_view',
  view_accounting: 'accounting_view',
  view_banking: 'bams_view',
  view_statistics: 'statistics_view',
  view_ems: 'ems_view',
  VIEW_REPORTS: 'statistics_view',
  manage_sales: 'sales_manage',
  MANAGE_SALES: 'sales_manage',
  manage_purchase: 'purchase_manage',
  MANAGE_PURCHASE: 'purchase_manage',
  manage_stock: 'stock_manage',
  MANAGE_STOCK: 'stock_manage',
  manage_inventory: 'stock_manage',
  manage_clients: 'clients_manage',
  MANAGE_CLIENTS: 'clients_manage',
  manage_leads: 'leads_manage',
  MANAGE_LEADS: 'leads_manage',
  manage_hrms: 'hrms_manage',
  MANAGE_HRMS: 'hrms_manage',
  manage_payroll: 'payroll_manage',
  MANAGE_PAYROLL: 'payroll_manage',
  manage_accounting: 'accounting_manage',
  MANAGE_ACCOUNTING: 'accounting_manage',
  manage_banking: 'bams_manage',
  manage_compliance: 'compliance_manage',
  MANAGE_COMPLIANCE: 'compliance_manage',
  manage_users: 'user_management_manage',
  CREATE_USERS: 'user_management_manage',
  READ_USERS: 'user_management_view',
  UPDATE_USERS: 'user_management_manage',
  DELETE_USERS: 'user_management_manage',
  manage_roles: 'user_management_manage',
  MANAGE_ROLES: 'user_management_manage',
  MANAGE_SYSTEM: 'user_management_manage',
};

export const normalizePermission = (perm: string): string => LEGACY_PERMISSION_MAP[perm] || perm;

export const normalizePermissions = (perms: string[]): string[] =>
  Array.from(new Set((perms || []).map(normalizePermission)));

/**
 * Umbrella grants: holding the key on the left implies every key on the right.
 * This is what keeps existing roles whole after the Finance split and the HRMS
 * sub-module breakdown — nobody loses access on deploy.
 */
export const PERMISSION_ALIASES: Record<string, string[]> = {
  accounting_view: ['tax_management_view', 'profit_loss_view', 'financials_view'],
  accounting_manage: ['tax_management_view', 'tax_management_manage', 'profit_loss_view', 'financials_view', 'financials_manage'],
  bams_manage: ['bams_view', 'bams_journal_entry'],
  clients_view: ['kyc_approvals_view', 'video_kyc_view'],
  clients_manage: ['clients_view', 'kyc_approvals_manage', 'video_kyc_manage'],
  kyc_approvals_manage: ['kyc_approvals_view'],
  video_kyc_manage: ['video_kyc_view'],
  // HRMS is intentionally NOT sub-divided: a single HR owner manages everything.
  hrms_view: ['payroll_view'],
  hrms_manage: ['hrms_view', 'hrms_razorpay_sync', 'payroll_view', 'payroll_manage'],
  // Backward compatibility: legacy sub-module grants still stored on roles keep
  // working by mapping straight onto the umbrella keys.
  hrms_employees_view: ['hrms_view'],
  hrms_attendance_view: ['hrms_view'],
  hrms_leave_view: ['hrms_view'],
  hrms_payroll_view: ['hrms_view'],
  hrms_recruitment_view: ['hrms_view'],
  hrms_documents_view: ['hrms_view'],
  hrms_assets_view: ['hrms_view'],
  hrms_pms_view: ['hrms_view'],
  hrms_mailbox_view: ['hrms_view'],
  hrms_data_health_view: ['hrms_view'],
  hrms_employees_manage: ['hrms_manage'],
  hrms_attendance_manage: ['hrms_manage'],
  hrms_attendance_approve: ['hrms_manage'],
  hrms_leave_manage: ['hrms_manage'],
  hrms_leave_approve: ['hrms_manage'],
  hrms_payroll_manage: ['hrms_manage'],
  hrms_recruitment_manage: ['hrms_manage'],
  hrms_documents_manage: ['hrms_manage'],
  hrms_assets_manage: ['hrms_manage'],
  hrms_pms_manage: ['hrms_manage'],
  hrms_mailbox_manage: ['hrms_manage'],

  // Managing implies viewing.
  sales_manage: ['sales_view'],
  purchase_manage: ['purchase_view'],
  stock_manage: ['stock_view'],
  leads_manage: ['leads_view'],
  compliance_manage: ['compliance_view'],
  risk_management_manage: ['risk_management_view'],
  tax_management_manage: ['tax_management_view'],
  financials_manage: ['financials_view'],
  statistics_manage: ['statistics_view'],
  support_manage: ['support_view'],
  tasks_manage: ['tasks_view'],
  utility_manage: ['utility_view'],
  user_management_manage: ['user_management_view'],
  erp_entry_manage: ['erp_entry_view'],
  // Deprecated ERP grant — legacy roles holding it get standby sign-in only.
  terminal_manage: ['terminal_view'],
  shift_reconciliation_create: ['reconciliation_view'],
  shift_reconciliation_approve: ['reconciliation_view'],
};

/**
 * Expands stored role permissions into the effective permission set: legacy
 * keys are normalized, then umbrella/implied grants are resolved transitively.
 */
export function expandPermissions(perms: string[]): string[] {
  const out = new Set<string>(normalizePermissions(perms));
  const queue = [...out];
  while (queue.length) {
    const key = queue.shift() as string;
    for (const implied of PERMISSION_ALIASES[key] || []) {
      if (!out.has(implied)) {
        out.add(implied);
        queue.push(implied);
      }
    }
  }
  return Array.from(out);
}

/** Full grant used for Super Admin / admin fallback. */
export const ADMIN_PERMISSIONS: string[] = expandPermissions(ALL_PERMISSION_KEYS);

function keysByTier(tiers: PermissionTier[]): string[] {
  return Object.values(PERMISSION_MODULES)
    .flatMap((m) => m.permissions)
    .filter((p) => tiers.includes(p.tier))
    .map((p) => p.id);
}

export interface RoleTemplate {
  name: string;
  description: string;
  getPermissions: () => string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: 'Read-Only Auditor',
    description: 'Every view permission, no manage, approve or destructive rights',
    getPermissions: () => keysByTier(['view']).filter((k) => k !== 'accounting_view'),
  },
  {
    name: 'Full Operations',
    description: 'All view, manage, approve and special rights — no destructive',
    getPermissions: () => keysByTier(['view', 'manage', 'approve', 'special']).filter((k) => !k.startsWith('accounting_')),
  },
  {
    name: 'Finance',
    description: 'Banking, tax, P&L, financials and statistics — view and manage',
    getPermissions: () =>
      expandPermissions([
        'dashboard_view',
        'bams_view',
        'bams_manage',
        'bams_journal_entry',
        'tax_management_view',
        'tax_management_manage',
        'profit_loss_view',
        'financials_view',
        'financials_manage',
        'statistics_view',
        'reconciliation_view',
      ]),
  },
  {
    name: 'Finance View-Only',
    description: 'Read-only access to banking, tax, P&L, financials and statistics',
    getPermissions: () => [
      'dashboard_view',
      'bams_view',
      'tax_management_view',
      'profit_loss_view',
      'financials_view',
      'statistics_view',
    ],
  },
  {
    name: 'HR Manager',
    description: 'Full HRMS across every sub-module, plus user HR management',
    getPermissions: () => expandPermissions(['dashboard_view', 'hrms_view', 'hrms_manage', 'hrms_razorpay_sync', 'user_management_hr_manage']),
  },
  {
    name: 'Compliance Officer',
    description: 'Compliance and risk with approval rights, client and banking read access',
    getPermissions: () =>
      expandPermissions(['dashboard_view', 'compliance_view', 'compliance_manage', 'compliance_approve', 'risk_management_view', 'clients_view', 'bams_view']),
  },
  {
    name: 'Operations',
    description: 'Sales, purchase, stock, clients, ERP Entry and Terminal — view and manage',
    getPermissions: () =>
      expandPermissions([
        'dashboard_view',
        'sales_manage',
        'purchase_manage',
        'stock_manage',
        'clients_manage',
        'erp_entry_manage',
        'terminal_view',
        'tasks_manage',
      ]),
  },
];
