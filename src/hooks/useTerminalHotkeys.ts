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

/** Dispatch a quick-reply insert (0-based index). Consumed by ChatPanel. */
export function dispatchQuickReplyHotkey(index: number) {
  window.dispatchEvent(new CustomEvent<number>(QUICK_REPLY_EVENT, { detail: index }));
}

/** Fired by ChatPanel-side listeners to insert the Nth quick reply. */
export function subscribeQuickReplyHotkey(cb: (index: number) => void): () => void {
  const handler = (e: Event) => {
    const idx = (e as CustomEvent<number>).detail;
    if (typeof idx === 'number') cb(idx);
  };
  window.addEventListener(QUICK_REPLY_EVENT, handler);
  return () => window.removeEventListener(QUICK_REPLY_EVENT, handler);
}

/* ------------------------------------------------------------------ *
 * Context-key bus — the central TerminalShortcutsProvider listener      *
 * dispatches page-scoped context keys through this bus so page          *
 * components (orders list / order detail / chat) can react WITHOUT      *
 * registering their own parallel window keydown listeners.              *
 * ------------------------------------------------------------------ */
const CONTEXT_KEY_EVENT = 'terminal-hotkey-context';

export type TerminalContextKey =
  | 'orders-down' | 'orders-up' | 'orders-open' | 'orders-prev-tab'
  | 'orders-next-tab' | 'orders-search' | 'orders-refresh' | 'orders-back'
  | 'detail-copy-order' | 'detail-copy-fiat' | 'detail-internal-chat'
  | 'detail-actions' | 'detail-esc';

/** Dispatch a context key. Returns nothing; consumers decide relevance. */
export function dispatchTerminalContextKey(key: TerminalContextKey) {
  window.dispatchEvent(new CustomEvent<TerminalContextKey>(CONTEXT_KEY_EVENT, { detail: key }));
}

/** Subscribe to context keys (used by page components that own the state). */
export function subscribeTerminalContextKey(cb: (key: TerminalContextKey) => void): () => void {
  const handler = (e: Event) => {
    const key = (e as CustomEvent<TerminalContextKey>).detail;
    if (key) cb(key);
  };
  window.addEventListener(CONTEXT_KEY_EVENT, handler);
  return () => window.removeEventListener(CONTEXT_KEY_EVENT, handler);
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
