import { useEffect, useRef } from 'react';
import {
  getAlertPrefs, isAlertEnabled, playTone, fireBrowserNotification,
  setUnreadIndicator, clearUnreadIndicator,
} from '@/lib/terminal-alerts';

export interface TerminalAlertInputs {
  /** IDs of currently actionable (active, non-terminal) orders. */
  actionableOrderIds: string[];
  /** IDs of orders currently in appeal/dispute. */
  appealOrderIds: string[];
  /** Total unread incoming chat messages across visible orders. */
  unreadMessageCount: number;
}

/**
 * Tab-open-scoped terminal alert engine. Consumes already-fetched order/chat
 * data (no fetching of its own) and, on NEW actionable order / NEW appeal /
 * rising unread-message count, fires: a browser notification (when the tab is
 * hidden + permission granted), a WebAudio beep, a document.title unread prefix,
 * and an app badge. Title/badge are cleared when the tab regains focus.
 * Per-type mutes are honoured via localStorage prefs.
 */
export function useTerminalAlerts({ actionableOrderIds, appealOrderIds, unreadMessageCount }: TerminalAlertInputs) {
  const prevOrders = useRef<Set<string> | null>(null);
  const prevAppeals = useRef<Set<string> | null>(null);
  const prevUnread = useRef<number | null>(null);

  // New actionable orders
  useEffect(() => {
    const current = new Set(actionableOrderIds);
    if (prevOrders.current === null) { prevOrders.current = current; return; }
    const fresh = actionableOrderIds.filter((id) => !prevOrders.current!.has(id));
    prevOrders.current = current;
    if (fresh.length > 0 && isAlertEnabled(getAlertPrefs(), 'orders')) {
      playTone('orders');
      fireBrowserNotification(
        fresh.length === 1 ? 'New order' : `${fresh.length} new orders`,
        fresh.length === 1 ? `Order …${fresh[0].slice(-8)} needs action` : 'Multiple orders need action',
      );
    }
  }, [actionableOrderIds]);

  // New appeals
  useEffect(() => {
    const current = new Set(appealOrderIds);
    if (prevAppeals.current === null) { prevAppeals.current = current; return; }
    const fresh = appealOrderIds.filter((id) => !prevAppeals.current!.has(id));
    prevAppeals.current = current;
    if (fresh.length > 0 && isAlertEnabled(getAlertPrefs(), 'appeals')) {
      playTone('appeals');
      fireBrowserNotification('New appeal', `Order …${fresh[0].slice(-8)} is under appeal`);
    }
  }, [appealOrderIds]);

  // Rising unread messages
  useEffect(() => {
    if (prevUnread.current === null) { prevUnread.current = unreadMessageCount; return; }
    const rose = unreadMessageCount > prevUnread.current;
    prevUnread.current = unreadMessageCount;
    if (rose && isAlertEnabled(getAlertPrefs(), 'messages')) {
      playTone('messages');
      fireBrowserNotification('New message', 'You have a new counterparty message');
    }
  }, [unreadMessageCount]);

  // Tab title + app badge reflect unread messages; cleared on focus.
  useEffect(() => {
    if (!document.hidden) return;
    setUnreadIndicator(unreadMessageCount);
  }, [unreadMessageCount]);

  useEffect(() => {
    const onFocus = () => clearUnreadIndicator();
    const onVisible = () => { if (!document.hidden) clearUnreadIndicator(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearUnreadIndicator();
    };
  }, []);
}
