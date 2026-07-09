import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { useNotificationMute } from "@/hooks/useNotificationMute";
import { TerminalCommandPalette } from "@/components/terminal/TerminalCommandPalette";
import { TerminalShortcutsOverlay } from "@/components/terminal/TerminalShortcutsOverlay";
import { focusPageSearch } from "@/lib/focus-page-search";
import { matchesCombo } from "@/config/shortcuts";
import {
  TERMINAL_NAVIGATION_SHORTCUTS, TERMINAL_GOTO_SHORTCUTS, TERMINAL_SYSTEM_SHORTCUTS,
} from "@/config/terminal-shortcuts";
import {
  dispatchTerminalContextKey, dispatchQuickReplyHotkey, type TerminalContextKey,
} from "@/hooks/useTerminalHotkeys";

interface TerminalShortcutsContextValue {
  openPalette: () => void;
  openShortcutsHelp: () => void;
  focusPageSearch: () => boolean;
}

const TerminalShortcutsContext = createContext<TerminalShortcutsContextValue>({
  openPalette: () => {},
  openShortcutsHelp: () => {},
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

/** True while any Radix dialog / sheet / alert-dialog / popover is open. */
function isOverlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[data-radix-popper-content-wrapper]',
  );
}

const sys = (id: string) => TERMINAL_SYSTEM_SHORTCUTS.find((s) => s.id === id)!.combo!;

function quickReplyIndexFromHotkey(e: KeyboardEvent): number | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const digit = e.code.startsWith("Digit") ? e.code.slice(5) : e.code.startsWith("Numpad") ? e.code.slice(6) : "";
  if (!/^[1-9]$/.test(digit)) return null;
  return Number(digit) - 1;
}

export function TerminalShortcutsProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { hasAnyPermission } = useTerminalAuth();
  const { isMuted, toggleMute } = useNotificationMute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Latest mute state for the keydown handler without re-binding the listener.
  const muteRef = useRef({ isMuted, toggleMute });
  muteRef.current = { isMuted, toggleMute };
  // "g" go-to sequence buffer.
  const gotoTimerRef = useRef<number | null>(null);
  const gotoActiveRef = useRef(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openShortcutsHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    const clearGoto = () => {
      gotoActiveRef.current = false;
      if (gotoTimerRef.current) { window.clearTimeout(gotoTimerRef.current); gotoTimerRef.current = null; }
    };

    const handler = (e: KeyboardEvent) => {
      // Command palette works everywhere, even inside inputs (existing behaviour).
      if (matchesCombo(e, sys("t-sys-palette"))) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      // Esc: close help → let overlays self-close → blur focused input →
      // otherwise step back from an open order to the list.
      if (e.key === "Escape") {
        if (helpOpen) { setHelpOpen(false); return; }
        if (isOverlayOpen()) { clearGoto(); return; }
        const active = document.activeElement as HTMLElement | null;
        if (active && isTypingTarget(active)) { active.blur(); clearGoto(); return; }
        clearGoto();
        dispatchTerminalContextKey("orders-back");
        return;
      }

      // Alt+1–Alt+9 → insert the matching per-user quick reply into the chat
      // composer (never auto-sends). Plain number keys remain available for
      // normal message entry, including while the composer is focused.
      const quickReplyIndex = quickReplyIndexFromHotkey(e);
      if (quickReplyIndex !== null) {
        if (isOverlayOpen()) { clearGoto(); return; }
        e.preventDefault();
        clearGoto();
        dispatchQuickReplyHotkey(quickReplyIndex);
        return;
      }

      // Everything else is ignored while typing so it never disrupts data entry.
      if (isTypingTarget(e.target)) { clearGoto(); return; }

      // Suspend ALL non-Esc shortcuts while a dialog/sheet/popover is open.
      if (isOverlayOpen()) { clearGoto(); return; }

      // "?" toggles the help overlay (Shift+/).
      if (matchesCombo(e, sys("t-sys-help"))) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }

      // Shift+D — toggle the notification master mute (non-destructive).
      if (matchesCombo(e, sys("t-sys-mute"))) {
        e.preventDefault();
        muteRef.current.toggleMute();
        toast(muteRef.current.isMuted ? "Notifications unmuted" : "Notifications muted");
        return;
      }

      // "/" focuses the current page's search box; if there's none (e.g. inside
      // an open order), fall back to focusing the order chat composer.
      if (matchesCombo(e, sys("t-sys-page-search"))) {
        if (focusPageSearch()) { e.preventDefault(); return; }
        const chat = document.querySelector('[data-terminal-chat-input]') as HTMLElement | null;
        if (chat) { e.preventDefault(); chat.focus(); }
        return;
      }

      // Go-to sequences: "g" then a letter within 600ms.
      if (gotoActiveRef.current) {
        const target = TERMINAL_GOTO_SHORTCUTS.find((s) => s.goToKey === e.key.toLowerCase());
        clearGoto();
        if (target?.url) { e.preventDefault(); navigate(target.url); }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        gotoActiveRef.current = true;
        gotoTimerRef.current = window.setTimeout(clearGoto, 600);
        return;
      }

      // Navigation shortcuts — permission gated, identical to sidebar rules.
      for (const s of TERMINAL_NAVIGATION_SHORTCUTS) {
        if (
          s.combo && matchesCombo(e, s.combo) && s.url &&
          (s.permissions.length === 0 || hasAnyPermission(s.permissions))
        ) {
          e.preventDefault();
          navigate(s.url);
          return;
        }
      }

      // Page-scoped context keys — dispatched onto the context bus; the mounted
      // orders list / order detail component decides whether it applies.
      const ctx = matchContextKey(e);
      if (ctx) { e.preventDefault(); dispatchTerminalContextKey(ctx); }
    };

    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); clearGoto(); };
  }, [navigate, hasAnyPermission, helpOpen]);

  return (
    <TerminalShortcutsContext.Provider value={{ openPalette, openShortcutsHelp, focusPageSearch }}>
      {children}
      <TerminalCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TerminalShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </TerminalShortcutsContext.Provider>
  );
}

/** Map a plain keypress to a page-scoped context key (no modifiers except Shift+C). */
function matchContextKey(e: KeyboardEvent): TerminalContextKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.shiftKey) {
    if (e.code === "KeyC") return "detail-copy-fiat";
    return null;
  }
  switch (e.key) {
    case "j": case "J": return "orders-down";
    case "k": case "K": return "orders-up";
    case "ArrowRight": return "orders-down";
    case "ArrowLeft": return "orders-up";
    case "o": case "O": return "orders-open";
    case "Enter": {
      // Don't hijack Enter when a button/link is focused — let it activate normally.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button")) return null;
      return "orders-open";
    }
    case "[": return "orders-prev-tab";
    case "]": return "orders-next-tab";
    case "f": case "F": return "orders-search";
    case "r": case "R": return "orders-refresh";
    case "u": case "U": return "orders-back";
    case "c": case "C": return "detail-copy-order";
    case "i": case "I": return "detail-internal-chat";
    case "a": case "A": return "detail-actions";
    default: return null;
  }
}
