import {
  LayoutDashboard, Megaphone, ShoppingCart, Bot, Wallet, Activity,
  BarChart3, CreditCard, FileWarning, ReceiptText, ScrollText, Users,
  Settings, Command, Search, Keyboard, ArrowLeftRight, ListChecks, MessageSquare, Zap, type LucideIcon,
} from "lucide-react";
import type { ShortcutCombo } from "@/config/shortcuts";
import type { TerminalPermission } from "@/hooks/useTerminalAuth";

export type TerminalShortcutCategory = "Navigation" | "Global" | "Order Navigation" | "Queue & Chat";

export interface TerminalShortcutDef {
  id: string;
  category: TerminalShortcutCategory;
  label: string;
  description: string;
  combo: ShortcutCombo;
  icon: LucideIcon;
  /** Destination route (navigation shortcuts). */
  url?: string;
  /**
   * Permissions required to see/use this shortcut. Empty = available to every
   * terminal user. A user must hold AT LEAST ONE of these permissions.
   */
  permissions: TerminalPermission[];
}

const A = (code: string): ShortcutCombo => ({ alt: true, shift: true, code });

/**
 * Navigation shortcuts — each gated by the same permission as its terminal
 * sidebar item. Uses Chrome-safe Alt+Shift+<letter> combos (see the reserved
 * list documented in src/config/shortcuts.ts).
 */
export const TERMINAL_NAVIGATION_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-nav-dashboard", category: "Navigation", label: "Dashboard", description: "Go to the terminal dashboard", combo: A("KeyD"), icon: LayoutDashboard, url: "/terminal", permissions: ["terminal_dashboard_view"] },
  { id: "t-nav-ads", category: "Navigation", label: "Ads Manager", description: "Go to Ads Manager", combo: A("KeyA"), icon: Megaphone, url: "/terminal/ads", permissions: ["terminal_ads_view"] },
  { id: "t-nav-orders", category: "Navigation", label: "Orders", description: "Go to P2P Orders", combo: A("KeyO"), icon: ShoppingCart, url: "/terminal/orders", permissions: ["terminal_orders_view"] },
  { id: "t-nav-automation", category: "Navigation", label: "Automation", description: "Go to Automation", combo: A("KeyU"), icon: Bot, url: "/terminal/automation", permissions: ["terminal_pricing_view"] },
  { id: "t-nav-assets", category: "Navigation", label: "Assets", description: "Go to Assets", combo: A("KeyW"), icon: Wallet, url: "/terminal/assets", permissions: ["terminal_assets_view"] },
  { id: "t-nav-analytics", category: "Navigation", label: "Analytics", description: "Go to Analytics", combo: A("KeyY"), icon: Activity, url: "/terminal/analytics", permissions: ["terminal_analytics_view"] },
  { id: "t-nav-mpi", category: "Navigation", label: "MPI", description: "Go to MPI performance", combo: A("KeyM"), icon: BarChart3, url: "/terminal/mpi", permissions: ["terminal_mpi_view_own", "terminal_mpi_view_all"] },
  { id: "t-nav-payer", category: "Navigation", label: "Payer", description: "Go to Payer", combo: A("KeyP"), icon: CreditCard, url: "/terminal/payer", permissions: ["terminal_payer_view"] },
  { id: "t-nav-appeals", category: "Navigation", label: "Appeals", description: "Go to Appeals", combo: A("KeyJ"), icon: FileWarning, url: "/terminal/appeals", permissions: ["terminal_appeals_view"] },
  { id: "t-nav-small-payments", category: "Navigation", label: "Small Payments", description: "Go to Small Payments", combo: A("KeyK"), icon: ReceiptText, url: "/terminal/small-payments", permissions: ["terminal_small_payments_view"] },
  { id: "t-nav-logs", category: "Navigation", label: "Logs", description: "Go to Logs", combo: A("KeyG"), icon: ScrollText, url: "/terminal/logs", permissions: ["terminal_logs_view"] },
  { id: "t-nav-users", category: "Navigation", label: "Users & Roles", description: "Go to Users & Roles", combo: A("KeyR"), icon: Users, url: "/terminal/users", permissions: ["terminal_users_view"] },
  { id: "t-nav-settings", category: "Navigation", label: "Settings", description: "Go to Settings", combo: A("KeyS"), icon: Settings, url: "/terminal/settings", permissions: ["terminal_settings_view"] },
];

/** Global shortcuts available to every terminal user. */
export const TERMINAL_GLOBAL_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-global-palette", category: "Global", label: "Command Palette", description: "Search and jump to any terminal module you can access", combo: { ctrlOrCmd: true, code: "KeyK" }, icon: Command, permissions: [] },
  { id: "t-global-page-search", category: "Global", label: "Search This Page", description: "Focus the search box of the page you're currently on", combo: { code: "Slash" }, icon: Search, permissions: [] },
  { id: "t-global-help", category: "Global", label: "Shortcuts Help", description: "Open the keyboard shortcuts reference", combo: A("Slash"), icon: Keyboard, url: "/terminal/shortcuts", permissions: [] },
];

/**
 * Order-list navigation. These aren't dispatched from the registry (they are
 * handled locally by each list page), but they are documented on the help page.
 */
export const TERMINAL_ORDER_NAV_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-order-next", category: "Order Navigation", label: "Next Order Chat", description: "While an order/appeal is open, jump to the next one in the current list and open its chat", combo: { shift: true, code: "ArrowRight" }, icon: ArrowLeftRight, permissions: [] },
  { id: "t-order-prev", category: "Order Navigation", label: "Previous Order Chat", description: "While an order/appeal is open, jump to the previous one in the current list and open its chat", combo: { shift: true, code: "ArrowLeft" }, icon: ArrowLeftRight, permissions: [] },
];

export const ALL_TERMINAL_SHORTCUTS: TerminalShortcutDef[] = [
  ...TERMINAL_GLOBAL_SHORTCUTS,
  ...TERMINAL_NAVIGATION_SHORTCUTS,
  ...TERMINAL_ORDER_NAV_SHORTCUTS,
];
