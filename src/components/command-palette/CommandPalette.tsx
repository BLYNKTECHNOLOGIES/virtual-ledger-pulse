import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  SearchX,
  CornerDownLeft,
  ArrowUpDown,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { PAGE_ROUTES } from "./routes";
import { subscribeCommandPalette } from "./store";

interface EntityResults {
  clients: { id: string; name: string | null; phone: string | null }[];
  sales: { id: string; order_number: string | null; client_name: string | null }[];
  purchases: { id: string; order_number: string | null; supplier_name: string | null }[];
  employees: { id: string; first_name: string | null; last_name: string | null; badge_id: string | null }[];
}

const emptyResults: EntityResults = { clients: [], sales: [], purchases: [], employees: [] };

async function fetchEntities(term: string): Promise<EntityResults> {
  const like = `%${term}%`;

  const [clientsRes, salesRes, purchasesRes, employeesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, phone")
      .eq("is_deleted", false)
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(5),
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
    clients: clientsRes.data ?? [],
    sales: salesRes.data ?? [],
    purchases: purchasesRes.data ?? [],
    employees: employeesRes.data ?? [],
  };
}

const GROUP_HEADING =
  "px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function SkeletonRows() {
  return (
    <div className="space-y-1 px-1 py-1">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-9 rounded-md skeleton-shimmer" />
      ))}
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const debounced = useDebounce(query.trim(), 300);
  const shouldSearch = open && debounced.length >= 2;

  // Global keyboard shortcut (Ctrl/Cmd + K) + external open events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    const unsub = subscribeCommandPalette(() => setOpen(true));
    return () => {
      window.removeEventListener("keydown", onKey);
      unsub();
    };
  }, []);

  // Reset the query whenever the palette closes.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: results = emptyResults, isFetching } = useQuery({
    queryKey: ["command-palette-search", debounced],
    queryFn: () => fetchEntities(debounced),
    enabled: shouldSearch,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGE_ROUTES;
    return PAGE_ROUTES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        (p.keywords ?? "").toLowerCase().includes(q),
    );
  }, [query]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate],
  );

  const hasEntityResults =
    results.clients.length +
      results.sales.length +
      results.purchases.length +
      results.employees.length >
    0;

  const nothingAtAll =
    filteredPages.length === 0 &&
    !isFetching &&
    (!shouldSearch || !hasEntityResults);

  const employeeName = (e: EntityResults["employees"][number]) =>
    [e.first_name, e.last_name].filter(Boolean).join(" ") || e.badge_id || "Employee";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden gap-0 p-0 sm:max-w-[560px] bg-card border border-border rounded-xl shadow-md"
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          shouldFilter={false}
          className="bg-transparent [&_[cmdk-input-wrapper]]:h-11"
        >
          <CommandInput
            placeholder="Search pages, clients, orders, employees…"
            value={query}
            onValueChange={setQuery}
            aria-label="Search command palette"
          />
          <CommandList className="max-h-[60vh]">
            {nothingAtAll && (
              <CommandEmpty>
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <SearchX className="h-8 w-8 opacity-40" />
                  <p className="text-sm text-muted-foreground">No matches found</p>
                </div>
              </CommandEmpty>
            )}

            {filteredPages.length > 0 && (
              <CommandGroup heading="Pages" className="[&_[cmdk-group-heading]]:hidden">
                <div className={GROUP_HEADING}>Pages</div>
                {filteredPages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <CommandItem
                      key={p.path}
                      value={`page:${p.label}:${p.path}`}
                      onSelect={() => go(p.path)}
                      className="cursor-pointer gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{p.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {shouldSearch && isFetching && !hasEntityResults && <SkeletonRows />}

            {shouldSearch && results.clients.length > 0 && (
              <CommandGroup heading="Clients" className="[&_[cmdk-group-heading]]:hidden">
                <div className={GROUP_HEADING}>Clients</div>
                {results.clients.map((c) => (
                  <CommandItem
                    key={`client-${c.id}`}
                    value={`client:${c.id}`}
                    onSelect={() => go(`/clients/${c.id}`)}
                    className="cursor-pointer gap-2"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{c.name || "Unnamed client"}</span>
                    {c.phone && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {c.phone}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {shouldSearch && results.sales.length > 0 && (
              <CommandGroup heading="Sales Orders" className="[&_[cmdk-group-heading]]:hidden">
                <div className={GROUP_HEADING}>Sales Orders</div>
                {results.sales.map((o) => (
                  <CommandItem
                    key={`sale-${o.id}`}
                    value={`sale:${o.id}`}
                    onSelect={() => go("/sales")}
                    className="cursor-pointer gap-2"
                  >
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {o.client_name || "—"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {shouldSearch && results.purchases.length > 0 && (
              <CommandGroup heading="Purchase Orders" className="[&_[cmdk-group-heading]]:hidden">
                <div className={GROUP_HEADING}>Purchase Orders</div>
                {results.purchases.map((o) => (
                  <CommandItem
                    key={`purchase-${o.id}`}
                    value={`purchase:${o.id}`}
                    onSelect={() => go("/purchase")}
                    className="cursor-pointer gap-2"
                  >
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {o.supplier_name || "—"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {shouldSearch && results.employees.length > 0 && (
              <CommandGroup heading="Employees" className="[&_[cmdk-group-heading]]:hidden">
                <div className={GROUP_HEADING}>Employees</div>
                {results.employees.map((e) => (
                  <CommandItem
                    key={`emp-${e.id}`}
                    value={`emp:${e.id}`}
                    onSelect={() => go(`/hrms/employee/${e.id}`)}
                    className="cursor-pointer gap-2"
                  >
                    <UsersRound className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{employeeName(e)}</span>
                    {e.badge_id && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {e.badge_id}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div
            className={cn(
              "flex items-center gap-4 border-t border-border px-3 py-2",
              "text-[11px] text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" /> navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> open
            </span>
            <span className="ml-auto">esc to close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
