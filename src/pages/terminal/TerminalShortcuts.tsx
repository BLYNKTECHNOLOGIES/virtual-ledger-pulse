import { useMemo } from "react";
import { Keyboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { comboToDisplay } from "@/config/shortcuts";
import {
  TERMINAL_GLOBAL_SHORTCUTS, TERMINAL_NAVIGATION_SHORTCUTS,
  TERMINAL_ORDER_NAV_SHORTCUTS, type TerminalShortcutDef,
} from "@/config/terminal-shortcuts";
import { TerminalPermissionGate } from "@/components/terminal/TerminalPermissionGate";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function KeyCombo({ shortcut }: { shortcut: TerminalShortcutDef }) {
  const keys = comboToDisplay(shortcut.combo, isMac);
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-semibold text-foreground shadow-sm">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}

function Section({
  title, description, items, canUse,
}: {
  title: string;
  description: string;
  items: TerminalShortcutDef[];
  canUse: (s: TerminalShortcutDef) => boolean;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((s) => {
          const allowed = canUse(s);
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 ${
                allowed ? "hover:bg-muted/50" : "opacity-50"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!allowed && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    No access
                  </Badge>
                )}
                <KeyCombo shortcut={s} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function TerminalShortcuts() {
  const { hasAnyPermission } = useTerminalAuth();

  const canUse = useMemo(
    () => (s: TerminalShortcutDef) => s.permissions.length === 0 || hasAnyPermission(s.permissions),
    [hasAnyPermission],
  );

  return (
    <div className="min-h-full bg-background p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Keyboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Terminal Shortcuts</h1>
            <p className="text-sm text-muted-foreground">
              Work faster across the trading terminal. Shortcuts respect your permissions —
              modules you can't access are shown greyed out.
            </p>
          </div>
        </div>

        <Section
          title="Global"
          description="Available everywhere in the terminal."
          items={TERMINAL_GLOBAL_SHORTCUTS}
          canUse={canUse}
        />
        <Section
          title="Order Navigation"
          description="While an order or appeal is open, hold Shift and use the arrow keys to move through the list you entered from — the next/previous order's chat opens automatically."
          items={TERMINAL_ORDER_NAV_SHORTCUTS}
          canUse={canUse}
        />
        <Section
          title="Navigation"
          description="Jump straight to any terminal module you have access to."
          items={TERMINAL_NAVIGATION_SHORTCUTS}
          canUse={canUse}
        />

        <p className="text-center text-xs text-muted-foreground">
          Tip: press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">{isMac ? "⌘" : "Ctrl"}</kbd>{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5">K</kbd> anytime to open the command palette.
        </p>
      </div>
    </div>
  );
}
