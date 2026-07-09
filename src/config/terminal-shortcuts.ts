import {
  LayoutDashboard, Megaphone, ShoppingCart, Bot, Wallet, Activity,
  BarChart3, CreditCard, FileWarning, ReceiptText, ScrollText, Users,
  Settings, Command, Search, Keyboard, ArrowLeftRight, ListChecks, MessageSquare,
  Zap, MousePointerClick, ArrowUpDown, Copy, Focus, CornerUpLeft, VolumeX,
  Navigation, type LucideIcon,
} from "lucide-react";
import type { ShortcutCombo } from "@/config/shortcuts";
import type { TerminalPermission } from "@/hooks/useTerminalAuth";

/**
 * Central shortcut registry — the SINGLE SOURCE OF TRUTH for every terminal
 * keyboard shortcut. Both the "?" help overlay and the /terminal/shortcuts page
 * render exclusively from this registry (no hardcoded duplicate lists), and the
 * TerminalShortcutsProvider central keydown listener drives behaviour from it.
 *
 * HARD RULES enforced by the provider:
 *  - Shortcuts only fire OUTSIDE inputs/textareas/contenteditable (except Esc
 *    and composer keys).
 *  - ALL shortcuts suspend while any dialog/sheet/popover is open (except Esc).
 *  - NO money-moving action is ever bound to a key — keys only navigate, focus,
 *    copy, or trigger the same UI handler as an existing NON-destructive click.
 *  - No Ctrl+letter, no Ctrl+1–9, no Alt+arrows, no F-keys.
 */
export type TerminalShortcutCategory =
  | "Navigation" | "Orders" | "Order Detail" | "Chat" | "System";

export interface TerminalShortcutDef {
  id: string;
  category: TerminalShortcutCategory;
  label: string;
  description: string;
  /** Human-readable key chips, e.g. ["G", "then", "O"] or ["Shift", "/"]. */
  keys: string[];
  /** Where the shortcut is active (rendered as a scope label). */
  scope: string;
  icon: LucideIcon;
  /** Combo for provider matching (navigation/global). Sequence & context keys are matched by id logic. */
  combo?: ShortcutCombo;
  /** Destination route (navigation shortcuts). */
  url?: string;
  /** For go-to sequences: the second key (after "g") as a KeyboardEvent.key. */
  goToKey?: string;
  /** Permissions required. Empty = every terminal user. User must hold AT LEAST ONE. */
  permissions: TerminalPermission[];
}

const AS = (code: string): ShortcutCombo => ({ alt: true, shift: true, code });

/* ------------------------------------------------------------------ *
 * NAVIGATION — Alt+Shift combos (command-palette compatible) + go-to  *
 * ------------------------------------------------------------------ */

