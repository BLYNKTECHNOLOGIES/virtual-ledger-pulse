import type { ReactNode } from "react";
import { useOrderActors, OrderActor } from "@/hooks/useOrderActors";
import { Skeleton } from "@/components/ui/skeleton";
import { User, UserCheck, Banknote, FileText, CreditCard, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/components/orders-ui";

interface TransactionActorsCardProps {
  orderId: string | undefined;
  orderStatus?: string;
  className?: string;
}

// Icon mapping for each action type
const ACTION_ICONS: Record<string, React.ElementType> = {
  'order_created': User,
  'banking_collected': Banknote,
  'pan_collected': FileText,
  'added_to_bank': CreditCard,
  'payment_created': CreditCard,
  'payment_completed': CreditCard,
  'order_completed': CheckCircle,
  'order_cancelled': XCircle,
  'order_edited': FileText,
  'manual_entry_created': User,
};

// Colour only where it carries meaning: the step that closed the order.
const ACTION_TONE: Record<string, string> = {
  'payment_completed': 'text-success',
  'order_completed': 'text-success',
  'order_cancelled': 'text-destructive',
};

/** "Banking Collected By" → "Banking collected by"; acronyms (PAN) stay; raw action types read as words. */
function sentenceCase(label: string) {
  const words = String(label || "").replace(/_/g, " ").trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

function ActorRow({ actor, last }: { actor: OrderActor; last: boolean }) {
  const Icon = ACTION_ICONS[actor.actionType] || UserCheck;
  const tone = ACTION_TONE[actor.actionType] || 'text-muted-foreground';
  const label = sentenceCase(actor.actionLabel);
  const byLabel = / by$/i.test(label);

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <span aria-hidden className="absolute bottom-0 left-[11px] top-7 w-px bg-border" />}
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card", tone)} aria-hidden>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <div className="min-w-0 break-words text-[13px] leading-5 text-muted-foreground">
            {label}
            {byLabel ? " " : <span aria-hidden> · </span>}
            {/* Username derived from User ID - primary display */}
            <span className="font-medium text-foreground">{actor.actorName}</span>
          </div>
          <time dateTime={actor.recordedAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmtDateTime(actor.recordedAt)}
          </time>
        </div>
        {/* User ID kept as quiet secondary info for audit/traceability */}
        {actor.actorUserId && (
          <div className="text-[11px] leading-4 text-muted-foreground" title={actor.actorUserId}>
            User ID <span className="font-mono">{actor.actorUserId.slice(0, 8)}</span>
          </div>
        )}
      </div>
    </li>
  );
}

function ActorsSection({ count, className, children }: { count?: number; className?: string; children: ReactNode }) {
  return (
    <section className={cn("min-w-0 space-y-2.5", className)}>
      <h3 className="flex flex-wrap items-baseline gap-x-1.5 !text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Transaction actors
        {count !== undefined && (
          <span className="text-xs font-normal normal-case tracking-normal">
            · {count} {count === 1 ? 'action' : 'actions'}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/**
 * Displays actor ownership information directly on completed/cancelled/expired transactions.
 * Shows who performed each major action with exact timestamps.
 */
export function TransactionActorsCard({ orderId, orderStatus, className }: TransactionActorsCardProps) {
  const { data: actors, isLoading, error } = useOrderActors(orderId);

  // Only show for terminal states
  const isTerminalState = ['completed', 'cancelled', 'expired', 'COMPLETED', 'CANCELLED', 'EXPIRED']
    .includes(orderStatus?.toUpperCase() || '');

  if (!isTerminalState) {
    return null;
  }

  if (isLoading) {
    return (
      <ActorsSection className={className}>
        <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading transaction actors">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </ActorsSection>
    );
  }

  if (error || !actors || actors.allActors.length === 0) {
    return (
      <ActorsSection className={className}>
        <div className="text-xs text-muted-foreground">
          No actor information recorded for this transaction.
        </div>
      </ActorsSection>
    );
  }

  // Define the display order for actions
  const displayOrder = [
    'order_created',
    'manual_entry_created',
    'banking_collected',
    'pan_collected',
    'added_to_bank',
    'payment_created',
    'payment_completed',
    'order_edited',
    'order_completed',
    'order_cancelled',
  ];

  // Sort actors by display order
  const sortedActors = [...actors.allActors].sort((a, b) => {
    const aIndex = displayOrder.indexOf(a.actionType);
    const bIndex = displayOrder.indexOf(b.actionType);
    // If not in displayOrder, put at end sorted by timestamp
    if (aIndex === -1 && bIndex === -1) {
      return new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime();
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <ActorsSection count={sortedActors.length} className={className}>
      <ol className="min-w-0">
        {sortedActors.map((actor, index) => (
          <ActorRow key={`${actor.actionType}-${index}`} actor={actor} last={index === sortedActors.length - 1} />
        ))}
      </ol>
    </ActorsSection>
  );
}
