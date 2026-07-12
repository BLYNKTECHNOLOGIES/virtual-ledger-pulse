import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

const TerminalOrders = lazy(() => import('./TerminalOrders'));
const TerminalDashboard = lazy(() => import('./TerminalDashboard'));

/**
 * Default terminal landing.
 *
 * Operators land directly on the Orders (active orders) page — this avoids the
 * Dashboard's heavy full-history sync on every login. The complete order
 * history is only fetched when the operator explicitly opens the Dashboard.
 *
 * Users without `terminal_orders_view` (e.g. dashboard-only roles) fall back to
 * the Dashboard, which enforces its own permission gate.
 */
export default function TerminalLanding() {
  const { hasPermission, isTerminalAdmin, isLoading } = useTerminalAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canViewOrders = hasPermission('terminal_orders_view') || isTerminalAdmin;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {canViewOrders ? <TerminalOrders /> : <TerminalDashboard />}
    </Suspense>
  );
}
