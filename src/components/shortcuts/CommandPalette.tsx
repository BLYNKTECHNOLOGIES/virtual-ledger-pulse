import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { usePermissions } from "@/hooks/usePermissions";
import {
  NAVIGATION_SHORTCUTS, QUICK_CREATE_SHORTCUTS, comboToDisplay, type ShortcutDef,
} from "@/config/shortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

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

  const navItems = useMemo(
    () => NAVIGATION_SHORTCUTS.filter((s) => hasAnyPermission(s.permissions)),
    [hasAnyPermission],
  );
  const actionItems = useMemo(
    () => QUICK_CREATE_SHORTCUTS.filter((s) => hasAnyPermission(s.permissions)),
    [hasAnyPermission],
  );

  const run = (s: ShortcutDef) => {
    onOpenChange(false);
    if (!s.url) return;
    const search = s.quickAction ? `?quickAction=${s.quickAction}` : "";
    navigate(`${s.url}${search}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search modules and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

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
      </CommandList>
    </CommandDialog>
  );
}