/** Kept as `TERMINAL_NAVIGATION_SHORTCUTS` because the command palette filters this array by combo. */
export const TERMINAL_NAVIGATION_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-nav-dashboard", category: "Navigation", label: "Dashboard", description: "Go to the terminal dashboard", keys: ["Alt", "Shift", "D"], scope: "Any terminal page", combo: AS("KeyD"), icon: LayoutDashboard, url: "/terminal", permissions: ["terminal_dashboard_view"] },
  { id: "t-nav-ads", category: "Navigation", label: "Ads Manager", description: "Go to Ads Manager", keys: ["Alt", "Shift", "A"], scope: "Any terminal page", combo: AS("KeyA"), icon: Megaphone, url: "/terminal/ads", permissions: ["terminal_ads_view"] },
  { id: "t-nav-orders", category: "Navigation", label: "Orders", description: "Go to P2P Orders", keys: ["Alt", "Shift", "O"], scope: "Any terminal page", combo: AS("KeyO"), icon: ShoppingCart, url: "/terminal/orders", permissions: ["terminal_orders_view"] },
  { id: "t-nav-automation", category: "Navigation", label: "Automation", description: "Go to Automation", keys: ["Alt", "Shift", "U"], scope: "Any terminal page", combo: AS("KeyU"), icon: Bot, url: "/terminal/automation", permissions: ["terminal_pricing_view"] },
  { id: "t-nav-assets", category: "Navigation", label: "Assets", description: "Go to Assets", keys: ["Alt", "Shift", "W"], scope: "Any terminal page", combo: AS("KeyW"), icon: Wallet, url: "/terminal/assets", permissions: ["terminal_assets_view"] },
  { id: "t-nav-analytics", category: "Navigation", label: "Analytics", description: "Go to Analytics", keys: ["Alt", "Shift", "Y"], scope: "Any terminal page", combo: AS("KeyY"), icon: Activity, url: "/terminal/analytics", permissions: ["terminal_analytics_view"] },
  { id: "t-nav-mpi", category: "Navigation", label: "MPI", description: "Go to MPI performance", keys: ["Alt", "Shift", "M"], scope: "Any terminal page", combo: AS("KeyM"), icon: BarChart3, url: "/terminal/mpi", permissions: ["terminal_mpi_view_own", "terminal_mpi_view_all"] },
  { id: "t-nav-payer", category: "Navigation", label: "Payer", description: "Go to Payer", keys: ["Alt", "Shift", "P"], scope: "Any terminal page", combo: AS("KeyP"), icon: CreditCard, url: "/terminal/payer", permissions: ["terminal_payer_view"] },
  { id: "t-nav-appeals", category: "Navigation", label: "Appeals", description: "Go to Appeals", keys: ["Alt", "Shift", "J"], scope: "Any terminal page", combo: AS("KeyJ"), icon: FileWarning, url: "/terminal/appeals", permissions: ["terminal_appeals_view"] },
  { id: "t-nav-small-payments", category: "Navigation", label: "Small Payments", description: "Go to Small Payments", keys: ["Alt", "Shift", "K"], scope: "Any terminal page", combo: AS("KeyK"), icon: ReceiptText, url: "/terminal/small-payments", permissions: ["terminal_small_payments_view"] },
  { id: "t-nav-logs", category: "Navigation", label: "Logs", description: "Go to Logs", keys: ["Alt", "Shift", "G"], scope: "Any terminal page", combo: AS("KeyG"), icon: ScrollText, url: "/terminal/logs", permissions: ["terminal_logs_view"] },
  { id: "t-nav-users", category: "Navigation", label: "Users & Roles", description: "Go to Users & Roles", keys: ["Alt", "Shift", "R"], scope: "Any terminal page", combo: AS("KeyR"), icon: Users, url: "/terminal/users", permissions: ["terminal_users_view"] },
  { id: "t-nav-settings", category: "Navigation", label: "Settings", description: "Go to Settings", keys: ["Alt", "Shift", "S"], scope: "Any terminal page", combo: AS("KeyS"), icon: Settings, url: "/terminal/settings", permissions: ["terminal_settings_view"] },
];

/**
 * Go-to sequences — press "g" then a letter within 600ms. React-router navigate
 * to existing routes; the routes' own permission guards handle access.
 */
export const TERMINAL_GOTO_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-goto-orders", category: "Navigation", label: "Go to Orders", description: "Jump to the P2P orders list", keys: ["G", "then", "O"], scope: "Any terminal page", goToKey: "o", icon: ShoppingCart, url: "/terminal/orders", permissions: [] },
  { id: "t-goto-dashboard", category: "Navigation", label: "Go to Dashboard", description: "Jump to the terminal dashboard", keys: ["G", "then", "D"], scope: "Any terminal page", goToKey: "d", icon: LayoutDashboard, url: "/terminal", permissions: [] },
  { id: "t-goto-appeals", category: "Navigation", label: "Go to Appeals", description: "Jump to appeals", keys: ["G", "then", "A"], scope: "Any terminal page", goToKey: "a", icon: FileWarning, url: "/terminal/appeals", permissions: [] },
  { id: "t-goto-payer", category: "Navigation", label: "Go to Payer", description: "Jump to the payer module", keys: ["G", "then", "P"], scope: "Any terminal page", goToKey: "p", icon: CreditCard, url: "/terminal/payer", permissions: [] },
  { id: "t-goto-mpi", category: "Navigation", label: "Go to MPI", description: "Jump to MPI performance", keys: ["G", "then", "M"], scope: "Any terminal page", goToKey: "m", icon: BarChart3, url: "/terminal/mpi", permissions: [] },
  { id: "t-goto-queue", category: "Navigation", label: "Go to Queue Mode", description: "Open orders in Queue Mode", keys: ["G", "then", "Q"], scope: "Any terminal page", goToKey: "q", icon: ListChecks, url: "/terminal/orders?view=queue", permissions: [] },
  { id: "t-goto-ads", category: "Navigation", label: "Go to Ad Manager", description: "Jump to the ad manager", keys: ["G", "then", "B"], scope: "Any terminal page", goToKey: "b", icon: Megaphone, url: "/terminal/ads", permissions: [] },
  { id: "t-goto-settings", category: "Navigation", label: "Go to Settings", description: "Jump to settings", keys: ["G", "then", "S"], scope: "Any terminal page", goToKey: "s", icon: Settings, url: "/terminal/settings", permissions: [] },
];

