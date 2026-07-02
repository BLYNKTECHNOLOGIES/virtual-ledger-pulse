import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { CommandPalette } from "@/components/shortcuts/CommandPalette";
import {
  NAVIGATION_SHORTCUTS, QUICK_CREATE_SHORTCUTS, GLOBAL_SHORTCUTS, matchesCombo,
} from "@/config/shortcuts";

interface ShortcutsContextValue {
  openPalette: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue>({ openPalette: () => {} });

export const useShortcuts = () => useContext(ShortcutsContext);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAnyPermission } = usePermissions();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette works everywhere, even inside inputs.
      const palette = GLOBAL_SHORTCUTS.find((s) => s.id === "global-palette")!;
      if (matchesCombo(e, palette.combo)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      // Everything else is ignored while typing so it never disrupts data entry.
      if (isTypingTarget(e.target)) return;

      // Help
      const help = GLOBAL_SHORTCUTS.find((s) => s.id === "global-help")!;
      if (matchesCombo(e, help.combo)) {
        e.preventDefault();
        navigate("/shortcuts");
        return;
      }

      // Create new in current module (Alt+Shift+N)
      const newCombo = GLOBAL_SHORTCUTS.find((s) => s.id === "global-new")!;
      if (matchesCombo(e, newCombo.combo)) {
        const match = QUICK_CREATE_SHORTCUTS.find(
          (s) => s.url === location.pathname && hasAnyPermission(s.permissions),
        );
        if (match) {
          e.preventDefault();
          navigate(`${match.url}?quickAction=${match.quickAction}`, { replace: true });
        }
        return;
      }

      // Navigation shortcuts
      for (const s of NAVIGATION_SHORTCUTS) {
        if (matchesCombo(e, s.combo) && hasAnyPermission(s.permissions) && s.url) {
          e.preventDefault();
          navigate(s.url);
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, location.pathname, hasAnyPermission]);

  return (
    <ShortcutsContext.Provider value={{ openPalette }}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </ShortcutsContext.Provider>
  );
}
