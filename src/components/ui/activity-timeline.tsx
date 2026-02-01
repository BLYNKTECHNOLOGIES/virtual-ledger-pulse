import { useState } from "react";
import { useActivityTimeline } from "@/hooks/useActivityTimeline";
import { ChevronDown, ChevronUp, Clock, User, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ActivityTimelineProps {
  entityId: string | undefined;
  entityType?: string;
  showOnlyForStatuses?: string[];
  currentStatus?: string;
  className?: string;
  defaultExpanded?: boolean;
  title?: string;
}

export function ActivityTimeline({
  entityId,
  entityType,
  showOnlyForStatuses,
  currentStatus,
  className,
  defaultExpanded = false,
  title = "Activity History",
}: ActivityTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { data: activities, isLoading } = useActivityTimeline(entityId, entityType);

  // If showOnlyForStatuses is provided, only show for those statuses
  if (showOnlyForStatuses && currentStatus) {
    const normalizedStatus = currentStatus.toUpperCase();
    if (!showOnlyForStatuses.map(s => s.toUpperCase()).includes(normalizedStatus)) {
      return null;
    }
  }

  // Don't render if no entity ID
  if (!entityId) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("border rounded-lg p-4 bg-muted/30", className)}>
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  // No activities
  if (!activities || activities.length === 0) {
    return (
      <div className={cn("border rounded-lg p-4 bg-muted/30", className)}>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg bg-muted/30", className)}>
      {/* Header - Always visible */}
      <Button
        variant="ghost"
        className="w-full justify-between p-4 h-auto font-normal hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-muted-foreground">
            ({activities.length} {activities.length === 1 ? 'event' : 'events'})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Timeline content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            {/* Activity items */}
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div key={activity.id} className="relative pl-6">
                  {/* Dot */}
                  <div 
                    className={cn(
                      "absolute left-0 top-1.5 w-[14px] h-[14px] rounded-full border-2 bg-background",
                      index === activities.length - 1 
                        ? "border-primary bg-primary" 
                        : "border-muted-foreground"
                    )}
                  />

                  {/* Content */}
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <span className="font-medium text-sm">{activity.actionLabel}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {activity.formattedTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {activity.userName}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline version for showing in tables or cards
export function ActivityTimelineInline({
  entityId,
  entityType,
  showLatest = 1,
}: {
  entityId: string | undefined;
  entityType?: string;
  showLatest?: number;
}) {
  const { data: activities, isLoading } = useActivityTimeline(entityId, entityType);

  if (isLoading || !activities || activities.length === 0) {
    return null;
  }

  const latestActivities = activities.slice(-showLatest);

  return (
    <div className="space-y-1">
      {latestActivities.map((activity) => (
        <div key={activity.id} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            {activity.actionLabel} by {activity.userName} • {activity.formattedTime}
          </span>
        </div>
      ))}
    </div>
  );
}