/* ------------------------------------------------------------------ *
 * ORDERS (list)                                                        *
 * ------------------------------------------------------------------ */
export const TERMINAL_ORDERS_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-orders-down", category: "Orders", label: "Move Focus Down", description: "Move the focus ring to the next order row", keys: ["J"], scope: "Orders list", icon: ArrowUpDown, permissions: [] },
  { id: "t-orders-up", category: "Orders", label: "Move Focus Up", description: "Move the focus ring to the previous order row", keys: ["K"], scope: "Orders list", icon: ArrowUpDown, permissions: [] },
  { id: "t-orders-open", category: "Orders", label: "Open Focused Order", description: "Open the focused order (same as clicking the row)", keys: ["Enter", "/", "O"], scope: "Orders list", icon: MousePointerClick, permissions: [] },
  { id: "t-orders-prev-tab", category: "Orders", label: "Previous Status Tab", description: "Switch to the previous status filter tab", keys: ["["], scope: "Orders list", icon: ArrowLeftRight, permissions: [] },
  { id: "t-orders-next-tab", category: "Orders", label: "Next Status Tab", description: "Switch to the next status filter tab", keys: ["]"], scope: "Orders list", icon: ArrowLeftRight, permissions: [] },
  { id: "t-orders-search", category: "Orders", label: "Focus Search", description: "Focus the orders search box", keys: ["F"], scope: "Orders list", icon: Search, permissions: [] },
  { id: "t-orders-refresh", category: "Orders", label: "Refresh", description: "Trigger the existing refresh button", keys: ["R"], scope: "Orders list", icon: Navigation, permissions: [] },
  { id: "t-orders-back", category: "Orders", label: "Back to List", description: "Return from an open order to the list", keys: ["U"], scope: "Orders list / detail", icon: CornerUpLeft, permissions: [] },
  { id: "t-queue-next", category: "Orders", label: "Queue: Next Order", description: "In Queue Mode or an open order, move to the next chat/order", keys: ["J", "or", "→"], scope: "Queue Mode / order detail", icon: ListChecks, permissions: [] },
  { id: "t-queue-prev", category: "Orders", label: "Queue: Previous Order", description: "In Queue Mode or an open order, move to the previous chat/order", keys: ["K", "or", "←"], scope: "Queue Mode / order detail", icon: ListChecks, permissions: [] },
];

/* ------------------------------------------------------------------ *
 * ORDER DETAIL                                                         *
 * ------------------------------------------------------------------ */
