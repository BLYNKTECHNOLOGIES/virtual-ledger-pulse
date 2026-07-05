import { useEffect } from 'react';

export interface TerminalHotkeyHandlers {
  /** Move to the previous item (K / ArrowLeft). */
  onPrev?: () => void;
  /** Move to the next item (J / ArrowRight). */
  onNext?: () => void;
  /** Master enable flag (e.g. only while an order/queue view is open). */
  enabled?: boolean;
}

const QUICK_REPLY_EVENT = 'terminal-hotkey-quickreply';

/** Fired by ChatPanel-side listeners to insert the Nth quick reply. */
export function subscribeQuickReplyHotkey(cb: (index: number) => void): () => void {
  const handler = (e: Event) => {
    const idx = (e as CustomEvent<number>).detail;
    if (typeof idx === 'number') cb(idx);
  };
  window.addEventListener(QUICK_REPLY_EVENT, handler);
  return () => window.removeEventListener(QUICK_REPLY_EVENT, handler);
}

/**
 * Terminal keyboard shortcuts (never bound to money-moving actions):
 *   J / ArrowRight → next     K / ArrowLeft → previous
 *   /              → focus the chat input
 *   1–9            → INSERT (not send) the matching per-user quick reply
 * Disabled while typing in inputs/textareas/contenteditable (except "/" which
 * only focuses, and only when not already typing).
 */
export function useTerminalHotkeys({ onPrev, onNext, enabled = true }: TerminalHotkeyHandlers) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;

      if (e.key === '/') {
        const el = document.querySelector('[data-terminal-chat-input]') as HTMLElement | null;
        if (el) { e.preventDefault(); el.focus(); }
        return;
      }
      if (e.key === 'j' || e.key === 'J' || e.code === 'ArrowRight') {
        if (onNext) { e.preventDefault(); onNext(); }
        return;
      }
      if (e.key === 'k' || e.key === 'K' || e.code === 'ArrowLeft') {
        if (onPrev) { e.preventDefault(); onPrev(); }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent<number>(QUICK_REPLY_EVENT, { detail: Number(e.key) - 1 }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPrev, onNext, enabled]);
}
