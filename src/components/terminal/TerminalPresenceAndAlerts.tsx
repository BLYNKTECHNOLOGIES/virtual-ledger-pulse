import { useTerminalPresence } from '@/hooks/useTerminalPresence';
import { useInactiveAssigneeAlerts } from '@/hooks/useInactiveAssigneeAlerts';
import { useAutoMarkSmallTradesRead } from '@/hooks/useAutoMarkSmallTradesRead';

/**
 * Invisible component that runs presence heartbeat and inactive assignee alert checks.
 * Must be rendered inside TerminalAuthProvider.
 */
export function TerminalPresenceAndAlerts() {
  useTerminalPresence();
  useInactiveAssigneeAlerts();
  useAutoMarkSmallTradesRead();
  return null;
}