export const TERMINAL_ORDER_DETAIL_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-detail-copy-order", category: "Order Detail", label: "Copy Order Number", description: "Copy the order number to the clipboard", keys: ["C"], scope: "Order detail", icon: Copy, permissions: [] },
  { id: "t-detail-copy-fiat", category: "Order Detail", label: "Copy Fiat Amount", description: "Copy the fiat amount to the clipboard", keys: ["Shift", "C"], scope: "Order detail", icon: Copy, permissions: [] },
  { id: "t-detail-internal-chat", category: "Order Detail", label: "Focus Internal Chat", description: "Focus the internal chat input", keys: ["I"], scope: "Order detail", icon: MessageSquare, permissions: [] },
  { id: "t-detail-actions", category: "Order Detail", label: "Focus Actions", description: "Scroll to and focus the first action button (focus only — never activates)", keys: ["A"], scope: "Order detail", icon: Focus, permissions: [] },
  { id: "t-detail-esc", category: "Order Detail", label: "Step Back", description: "Blur input → close takeover → back to list", keys: ["Esc"], scope: "Order detail", icon: CornerUpLeft, permissions: [] },
];

/* ------------------------------------------------------------------ *
 * CHAT                                                                 *
 * ------------------------------------------------------------------ */
export const TERMINAL_CHAT_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-chat-focus", category: "Chat", label: "Focus Chat Input", description: "Jump straight to the chat message box (when no page search box is present)", keys: ["/"], scope: "Order chat", icon: MessageSquare, permissions: [] },
  { id: "t-chat-quick-reply", category: "Chat", label: "Insert Quick Reply", description: "Press 1–9 to insert your matching quick reply (never auto-sends)", keys: ["1", "–", "9"], scope: "Order chat", icon: Zap, permissions: [] },
  { id: "t-chat-esc", category: "Chat", label: "Blur Composer", description: "Blur the chat composer and return to list scope", keys: ["Esc"], scope: "Chat composer", icon: CornerUpLeft, permissions: [] },
];

/* ------------------------------------------------------------------ *
 * SYSTEM                                                               *
 * ------------------------------------------------------------------ */
export const TERMINAL_SYSTEM_SHORTCUTS: TerminalShortcutDef[] = [
  { id: "t-sys-palette", category: "System", label: "Command Palette", description: "Search and jump to any terminal module you can access", keys: ["Ctrl", "K"], scope: "Everywhere", combo: { ctrlOrCmd: true, code: "KeyK" }, icon: Command, permissions: [] },
  { id: "t-sys-page-search", category: "System", label: "Search This Page", description: "Focus the search box of the current page", keys: ["/"], scope: "Any terminal page", combo: { code: "Slash" }, icon: Search, permissions: [] },
  { id: "t-sys-help", category: "System", label: "Shortcuts Help", description: "Open this keyboard shortcuts overlay", keys: ["Shift", "/"], scope: "Everywhere", combo: { shift: true, code: "Slash" }, icon: Keyboard, permissions: [] },
  { id: "t-sys-mute", category: "System", label: "Toggle Notifications Mute", description: "Mute / unmute terminal notifications", keys: ["Shift", "D"], scope: "Everywhere", combo: { shift: true, code: "KeyD" }, icon: VolumeX, permissions: [] },
];

/** The full ordered registry — consumed by the overlay and the shortcuts page. */
export const TERMINAL_SHORTCUT_REGISTRY: TerminalShortcutDef[] = [
  ...TERMINAL_SYSTEM_SHORTCUTS,
  ...TERMINAL_NAVIGATION_SHORTCUTS,
  ...TERMINAL_GOTO_SHORTCUTS,
  ...TERMINAL_ORDERS_SHORTCUTS,
  ...TERMINAL_ORDER_DETAIL_SHORTCUTS,
  ...TERMINAL_CHAT_SHORTCUTS,
];

/** Category render order for grouped views. */
export const TERMINAL_SHORTCUT_CATEGORIES: TerminalShortcutCategory[] = [
  "Navigation", "Orders", "Order Detail", "Chat", "System",
];

/** Group the registry by category (skips empty categories). */
export function groupTerminalShortcuts(
  registry: TerminalShortcutDef[] = TERMINAL_SHORTCUT_REGISTRY,
): { category: TerminalShortcutCategory; items: TerminalShortcutDef[] }[] {
  return TERMINAL_SHORTCUT_CATEGORIES
    .map((category) => ({ category, items: registry.filter((s) => s.category === category) }))
    .filter((g) => g.items.length > 0);
}
