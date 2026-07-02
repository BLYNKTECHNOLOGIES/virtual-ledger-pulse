import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { comboToDisplay } from "@/config/shortcuts";
import {
  TERMINAL_NAVIGATION_SHORTCUTS, type TerminalShortcutDef,
} from "@/config/terminal-shortcuts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

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

  const navItems = useMemo(
    () => TERMINAL_NAVIGATION_SHORTCUTS.filter(
      (s) => s.permissions.length === 0 || hasAnyPermission(s.permissions),
    ),
    [hasAnyPermission],
  );

  const run = (s: TerminalShortcutDef) => {
    onOpenChange(false);
    if (s.url) navigate(s.url);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search terminal modules…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
