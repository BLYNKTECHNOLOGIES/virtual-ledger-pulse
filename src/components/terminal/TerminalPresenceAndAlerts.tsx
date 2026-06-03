import { useTerminalPresence } from '@/hooks/useTerminalPresence';
import { useInactiveAssigneeAlerts } from '@/hooks/useInactiveAssigneeAlerts';
import { useAutoMarkSmallSalesRead } from '@/hooks/useAutoMarkSmallSalesRead';

/**
 * Invisible component that runs presence heartbeat and inactive assignee alert checks.
 * Must be rendered inside TerminalAuthProvider.
 */
export function TerminalPresenceAndAlerts() {
  useTerminalPresence();
  useInactiveAssigneeAlerts();
  useAutoMarkSmallSalesRead();
  return null;
}
