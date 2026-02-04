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
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', 
    prefix: '+' 
  },
  stable: { 
    icon: Minus, 
    className: 'bg-muted text-muted-foreground', 
    prefix: '' 
  },
  declining: { 
    icon: TrendingDown, 
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', 
    prefix: '' 
  },
  dropping: { 
    icon: TrendingDown, 
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', 
    prefix: '' 
  },
  new: { 
    icon: Sparkles, 
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', 
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
