import {
  LayoutDashboard,
  Landmark,
  Users,
  Megaphone,
  ShoppingCart,
  TrendingUp,
  Calculator,
  LineChart,
  BarChart3,
  ShieldCheck,
  UserCog,
  Boxes,
  Settings,
  ListChecks,
  ClipboardList,
  Scale,
  AlertTriangle,
  Wallet,
  UsersRound,
  CalendarClock,
  Contact,
  type LucideIcon,
} from "lucide-react";

export interface PageRoute {
  label: string;
  path: string;
  icon: LucideIcon;
  /** extra search terms / synonyms */
  keywords?: string;
}

/**
 * Static registry of the main authenticated ERP routes (derived from App.tsx).
 * Excludes login/OAuth, the .terminal theme routes, and the 404 page.
 * Purely a navigation map — no business logic.
 */
export const PAGE_ROUTES: PageRoute[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, keywords: "home overview" },
  { label: "BAMS", path: "/bams", icon: Landmark, keywords: "bank accounts journal payment gateway" },
  { label: "Clients", path: "/clients", icon: Users, keywords: "customers kyc" },
  { label: "Ad Manager", path: "/ad-manager", icon: Megaphone, keywords: "binance ads pricing" },
  { label: "Purchase", path: "/purchase", icon: ShoppingCart, keywords: "purchase orders suppliers buy" },
  { label: "Sales", path: "/sales", icon: TrendingUp, keywords: "sales orders sell" },
  { label: "Accounting", path: "/accounting", icon: Calculator, keywords: "tax tds sales purchases ledger" },
  { label: "Profit & Loss", path: "/profit-loss", icon: LineChart, keywords: "pnl p&l margin net profit" },
  { label: "Financials", path: "/financials", icon: Wallet, keywords: "asset value platform fees gross profit" },
  { label: "Statistics", path: "/statistics", icon: BarChart3, keywords: "analytics insights" },
  { label: "Compliance", path: "/compliance", icon: ShieldCheck, keywords: "legal taxation banking lien investigations" },
  { label: "Risk Management", path: "/risk-management", icon: AlertTriangle, keywords: "flagged blacklist rekyc" },
  { label: "Reconciliation", path: "/reconciliation", icon: Scale, keywords: "cockpit exceptions" },
  { label: "Stock Management", path: "/stock", icon: Boxes, keywords: "wallet inventory conversion" },
  { label: "Tasks", path: "/tasks", icon: ListChecks, keywords: "todo assignments" },
  { label: "ERP Entry", path: "/erp-entry", icon: ClipboardList, keywords: "entry manager feed" },
  { label: "Leads", path: "/leads", icon: Contact, keywords: "prospects crm" },
  { label: "RA Dashboard", path: "/ra-dashboard", icon: ClipboardList, keywords: "relationship associate" },
  { label: "User Management", path: "/user-management", icon: UserCog, keywords: "roles permissions users" },
  { label: "HRMS", path: "/hrms", icon: UsersRound, keywords: "human resources horilla" },
  { label: "Employees", path: "/hrms/employee", icon: UsersRound, keywords: "staff people directory" },
  { label: "Attendance", path: "/hrms/attendance", icon: CalendarClock, keywords: "punches shifts activity" },
  { label: "Leave", path: "/hrms/leave/requests", icon: CalendarClock, keywords: "leave requests allocations" },
  { label: "Payroll", path: "/hrms/payroll/payslips", icon: Calculator, keywords: "salary payslips" },
  { label: "Assets", path: "/hrms/asset", icon: Boxes, keywords: "asset assignments equipment" },
  { label: "Exchange Accounts Settings", path: "/settings/exchange-accounts", icon: Settings, keywords: "binance credentials api keys" },
  { label: "Profile", path: "/profile", icon: Contact, keywords: "account me" },
  { label: "Shortcuts", path: "/shortcuts", icon: Settings, keywords: "keyboard hotkeys" },
];
