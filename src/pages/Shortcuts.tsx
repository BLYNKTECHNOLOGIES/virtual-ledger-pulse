import { useMemo } from "react";
import { Keyboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import {
  GLOBAL_SHORTCUTS, NAVIGATION_SHORTCUTS, QUICK_CREATE_SHORTCUTS,
  comboToDisplay, type ShortcutDef,
} from "@/config/shortcuts";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function KeyCombo({ shortcut }: { shortcut: ShortcutDef }) {
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
  items: ShortcutDef[];
  canUse: (s: ShortcutDef) => boolean;
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

export default function Shortcuts() {
  const { hasAnyPermission } = usePermissions();

  const canUse = useMemo(
    () => (s: ShortcutDef) => s.permissions.length === 0 || hasAnyPermission(s.permissions),
    [hasAnyPermission],
  );

  return (
    <div className="min-h-screen bg-muted/50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Keyboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Keyboard Shortcuts</h1>
            <p className="text-sm text-muted-foreground">
              Work faster across the ERP. Shortcuts respect your permissions — actions you can't
              access are shown greyed out.
            </p>
          </div>
        </div>

        <Section
          title="Global"
          description="Available everywhere in the ERP."
          items={GLOBAL_SHORTCUTS}
          canUse={canUse}
        />
        <Section
          title="Quick Create"
          description="Press Alt+Shift+N on the matching page, or use these from the command palette."
          items={QUICK_CREATE_SHORTCUTS}
          canUse={canUse}
        />
        <Section
          title="Navigation"
          description="Jump straight to any module you have access to."
          items={NAVIGATION_SHORTCUTS}
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
