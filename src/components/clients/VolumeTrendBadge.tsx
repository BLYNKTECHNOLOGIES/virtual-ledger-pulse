import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { VolumeTrend } from "@/hooks/useClientTypeFromOrders";

interface VolumeTrendBadgeProps {
  trend: VolumeTrend;
  changePercent: number | null;
}

const trendConfig: Record<VolumeTrend, { 
  icon: typeof TrendingUp; 
  className: string; 
  prefix: string;
}> = {
  growing: { 
    icon: TrendingUp, 
    className: 'bg-success/10 text-success border-success/20 dark:bg-green-900/30 dark:text-green-400', 
    prefix: '+' 
  },
  stable: { 
    icon: Minus, 
    className: 'bg-muted text-muted-foreground', 
    prefix: '' 
  },
  declining: { 
    icon: TrendingDown, 
    className: 'bg-warning/10 text-warning border-warning/20 dark:bg-yellow-900/30 dark:text-yellow-400', 
    prefix: '' 
  },
  dropping: { 
    icon: TrendingDown, 
    className: 'bg-destructive/10 text-destructive border-destructive/20 dark:bg-red-900/30 dark:text-red-400', 
    prefix: '' 
  },
  new: { 
    icon: Sparkles, 
    className: 'bg-info/10 text-info border-info/20 dark:bg-blue-900/30 dark:text-blue-400', 
    prefix: '' 
  },
};

export function VolumeTrendBadge({ trend, changePercent }: VolumeTrendBadgeProps) {
  const config = trendConfig[trend];
  const Icon = config.icon;
  
  return (
    <Badge className={`gap-1 font-medium ${config.className}`}>
      <Icon className="h-3 w-3" />
      {trend === 'new' ? (
        'New'
      ) : changePercent !== null ? (
        `${config.prefix}${changePercent.toFixed(0)}%`
      ) : (
        'N/A'
      )}
    </Badge>
  );
}
