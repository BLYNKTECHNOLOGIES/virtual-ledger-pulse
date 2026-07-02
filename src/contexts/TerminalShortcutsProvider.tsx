import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { TerminalCommandPalette } from "@/components/terminal/TerminalCommandPalette";
import { focusPageSearch } from "@/lib/focus-page-search";
import { matchesCombo } from "@/config/shortcuts";
import {
  TERMINAL_NAVIGATION_SHORTCUTS, TERMINAL_GLOBAL_SHORTCUTS,
} from "@/config/terminal-shortcuts";

interface TerminalShortcutsContextValue {
  openPalette: () => void;
  focusPageSearch: () => boolean;
}

const TerminalShortcutsContext = createContext<TerminalShortcutsContextValue>({
  openPalette: () => {},
  focusPageSearch: () => false,
});

export const useTerminalShortcuts = () => useContext(TerminalShortcutsContext);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function TerminalShortcutsProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { hasAnyPermission } = useTerminalAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette works everywhere, even inside inputs.
      const palette = TERMINAL_GLOBAL_SHORTCUTS.find((s) => s.id === "t-global-palette")!;
      if (matchesCombo(e, palette.combo)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      // Everything else is ignored while typing so it never disrupts data entry.
      if (isTypingTarget(e.target)) return;

      // Focus the current page's search box ("/")
      const pageSearch = TERMINAL_GLOBAL_SHORTCUTS.find((s) => s.id === "t-global-page-search")!;
      if (matchesCombo(e, pageSearch.combo)) {
        if (focusPageSearch()) e.preventDefault();
        return;
      }

      // Help
      const help = TERMINAL_GLOBAL_SHORTCUTS.find((s) => s.id === "t-global-help")!;
      if (matchesCombo(e, help.combo)) {
        e.preventDefault();
        navigate("/terminal/shortcuts");
        return;
      }

      // Navigation shortcuts — permission gated, identical to sidebar rules.
      for (const s of TERMINAL_NAVIGATION_SHORTCUTS) {
        if (
          matchesCombo(e, s.combo) &&
          s.url &&
          (s.permissions.length === 0 || hasAnyPermission(s.permissions))
        ) {
          e.preventDefault();
          navigate(s.url);
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, hasAnyPermission]);

  return (
    <TerminalShortcutsContext.Provider value={{ openPalette, focusPageSearch }}>
      {children}
      <TerminalCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </TerminalShortcutsContext.Provider>
  );
}
