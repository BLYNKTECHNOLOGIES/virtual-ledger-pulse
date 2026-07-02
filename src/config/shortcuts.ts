import {
  Home, TrendingUp, ShoppingCart, Building2, Users, ListOrdered, Package,
  Inbox, BookOpen, Calculator, Shield, Settings, UserCheck, CheckSquare,
  Scale, BarChart3, Keyboard, Command, Plus, Search, type LucideIcon,
} from "lucide-react";

export type ShortcutCategory = "Navigation" | "Actions" | "Global";

export interface ShortcutCombo {
  alt?: boolean;
  shift?: boolean;
  /** Ctrl on Windows/Linux, Cmd (metaKey) on macOS */
  ctrlOrCmd?: boolean;
  /** KeyboardEvent.code, e.g. "KeyS" — layout independent */
  code: string;
}

export interface ShortcutDef {
  id: string;
  category: ShortcutCategory;
  label: string;
  description: string;
  combo: ShortcutCombo;
  icon: LucideIcon;
  /** Destination route (navigation & quick-create shortcuts). */
  url?: string;
  /** Quick action flag appended as ?quickAction=<value> for the target page to consume. */
  quickAction?: string;
  /** Permissions required to see/use this shortcut. Empty = available to everyone. */
  permissions: string[];
}

/**
 * Human readable representation of a combo.
 * Uses Alt+Shift which is not bound by Chrome/Edge/Windows, so nothing clashes
 * with browser chrome. The command palette uses Ctrl/Cmd+K.
 */
export function comboToDisplay(combo: ShortcutCombo, isMac: boolean): string[] {
  const parts: string[] = [];
  if (combo.ctrlOrCmd) parts.push(isMac ? "⌘" : "Ctrl");
  if (combo.alt) parts.push(isMac ? "⌥" : "Alt");
  if (combo.shift) parts.push(isMac ? "⇧" : "Shift");
  // Convert "KeyS" -> "S", "Slash" -> "/"
  let key = combo.code.replace(/^Key/, "").replace(/^Digit/, "");
  if (combo.code === "Slash") key = "/";
  if (combo.code === "Enter") key = "Enter";
  if (combo.code === "Space") key = "Space";
  parts.push(key);
  return parts;
}

export function matchesCombo(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!!combo.ctrlOrCmd !== ctrlOrCmd) return false;
  if (!!combo.alt !== e.altKey) return false;
  if (!!combo.shift !== e.shiftKey) return false;
  // When we require Alt+Shift only, make sure Ctrl/Cmd aren't also held
  if (!combo.ctrlOrCmd && ctrlOrCmd) return false;
  return e.code === combo.code;
}

const A = (code: string): ShortcutCombo => ({ alt: true, shift: true, code });

