// Terminal permission catalog — shared source of truth for Terminal auth, role editor and verification.
// ERP roles still use public.app_permission only for the coarse terminal_view/manage entry.

export type TerminalPermission =
  // Dashboard
  | 'terminal_dashboard_view'
  | 'terminal_dashboard_export'
  // Orders
  | 'terminal_orders_view'
  | 'terminal_orders_manage'
  | 'terminal_orders_actions'
  | 'terminal_orders_sync_approve'
  | 'terminal_orders_escalate'
  | 'terminal_orders_resolve_escalation'
  | 'terminal_orders_chat'
  | 'terminal_orders_export'
  // Ads
  | 'terminal_ads_view'
  | 'terminal_ads_manage'
  | 'terminal_ads_toggle'
  | 'terminal_ads_rest_timer'
  // Payer
  | 'terminal_payer_view'
  | 'terminal_payer_manage'
  // Appeals
  | 'terminal_appeals_view'
  | 'terminal_appeals_manage'
  | 'terminal_appeals_request'
  | 'terminal_appeals_toggle'
  // Small Payments Manager
  | 'terminal_small_payments_view'
  | 'terminal_small_payments_manage'
  | 'terminal_small_payments_assign'
  // Pricing
  | 'terminal_pricing_view'
  | 'terminal_pricing_manage'
  | 'terminal_pricing_toggle'
  | 'terminal_pricing_delete'
  // Autopay
  | 'terminal_autopay_view'
  | 'terminal_autopay_toggle'
  | 'terminal_autopay_configure'
  // Autoreply
  | 'terminal_autoreply_view'
  | 'terminal_autoreply_manage'
  | 'terminal_autoreply_toggle'
  // Users & Team
  | 'terminal_users_view'
  | 'terminal_users_manage'
  | 'terminal_users_role_assign'
  | 'terminal_users_bypass_code'
  | 'terminal_users_manage_subordinates'
  | 'terminal_users_manage_all'
  // Shift & Handover
  | 'terminal_shift_view'
  | 'terminal_shift_manage'
  | 'terminal_shift_reconciliation'
  // Analytics & MPI
  | 'terminal_analytics_view'
  | 'terminal_analytics_export'
  | 'terminal_mpi_view'
  | 'terminal_mpi_view_own'
  | 'terminal_mpi_view_all'
  // Assets
  | 'terminal_assets_view'
  | 'terminal_assets_manage'
  // KYC
  | 'terminal_kyc_view'
  | 'terminal_kyc_manage'
  // Settings & Broadcasts
  | 'terminal_settings_view'
  | 'terminal_settings_manage'
  | 'terminal_broadcasts_create'
  | 'terminal_broadcasts_manage'
  // Audit & Logs
  | 'terminal_audit_logs_view'
  | 'terminal_activity_logs_view'
  | 'terminal_pricing_logs_view'
  | 'terminal_logs_view'
  // Automation
  | 'terminal_automation_view'
  | 'terminal_automation_manage'
  // Destructive
  | 'terminal_destructive';

export type TerminalPermissionTier = 'view' | 'manage' | 'action' | 'destructive' | 'special';

export interface TerminalPermissionDef {
  key: TerminalPermission;
  label: string;
  tier: TerminalPermissionTier;
  /** If set, toggling this ON also auto-enables these prerequisites */
  requires?: TerminalPermission[];
}

export interface TerminalPermissionModuleDef {
  key: string;
  label: string;
  icon: string;
  permissions: TerminalPermissionDef[];
}

