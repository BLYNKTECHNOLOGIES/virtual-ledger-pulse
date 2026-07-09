import { Keyboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import {
  groupTerminalShortcuts, type TerminalShortcutDef,
} from "@/config/terminal-shortcuts";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => {
        const label = k === "Ctrl" && isMac ? "⌘" : k === "Alt" && isMac ? "⌥" : k === "Shift" && isMac ? "⇧" : k;
        if (k === "then" || k === "–" || k === "or") {
          return (
            <span key={i} className="text-[10px] text-muted-foreground px-0.5">
              {k}
            </span>
          );
        }
        return (
          <kbd
            key={i}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-secondary px-1.5 py-0.5 t-mono text-[11px] font-semibold text-foreground"
          >
            {label}
          </kbd>
        );
      })}
    </span>
  );
}

const CATEGORY_BLURB: Record<string, string> = {
  Navigation: "Jump to any terminal module (Alt+Shift combos) or use G-sequences.",
  Orders: "Move through the orders list, open orders, and switch status tabs.",
  "Order Detail": "Copy, focus, and navigate within an open order.",
  Chat: "Speed keys for the order chat and composer.",
  System: "Available everywhere in the terminal.",
};

export default function TerminalShortcuts() {
  const { hasAnyPermission } = useTerminalAuth();
  const groups = groupTerminalShortcuts();
  const canUse = (s: TerminalShortcutDef) =>
    s.permissions.length === 0 || hasAnyPermission(s.permissions);

  return (
    <div className="min-h-full bg-background p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Keyboard className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Terminal Shortcuts</h1>
            <p className="text-xs text-muted-foreground">
              Work faster across the trading terminal. Press{" "}
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 t-mono text-[11px]">?</kbd>{" "}
              anywhere to open this reference. Shortcuts respect your permissions.
            </p>
          </div>
        </div>

        {groups.map(({ category, items }) => (
          <div key={category} className="t-panel overflow-hidden">
            <div className="t-panel-head">
              <span className="t-panel-head-title">{category}</span>
            </div>
            <p className="px-3 pt-2 text-xs text-muted-foreground">{CATEGORY_BLURB[category]}</p>
            <div className="p-2 divide-y divide-border">
              {items.map((s) => {
                const allowed = canUse(s);
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-4 px-1 py-2 ${allowed ? "" : "opacity-50"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.description} · {s.scope}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!allowed && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          No access
                        </Badge>
                      )}
                      <KeyCombo keys={s.keys} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-muted-foreground">
          Tip: press{" "}
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 t-mono text-[11px]">{isMac ? "⌘" : "Ctrl"}</kbd>{" "}
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 t-mono text-[11px]">K</kbd> anytime to open the command palette.
        </p>
      </div>
    </div>
  );
}
