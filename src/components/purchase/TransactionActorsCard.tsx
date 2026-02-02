import { useOrderActors, OrderActor } from "@/hooks/useOrderActors";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Clock, UserCheck, Banknote, FileText, CreditCard, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

// Color mapping for action types
const ACTION_COLORS: Record<string, string> = {
  'order_created': 'text-blue-500',
  'banking_collected': 'text-purple-500',
  'pan_collected': 'text-indigo-500',
  'added_to_bank': 'text-orange-500',
  'payment_created': 'text-emerald-500',
  'payment_completed': 'text-emerald-600',
  'order_completed': 'text-green-500',
  'order_cancelled': 'text-red-500',
};

function ActorRow({ actor }: { actor: OrderActor }) {
  const Icon = ACTION_ICONS[actor.actionType] || UserCheck;
  const colorClass = ACTION_COLORS[actor.actionType] || 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 py-2">
      <div className={cn("mt-0.5", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{actor.actionLabel}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {/* Username derived from User ID - primary display */}
          <span className="text-sm text-foreground font-medium">
            {actor.actorName}
          </span>
          {/* User ID shown as subtle secondary info for audit/traceability */}
          {actor.actorUserId && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded" title={actor.actorUserId}>
              ID: {actor.actorUserId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {actor.formattedTime}
          </span>
        </div>
      </div>
    </div>
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
      <div className={cn("border rounded-lg p-4 bg-muted/30 space-y-3", className)}>
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Transaction Actors</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (error || !actors || actors.allActors.length === 0) {
    return (
      <div className={cn("border rounded-lg p-4 bg-muted/30", className)}>
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Transaction Actors</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          No actor information recorded for this transaction.
        </p>
      </div>
    );
  }

  // Define the display order for actions
  const displayOrder = [
    'order_created',
    'banking_collected',
    'pan_collected',
    'added_to_bank',
    'payment_created',
    'payment_completed',
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
    <div className={cn("border rounded-lg p-4 bg-muted/30", className)}>
      <div className="flex items-center gap-2 mb-2">
        <UserCheck className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Transaction Actors</span>
        <span className="text-xs text-muted-foreground">
          ({sortedActors.length} {sortedActors.length === 1 ? 'action' : 'actions'})
        </span>
      </div>

      <div className="divide-y divide-border">
        {sortedActors.map((actor, index) => (
          <ActorRow key={`${actor.actionType}-${index}`} actor={actor} />
        ))}
      </div>
    </div>
  );
}
