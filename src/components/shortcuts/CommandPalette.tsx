import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users, ShoppingCart, TrendingUp, UsersRound, Clock, UserPlus, Scale,
  Megaphone, Wrench, FileText, Image as ImageIcon, Layers, HelpCircle,
  User, Terminal as TerminalIcon, type LucideIcon,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { getRecents, pushRecent } from "@/lib/paletteRecents";
import {
  NAVIGATION_SHORTCUTS, QUICK_CREATE_SHORTCUTS, comboToDisplay, type ShortcutDef,
} from "@/config/shortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

interface ClientResult {
  id: string;
  name: string | null;
  client_id: string | null;
  kyc_status: string | null;
  risk_appetite: string | null;
}

interface EntityResults {
  clients: ClientResult[];
  sales: { id: string; order_number: string | null; client_name: string | null }[];
  purchases: { id: string; order_number: string | null; supplier_name: string | null }[];
  employees: { id: string; first_name: string | null; last_name: string | null; badge_id: string | null }[];
}

const emptyResults: EntityResults = { clients: [], sales: [], purchases: [], employees: [] };

// Supplemental "Go to" targets that aren't covered by NAVIGATION_SHORTCUTS.
// Rendered only when not already present in the permission-filtered nav list.
interface NavExtra { label: string; path: string; icon: LucideIcon; keywords: string }
const EXTRA_ERP_NAV: NavExtra[] = [
  { label: "RA Dashboard", path: "/ra-dashboard", icon: UsersRound, keywords: "relationship assistant" },
  { label: "Leads", path: "/leads", icon: UserPlus, keywords: "prospects" },
  { label: "Reconciliation", path: "/reconciliation", icon: Scale, keywords: "recon shift" },
  { label: "Profit & Loss", path: "/profit-loss", icon: TrendingUp, keywords: "pnl p&l gross profit" },
  { label: "Ad Manager", path: "/ad-manager", icon: Megaphone, keywords: "ads p2p binance" },
  { label: "Utility Hub", path: "/utility", icon: Wrench, keywords: "tools" },
  { label: "Invoice Creator", path: "/utility/invoice-creator", icon: FileText, keywords: "invoice" },
  { label: "Payment Screenshot", path: "/utility/payment-screenshot", icon: ImageIcon, keywords: "screenshot receipt" },
  { label: "Exchange Accounts", path: "/settings/exchange-accounts", icon: Layers, keywords: "binance accounts settings" },
  { label: "Help Assistant", path: "/help-assistant", icon: HelpCircle, keywords: "help docs" },
  { label: "My Profile", path: "/profile", icon: User, keywords: "account" },
  { label: "Open Terminal", path: "/terminal", icon: TerminalIcon, keywords: "p2p trading terminal cockpit" },
];

/**
 * Read-only entity lookup. Uses the existing supabase client so RLS + auth
 * apply automatically. Small column lists, hard limits per table.
 */
async function fetchEntities(term: string): Promise<EntityResults> {
  const like = `%${term}%`;
  const [clientsRes, salesRes, purchasesRes, employeesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, client_id, kyc_status, risk_appetite")
      .eq("is_deleted", false)
      .or(`name.ilike.${like},client_id.ilike.${like}`)
      .limit(8),
    supabase
      .from("sales_orders")
      .select("id, order_number, client_name")
      .or(`order_number.ilike.${like},client_name.ilike.${like}`)
      .limit(5),
    supabase
      .from("purchase_orders")
      .select("id, order_number, supplier_name")
      .or(`order_number.ilike.${like},supplier_name.ilike.${like}`)
      .limit(5),
    supabase
      .from("hr_employees")
      .select("id, first_name, last_name, badge_id")
      .or(`first_name.ilike.${like},last_name.ilike.${like},badge_id.ilike.${like}`)
      .limit(5),
  ]);
  return {
    clients: (clientsRes.data as ClientResult[]) ?? [],
    sales: salesRes.data ?? [],
    purchases: purchasesRes.data ?? [],
    employees: employeesRes.data ?? [],
  };
}

