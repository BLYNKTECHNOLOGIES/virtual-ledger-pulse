import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Clock, ScrollText, Keyboard, ShieldCheck, LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { getRecents, pushRecent } from "@/lib/paletteRecents";
import { comboToDisplay } from "@/config/shortcuts";
import {
  TERMINAL_NAVIGATION_SHORTCUTS, type TerminalShortcutDef,
} from "@/config/terminal-shortcuts";

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

interface NavExtra { label: string; path: string; icon: LucideIcon; keywords: string }
const EXTRA_TERMINAL_NAV: NavExtra[] = [
  { label: "Terminal Audit Logs", path: "/terminal/audit-logs", icon: ScrollText, keywords: "audit" },
  { label: "Terminal Shortcuts", path: "/terminal/shortcuts", icon: Keyboard, keywords: "hotkeys keys" },
  { label: "Terminal KYC", path: "/terminal/kyc", icon: ShieldCheck, keywords: "verification kyc" },
  { label: "Open ERP", path: "/dashboard", icon: LayoutDashboard, keywords: "erp dashboard home" },
];

async function fetchClients(term: string): Promise<ClientResult[]> {
  const like = `%${term}%`;
  const { data } = await supabase
    .from("clients")
    .select("id, name, client_id, kyc_status, risk_appetite")
    .eq("is_deleted", false)
    .or(`name.ilike.${like},client_id.ilike.${like}`)
    .limit(8);
  return (data as ClientResult[]) ?? [];
}

function ComboBadge({ shortcut }: { shortcut: TerminalShortcutDef }) {
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

export function TerminalCommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { hasAnyPermission } = useTerminalAuth();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState(getRecents());
  const debounced = useDebounce(search.trim(), 250);
  const shouldSearch = open && debounced.length >= 2;
  const isEmpty = search.trim().length === 0;

  useEffect(() => {
    if (!open) setSearch("");
    else setRecents(getRecents());
  }, [open]);

  const navItems = useMemo(
    () => TERMINAL_NAVIGATION_SHORTCUTS.filter(
      (s) => s.permissions.length === 0 || hasAnyPermission(s.permissions),
    ),
    [hasAnyPermission],
  );

  const extraNav = useMemo(() => {
    const covered = new Set(navItems.map((s) => s.url));
    return EXTRA_TERMINAL_NAV.filter((x) => !covered.has(x.path));
  }, [navItems]);

  const { data: clients = [], isFetching } = useQuery({
    queryKey: ["terminal-palette-clients", debounced],
    queryFn: () => fetchClients(debounced),
    enabled: shouldSearch,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const remember = (label: string, path: string) => {
    pushRecent({ label, path });
    setRecents(getRecents());
  };

  const run = (s: TerminalShortcutDef) => {
    onOpenChange(false);
    if (!s.url) return;
    remember(s.label, s.url);
    navigate(s.url);
  };

  const go = (path: string, label?: string) => {
    onOpenChange(false);
    if (label) remember(label, path);
    navigate(path);
  };

  const t = debounced;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search terminal modules, clients…"
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
          <div className="px-2 py-2 text-sm text-muted-foreground" aria-label="Searching">
            Searching…
          </div>
        )}

        {shouldSearch && !isFetching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clients.length === 0 ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">No clients found</div>
              ) : (
                clients.map((c) => (
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
      </CommandList>
    </CommandDialog>
  );
}
