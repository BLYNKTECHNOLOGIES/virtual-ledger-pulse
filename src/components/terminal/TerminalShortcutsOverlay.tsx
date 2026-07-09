import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import {
  groupTerminalShortcuts, type TerminalShortcutDef,
} from "@/config/terminal-shortcuts";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) =>
        k === "then" || k === "–" || k === "or" ? (
          <span key={i} className="text-[10px] text-muted-foreground px-0.5">{k}</span>
        ) : (
          <kbd
            key={i}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1.5 t-mono text-[11px] font-semibold text-foreground"
          >
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}

export function TerminalShortcutsOverlay({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { hasAnyPermission } = useTerminalAuth();
  const groups = groupTerminalShortcuts();
  const canUse = (s: TerminalShortcutDef) =>
    s.permissions.length === 0 || hasAnyPermission(s.permissions);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-popover t-scale-in">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map(({ category, items }) => (
            <div key={category}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </p>
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {items.map((s) => {
                  const allowed = canUse(s);
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-4 px-3 py-1.5 ${allowed ? "" : "opacity-50"}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{s.description}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.scope}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!allowed && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            No access
                          </Badge>
                        )}
                        <Keys keys={s.keys} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          Press <kbd className="rounded border border-border bg-secondary px-1 t-mono">?</kbd> or{" "}
          <kbd className="rounded border border-border bg-secondary px-1 t-mono">Esc</kbd> to close.
        </p>
      </DialogContent>
    </Dialog>
  );
}