function ComboBadge({ shortcut }: { shortcut: ShortcutDef }) {
  const keys = comboToDisplay(shortcut.combo, isMac);
  return (
    <span className="ml-auto flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { hasAnyPermission } = usePermissions();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState(getRecents());
  const debounced = useDebounce(search.trim(), 250);
  const shouldSearch = open && debounced.length >= 2;
  const isEmpty = search.trim().length === 0;

  // Clear the query whenever the palette closes so it opens fresh.
  // Refresh recents whenever it opens.
  useEffect(() => {
    if (!open) setSearch("");
    else setRecents(getRecents());
  }, [open]);

  const navItems = useMemo(
    () => NAVIGATION_SHORTCUTS.filter((s) => hasAnyPermission(s.permissions)),
    [hasAnyPermission],
  );
  const actionItems = useMemo(
    () => QUICK_CREATE_SHORTCUTS.filter((s) => hasAnyPermission(s.permissions)),
    [hasAnyPermission],
  );

  const extraNav = useMemo(() => {
    const covered = new Set(navItems.map((s) => s.url));
    return EXTRA_ERP_NAV.filter((x) => !covered.has(x.path));
  }, [navItems]);

  const { data: results = emptyResults, isFetching } = useQuery({
    queryKey: ["command-palette-entities", debounced],
    queryFn: () => fetchEntities(debounced),
    enabled: shouldSearch,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const remember = (label: string, path: string) => {
    pushRecent({ label, path });
    setRecents(getRecents());
  };

  const run = (s: ShortcutDef) => {
    onOpenChange(false);
    if (!s.url) return;
    remember(s.label, s.url);
    const qs = s.quickAction ? `?quickAction=${s.quickAction}` : "";
    navigate(`${s.url}${qs}`);
  };

  const go = (path: string, label?: string) => {
    onOpenChange(false);
    if (label) remember(label, path);
    navigate(path);
  };

  const employeeName = (e: EntityResults["employees"][number]) =>
    [e.first_name, e.last_name].filter(Boolean).join(" ") || e.badge_id || "Employee";

  // Append the raw term to each entity value so cmdk's built-in filter always
  // keeps server-matched rows visible (server already did the matching).
  const t = debounced;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search modules, actions, clients, orders, employees…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {isEmpty && recents.length > 0 && (
          <CommandGroup heading="Recent">
            {recents.map((r) => (
              <CommandItem
                key={`recent-${r.path}`}
                value={r.label}
                onSelect={() => go(r.path, r.label)}
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{r.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actionItems.length > 0 && (
          <CommandGroup heading="Actions">
            {actionItems.map((s) => (
              <CommandItem key={s.id} value={`${s.label} ${s.description}`} onSelect={() => run(s)}>
                <s.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{s.label}</span>
                <ComboBadge shortcut={s} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actionItems.length > 0 && navItems.length > 0 && <CommandSeparator />}

        {navItems.length > 0 && (
          <CommandGroup heading="Navigate">
            {navItems.map((s) => (
              <CommandItem key={s.id} value={`${s.label} ${s.description}`} onSelect={() => run(s)}>
                <s.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{s.label}</span>
                <ComboBadge shortcut={s} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {extraNav.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {extraNav.map((x) => (
                <CommandItem
                  key={`extra-${x.path}`}
                  value={`${x.label} ${x.keywords}`}
                  onSelect={() => go(x.path, x.label)}
                >
                  <x.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{x.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {shouldSearch && isFetching && (
          <div className="space-y-1 px-2 py-2" aria-label="Searching">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-9 rounded-md skeleton-shimmer" />
            ))}
          </div>
        )}

        {shouldSearch && !isFetching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {results.clients.length === 0 ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">No clients found</div>
              ) : (
                results.clients.map((c) => (
                  <CommandItem
                    key={`client-${c.id}`}
                    value={`client ${c.name ?? ""} ${c.client_id ?? ""} ${t}`}
                    onSelect={() => go(`/clients/${c.id}`, c.name || "Client")}
                  >
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="truncate font-medium">{c.name || "Unnamed client"}</span>
                    {c.client_id && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{c.client_id}</span>
                    )}
                    {c.kyc_status && (
                      <span className="ml-auto text-xs capitalize text-muted-foreground">{c.kyc_status}</span>
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </>
        )}

        {shouldSearch && results.sales.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sales Orders">
              {results.sales.map((o) => (
                <CommandItem
                  key={`sale-${o.id}`}
                  value={`sales ${o.order_number ?? ""} ${o.client_name ?? ""} ${t}`}
                  onSelect={() => go("/sales")}
                >
                  <TrendingUp className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{o.client_name || "—"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {shouldSearch && results.purchases.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Purchase Orders">
              {results.purchases.map((o) => (
                <CommandItem
                  key={`purchase-${o.id}`}
                  value={`purchase ${o.order_number ?? ""} ${o.supplier_name ?? ""} ${t}`}
                  onSelect={() => go("/purchase")}
                >
                  <ShoppingCart className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{o.supplier_name || "—"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {shouldSearch && results.employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Employees">
              {results.employees.map((e) => (
                <CommandItem
                  key={`emp-${e.id}`}
                  value={`employee ${employeeName(e)} ${e.badge_id ?? ""} ${t}`}
                  onSelect={() => go(`/hrms/employee/${e.id}`)}
                >
                  <UsersRound className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{employeeName(e)}</span>
                  {e.badge_id && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{e.badge_id}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span className="ml-auto">esc to close</span>
      </div>
    </CommandDialog>
  );
}