export const TERMINAL_PERMISSION_MODULES: TerminalPermissionModuleDef[] = [
  {
    key: 'dashboard', label: 'Dashboard', icon: '📊',
    permissions: [
      { key: 'terminal_dashboard_view', label: 'View', tier: 'view' },
      { key: 'terminal_dashboard_export', label: 'Export', tier: 'action', requires: ['terminal_dashboard_view'] },
    ],
  },
  {
    key: 'orders', label: 'Orders', icon: '📦',
    permissions: [
      { key: 'terminal_orders_view', label: 'View', tier: 'view' },
      { key: 'terminal_orders_manage', label: 'Manage (Assign)', tier: 'manage', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_actions', label: 'Actions (Pay/Release)', tier: 'action', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_chat', label: 'Chat', tier: 'action', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_escalate', label: 'Escalate', tier: 'action', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_resolve_escalation', label: 'Resolve Escalation', tier: 'manage', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_sync_approve', label: 'Sync Approve', tier: 'special', requires: ['terminal_orders_view'] },
      { key: 'terminal_orders_export', label: 'Export', tier: 'action', requires: ['terminal_orders_view'] },
    ],
  },
  {
    key: 'ads', label: 'Ads', icon: '📢',
    permissions: [
      { key: 'terminal_ads_view', label: 'View', tier: 'view' },
      { key: 'terminal_ads_manage', label: 'Manage', tier: 'manage', requires: ['terminal_ads_view'] },
      { key: 'terminal_ads_toggle', label: 'Toggle On/Off', tier: 'action', requires: ['terminal_ads_view'] },
      { key: 'terminal_ads_rest_timer', label: 'Rest Timer', tier: 'action', requires: ['terminal_ads_view'] },
    ],
  },
  {
    key: 'payer', label: 'Payer', icon: '💰',
    permissions: [
      { key: 'terminal_payer_view', label: 'View Queue', tier: 'view' },
      { key: 'terminal_payer_manage', label: 'Manage (Lock/Pay/Release)', tier: 'manage', requires: ['terminal_payer_view'] },
    ],
  },
  {
    key: 'small_payments', label: 'Small Payments', icon: '🧾',
    permissions: [
      { key: 'terminal_small_payments_view', label: 'View Cases', tier: 'view' },
      { key: 'terminal_small_payments_manage', label: 'Manage Cases', tier: 'manage', requires: ['terminal_small_payments_view'] },
      { key: 'terminal_small_payments_assign', label: 'Assign Managers', tier: 'special', requires: ['terminal_small_payments_view', 'terminal_small_payments_manage'] },
    ],
  },
  {
    key: 'appeals', label: 'Appeals', icon: '⚖️',
    permissions: [
      { key: 'terminal_appeals_view', label: 'View All Appeals', tier: 'view' },
      { key: 'terminal_appeals_manage', label: 'Manage Appeals', tier: 'manage', requires: ['terminal_appeals_view'] },
      { key: 'terminal_appeals_request', label: 'Request Appeal', tier: 'action' },
      { key: 'terminal_appeals_toggle', label: 'Toggle Module (Super Admin)', tier: 'special', requires: ['terminal_appeals_view'] },
    ],
  },
  {
    key: 'pricing', label: 'Pricing Rules', icon: '💹',
    permissions: [
      { key: 'terminal_pricing_view', label: 'View', tier: 'view' },
      { key: 'terminal_pricing_manage', label: 'Create & Edit', tier: 'manage', requires: ['terminal_pricing_view'] },
      { key: 'terminal_pricing_toggle', label: 'Toggle', tier: 'action', requires: ['terminal_pricing_view'] },
      { key: 'terminal_pricing_delete', label: 'Delete', tier: 'destructive', requires: ['terminal_pricing_view'] },
    ],
  },
  {
    key: 'automation', label: 'Automation', icon: '🤖',
    permissions: [
      { key: 'terminal_automation_view', label: 'View', tier: 'view' },
      { key: 'terminal_automation_manage', label: 'Manage', tier: 'manage', requires: ['terminal_automation_view'] },
    ],
  },
  {
    key: 'autopay', label: 'Autopay', icon: '🤖',
    permissions: [
      { key: 'terminal_autopay_view', label: 'View', tier: 'view' },
      { key: 'terminal_autopay_toggle', label: 'Toggle', tier: 'action', requires: ['terminal_autopay_view'] },
      { key: 'terminal_autopay_configure', label: 'Configure', tier: 'manage', requires: ['terminal_autopay_view'] },
    ],
  },
  {
    key: 'autoreply', label: 'Auto-Reply', icon: '💬',
    permissions: [
      { key: 'terminal_autoreply_view', label: 'View', tier: 'view' },
      { key: 'terminal_autoreply_manage', label: 'Manage Templates', tier: 'manage', requires: ['terminal_autoreply_view'] },
      { key: 'terminal_autoreply_toggle', label: 'Toggle', tier: 'action', requires: ['terminal_autoreply_view'] },
    ],
  },
  {
    key: 'assets', label: 'Assets', icon: '🏦',
    permissions: [
      { key: 'terminal_assets_view', label: 'View', tier: 'view' },
      { key: 'terminal_assets_manage', label: 'Manage & Spot Trade', tier: 'manage', requires: ['terminal_assets_view'] },
    ],
  },
  {
    key: 'analytics', label: 'Analytics & MPI', icon: '📈',
    permissions: [
      { key: 'terminal_analytics_view', label: 'View Analytics', tier: 'view' },
      { key: 'terminal_analytics_export', label: 'Export Analytics', tier: 'action', requires: ['terminal_analytics_view'] },
      { key: 'terminal_mpi_view_own', label: 'MPI (Own)', tier: 'view' },
      { key: 'terminal_mpi_view_all', label: 'MPI (All Users)', tier: 'manage' },
    ],
  },
  {
    key: 'shift', label: 'Shift & Handover', icon: '🔄',
    permissions: [
      { key: 'terminal_shift_view', label: 'View', tier: 'view' },
      { key: 'terminal_shift_manage', label: 'Initiate & Respond', tier: 'manage', requires: ['terminal_shift_view'] },
      { key: 'terminal_shift_reconciliation', label: 'Reconciliation', tier: 'special', requires: ['terminal_shift_view'] },
    ],
  },
  {
    key: 'kyc', label: 'KYC', icon: '🪪',
    permissions: [
      { key: 'terminal_kyc_view', label: 'View', tier: 'view' },
      { key: 'terminal_kyc_manage', label: 'Manage Approvals', tier: 'manage', requires: ['terminal_kyc_view'] },
    ],
  },
  {
    key: 'users', label: 'Users & Team', icon: '👥',
    permissions: [
      { key: 'terminal_users_view', label: 'View Users', tier: 'view' },
      { key: 'terminal_users_manage', label: 'Manage Users', tier: 'manage', requires: ['terminal_users_view'] },
      { key: 'terminal_users_manage_subordinates', label: 'Manage Subordinates', tier: 'manage', requires: ['terminal_users_view'] },
      { key: 'terminal_users_manage_all', label: 'Manage All Users', tier: 'special', requires: ['terminal_users_view', 'terminal_users_manage'] },
      { key: 'terminal_users_role_assign', label: 'Assign Roles', tier: 'special', requires: ['terminal_users_view', 'terminal_users_manage'] },
      { key: 'terminal_users_bypass_code', label: 'Bypass Code', tier: 'special', requires: ['terminal_users_view'] },
    ],
  },
  {
    key: 'settings', label: 'Settings & Broadcasts', icon: '⚙️',
    permissions: [
      { key: 'terminal_settings_view', label: 'View Settings', tier: 'view' },
      { key: 'terminal_settings_manage', label: 'Manage Settings', tier: 'manage', requires: ['terminal_settings_view'] },
      { key: 'terminal_broadcasts_create', label: 'Create Broadcasts', tier: 'action' },
      { key: 'terminal_broadcasts_manage', label: 'Manage Broadcasts', tier: 'manage' },
    ],
  },
  {
    key: 'logs', label: 'Audit & Logs', icon: '📋',
    permissions: [
      { key: 'terminal_audit_logs_view', label: 'Audit Logs', tier: 'view' },
      { key: 'terminal_activity_logs_view', label: 'Activity Logs', tier: 'view' },
      { key: 'terminal_pricing_logs_view', label: 'Pricing Logs', tier: 'view' },
      { key: 'terminal_logs_view', label: 'System Logs', tier: 'view' },
    ],
  },
  {
    key: 'destructive', label: 'Destructive', icon: '⚠️',
    permissions: [
      { key: 'terminal_destructive', label: 'Delete Operations', tier: 'destructive' },
    ],
  },
];

export const TERMINAL_TIER_STYLES: Record<TerminalPermissionTier, string> = {
  view: 'bg-success/15 text-success border-success/30',
  manage: 'bg-info/15 text-info border-info/30',
  action: 'bg-info/15 text-info border-info/30',
  special: 'bg-warning/15 text-warning border-warning/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
};

export const TERMINAL_TIER_SWITCH_STYLES: Record<TerminalPermissionTier, string> = {
  view: 'data-[state=checked]:bg-success',
  manage: 'data-[state=checked]:bg-info',
  action: 'data-[state=checked]:bg-info',
  special: 'data-[state=checked]:bg-warning',
  destructive: 'data-[state=checked]:bg-destructive',
};

// ─── Terminal role template presets ──────────────────────────────────────────
export const TERMINAL_ROLE_TEMPLATES: Record<string, { label: string; permissions: TerminalPermission[] }> = {
  operator: {
    label: 'Operator',
    permissions: [
      'terminal_dashboard_view', 'terminal_orders_view', 'terminal_orders_actions',
      'terminal_orders_chat', 'terminal_orders_escalate', 'terminal_ads_view',
      'terminal_payer_view', 'terminal_shift_view', 'terminal_mpi_view_own',
      'terminal_analytics_view', 'terminal_assets_view', 'terminal_autoreply_view',
      'terminal_autopay_view', 'terminal_pricing_view',
    ],
  },
  team_lead: {
    label: 'Team Lead',
    permissions: [
      'terminal_dashboard_view', 'terminal_dashboard_export',
      'terminal_orders_view', 'terminal_orders_manage', 'terminal_orders_actions',
      'terminal_orders_chat', 'terminal_orders_escalate', 'terminal_orders_export',
      'terminal_ads_view', 'terminal_ads_toggle',
      'terminal_payer_view', 'terminal_payer_manage',
      'terminal_pricing_view', 'terminal_pricing_toggle',
      'terminal_autopay_view', 'terminal_autopay_toggle',
      'terminal_autoreply_view', 'terminal_autoreply_toggle',
      'terminal_shift_view', 'terminal_shift_manage',
      'terminal_mpi_view_own', 'terminal_mpi_view_all',
      'terminal_analytics_view', 'terminal_assets_view',
      'terminal_users_view', 'terminal_users_manage_subordinates',
    ],
  },
  payer: {
    label: 'Payer',
    permissions: [
      'terminal_dashboard_view', 'terminal_orders_view', 'terminal_orders_actions',
      'terminal_orders_chat', 'terminal_payer_view', 'terminal_payer_manage',
      'terminal_shift_view', 'terminal_mpi_view_own',
      'terminal_assets_view', 'terminal_autopay_view',
    ],
  },
  small_payments_manager: {
    label: 'Small Payments Manager',
    permissions: [
      'terminal_dashboard_view', 'terminal_orders_view', 'terminal_orders_chat',
      'terminal_payer_view', 'terminal_small_payments_view', 'terminal_small_payments_manage',
      'terminal_appeals_request',
      'terminal_shift_view', 'terminal_mpi_view_own', 'terminal_assets_view',
    ],
  },
  asst_manager: {
    label: 'Asst Manager',
    permissions: [
      'terminal_dashboard_view', 'terminal_dashboard_export',
      'terminal_orders_view', 'terminal_orders_manage', 'terminal_orders_actions',
      'terminal_orders_chat', 'terminal_orders_escalate', 'terminal_orders_resolve_escalation',
      'terminal_orders_export',
      'terminal_ads_view', 'terminal_ads_manage', 'terminal_ads_toggle',
      'terminal_payer_view', 'terminal_payer_manage',
      'terminal_small_payments_view', 'terminal_small_payments_manage', 'terminal_small_payments_assign',
      'terminal_appeals_view', 'terminal_appeals_manage', 'terminal_appeals_request',
      'terminal_pricing_view', 'terminal_pricing_manage', 'terminal_pricing_toggle',
      'terminal_autopay_view', 'terminal_autopay_toggle', 'terminal_autopay_configure',
      'terminal_autoreply_view', 'terminal_autoreply_manage', 'terminal_autoreply_toggle',
      'terminal_shift_view', 'terminal_shift_manage',
      'terminal_mpi_view_own', 'terminal_mpi_view_all',
      'terminal_analytics_view', 'terminal_analytics_export',
      'terminal_assets_view',
      'terminal_users_view', 'terminal_users_manage', 'terminal_users_manage_subordinates',
      'terminal_activity_logs_view',
    ],
  },
  ops_manager: {
    label: 'Ops Manager',
    permissions: [
      'terminal_dashboard_view', 'terminal_dashboard_export',
      'terminal_orders_view', 'terminal_orders_manage', 'terminal_orders_actions',
      'terminal_orders_chat', 'terminal_orders_escalate', 'terminal_orders_resolve_escalation',
      'terminal_orders_sync_approve', 'terminal_orders_export',
      'terminal_ads_view', 'terminal_ads_manage', 'terminal_ads_toggle', 'terminal_ads_rest_timer',
      'terminal_payer_view', 'terminal_payer_manage',
      'terminal_small_payments_view', 'terminal_small_payments_manage', 'terminal_small_payments_assign',
      'terminal_appeals_view', 'terminal_appeals_manage', 'terminal_appeals_request',
      'terminal_pricing_view', 'terminal_pricing_manage', 'terminal_pricing_toggle', 'terminal_pricing_delete',
      'terminal_autopay_view', 'terminal_autopay_toggle', 'terminal_autopay_configure',
      'terminal_autoreply_view', 'terminal_autoreply_manage', 'terminal_autoreply_toggle',
      'terminal_shift_view', 'terminal_shift_manage', 'terminal_shift_reconciliation',
      'terminal_mpi_view_own', 'terminal_mpi_view_all',
      'terminal_analytics_view', 'terminal_analytics_export',
      'terminal_assets_view', 'terminal_assets_manage',
      'terminal_kyc_view', 'terminal_kyc_manage',
      'terminal_users_view', 'terminal_users_manage', 'terminal_users_manage_subordinates', 'terminal_users_manage_all',
      'terminal_users_role_assign',
      'terminal_settings_view',
      'terminal_audit_logs_view', 'terminal_activity_logs_view', 'terminal_pricing_logs_view',
    ],
  },
};


export const TERMINAL_HIDDEN_PERMISSIONS: TerminalPermission[] = [
  // Kept out of the role matrix because there is no active Terminal UI gate for this broad legacy key.
  'terminal_mpi_view',
];

export const ALL_TERMINAL_PERMISSIONS: TerminalPermission[] = [
  ...TERMINAL_PERMISSION_MODULES.flatMap((module) => module.permissions.map((permission) => permission.key)),
  ...TERMINAL_HIDDEN_PERMISSIONS,
];
