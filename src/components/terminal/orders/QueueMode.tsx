import { useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { OrderDetailWorkspace } from './OrderDetailWorkspace';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { mapToOperationalStatus } from '@/lib/orderStatusMapper';
import { useTerminalHotkeys } from '@/hooks/useTerminalHotkeys';

interface Props {
  /** Already-fetched, already-jurisdiction-filtered orders from TerminalOrders. */
  orders: P2POrderRecord[];
  onClose: () => void;
}

/** Compute an order's expiry timestamp (payment deadline) for queue ordering. */
function expiryOf(o: P2POrderRecord): number {
  const end = (o as any)._notifyPayEndTime as number | undefined;
  if (end && end > 0) return end;
  const created = typeof o.binance_create_time === 'number'
    ? o.binance_create_time
    : o.binance_create_time ? new Date(o.binance_create_time).getTime() : 0;
  const mins = (o as any)._notifyPayedExpireMinute as number | undefined;
  if (created && mins && mins > 0) return created + mins * 60 * 1000;
  return created || Number.MAX_SAFE_INTEGER;
}

/**
 * Queue Mode — steps an operator through actionable orders one at a time using
 * the EXISTING OrderDetailWorkspace. Reuses the same "active" predicate as the
 * Active status tab, sorts by expiry ascending, and auto-advances when the
 * current order leaves the actionable set (via the parent's polling refresh).
 */
export function QueueMode({ orders, onClose }: Props) {
  const queue = useMemo(() => {
    return orders
      .filter((o) => {
        const op = mapToOperationalStatus((o as any)._resolvedStatus || o.order_status, o.trade_type);
        return !['Completed', 'Cancelled', 'Expired'].includes(op);
      })
      .sort((a, b) => expiryOf(a) - expiryOf(b));
  }, [orders]);

  const [currentId, setCurrentId] = useState<string | null>(null);

  // Keep the current pointer valid as the queue re-derives on each poll.
  useEffect(() => {
    if (queue.length === 0) { setCurrentId(null); return; }
    setCurrentId((prev) => {
      if (prev && queue.some((o) => o.binance_order_number === prev)) return prev;
      return queue[0].binance_order_number; // auto-advance to next available
    });
  }, [queue]);

  const index = queue.findIndex((o) => o.binance_order_number === currentId);
  const current = index >= 0 ? queue[index] : null;

  const step = (dir: 1 | -1) => {
    if (queue.length === 0) return;
    const next = index + dir;
    if (next < 0 || next >= queue.length) return;
    setCurrentId(queue[next].binance_order_number);
  };

  useTerminalHotkeys({ onPrev: () => step(-1), onNext: () => step(1), enabled: !!current });

  if (!current) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={ListChecks} title="Queue clear" description="No actionable orders right now. New orders appear here automatically." />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 md:px-4 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] t-mono uppercase tracking-wide text-muted-foreground">
            Queue · {index + 1} of {queue.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => step(-1)}
            disabled={index <= 0}
            className="h-6 px-2 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
          >
            Prev
          </button>
          <button
            onClick={() => step(1)}
            disabled={index >= queue.length - 1}
            className="h-6 px-2 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
          >
            Next
          </button>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">auto-advances on settle</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <OrderDetailWorkspace
          key={current.binance_order_number}
          order={current}
          onStepOrder={step}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