/** Navigation shortcuts — each gated by the same permissions as its sidebar item. */
export const NAVIGATION_SHORTCUTS: ShortcutDef[] = [
  { id: "nav-dashboard", category: "Navigation", label: "Dashboard", description: "Go to the main dashboard", combo: A("KeyD"), icon: Home, url: "/dashboard", permissions: ["dashboard_view"] },
  { id: "nav-sales", category: "Navigation", label: "Sales", description: "Go to Sales orders", combo: A("KeyS"), icon: TrendingUp, url: "/sales", permissions: ["sales_view", "sales_manage"] },
  { id: "nav-purchase", category: "Navigation", label: "Purchase", description: "Go to Purchase orders", combo: A("KeyP"), icon: ShoppingCart, url: "/purchase", permissions: ["purchase_view", "purchase_manage"] },
  { id: "nav-bams", category: "Navigation", label: "BAMS", description: "Go to Bank Account Management", combo: A("KeyB"), icon: Building2, url: "/bams", permissions: ["bams_view", "bams_manage"] },
  { id: "nav-clients", category: "Navigation", label: "Clients", description: "Go to Client management", combo: A("KeyC"), icon: Users, url: "/clients", permissions: ["clients_view", "clients_manage"] },
  { id: "nav-terminal-orders", category: "Navigation", label: "Terminal Orders", description: "Go to Terminal orders", combo: A("KeyO"), icon: ListOrdered, url: "/terminal/orders", permissions: ["terminal_view", "terminal_manage"] },
  { id: "nav-stock", category: "Navigation", label: "Stock Management", description: "Go to Stock management", combo: A("KeyK"), icon: Package, url: "/stock", permissions: ["stock_view", "stock_manage"] },
  { id: "nav-erp-entry", category: "Navigation", label: "ERP Entry", description: "Go to the ERP entry queue", combo: A("KeyE"), icon: Inbox, url: "/erp-entry", permissions: ["erp_entry_view", "erp_entry_manage"] },
  { id: "nav-accounting", category: "Navigation", label: "Tax Management", description: "Go to Tax / Accounting", combo: A("KeyA"), icon: BookOpen, url: "/accounting", permissions: ["accounting_view", "accounting_manage"] },
  { id: "nav-financials", category: "Navigation", label: "Financials", description: "Go to Financials", combo: A("KeyF"), icon: Calculator, url: "/financials", permissions: ["accounting_view", "accounting_manage"] },
  { id: "nav-risk", category: "Navigation", label: "Risk Management", description: "Go to Risk management", combo: A("KeyR"), icon: Shield, url: "/risk-management", permissions: ["risk_management_view", "risk_management_manage"] },
  { id: "nav-user-management", category: "Navigation", label: "User Management", description: "Go to User management", combo: A("KeyU"), icon: Settings, url: "/user-management", permissions: ["user_management_view", "user_management_manage"] },
  { id: "nav-hrms", category: "Navigation", label: "HRMS", description: "Go to HRMS", combo: A("KeyH"), icon: UserCheck, url: "/hrms", permissions: ["hrms_view", "hrms_manage"] },
  { id: "nav-tasks", category: "Navigation", label: "Tasks", description: "Go to Tasks", combo: A("KeyG"), icon: CheckSquare, url: "/tasks", permissions: ["tasks_view", "tasks_manage"] },
  { id: "nav-compliance", category: "Navigation", label: "Compliance", description: "Go to Compliance", combo: A("KeyL"), icon: Scale, url: "/compliance", permissions: ["compliance_view", "compliance_manage"] },
  { id: "nav-statistics", category: "Navigation", label: "Statistics", description: "Go to Statistics", combo: A("KeyM"), icon: BarChart3, url: "/statistics", permissions: ["statistics_view", "statistics_manage"] },
];

/**
 * Quick-create actions. Alt+Shift+N triggers the one matching the current route.
 * These navigate to the page with ?quickAction=new; the page's existing
 * (permission-gated) create dialog is what actually opens — no direct mutations.
 */
export const QUICK_CREATE_SHORTCUTS: ShortcutDef[] = [
  { id: "new-sales", category: "Actions", label: "New Sales Order", description: "Open the New Sales Order dialog", combo: A("KeyN"), icon: Plus, url: "/sales", quickAction: "new", permissions: ["sales_manage"] },
  { id: "new-purchase", category: "Actions", label: "New Purchase Order", description: "Open the New Purchase Order dialog", combo: A("KeyN"), icon: Plus, url: "/purchase", quickAction: "new", permissions: ["purchase_manage"] },
  { id: "new-client", category: "Actions", label: "Add Client", description: "Open the Add Client dialog", combo: A("KeyN"), icon: Plus, url: "/clients", quickAction: "new", permissions: ["clients_manage"] },
  { id: "new-task", category: "Actions", label: "New Task", description: "Open the New Task dialog", combo: A("KeyN"), icon: Plus, url: "/tasks", quickAction: "new", permissions: ["tasks_manage"] },
];

/** Global shortcuts available to everyone. */
export const GLOBAL_SHORTCUTS: ShortcutDef[] = [
  { id: "global-palette", category: "Global", label: "Command Palette", description: "Search and jump to any module or action you can access", combo: { ctrlOrCmd: true, code: "KeyK" }, icon: Command, permissions: [] },
  { id: "global-new", category: "Global", label: "Create New (current module)", description: "Open the primary create dialog on the current page", combo: A("KeyN"), icon: Plus, permissions: [] },
  { id: "global-help", category: "Global", label: "Shortcuts Help", description: "Open the keyboard shortcuts reference", combo: A("Slash"), icon: Keyboard, url: "/shortcuts", permissions: [] },
];

export const ALL_SHORTCUTS: ShortcutDef[] = [
  ...GLOBAL_SHORTCUTS,
  ...NAVIGATION_SHORTCUTS,
  ...QUICK_CREATE_SHORTCUTS,
];
