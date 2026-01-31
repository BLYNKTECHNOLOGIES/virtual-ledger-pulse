import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BuyOrderStatus, BUY_ORDER_STATUS_CONFIG } from "@/lib/buy-order-types";

interface BuyOrderStatusFilterProps {
  selectedStatus: BuyOrderStatus | 'all';
  onStatusChange: (status: BuyOrderStatus | 'all') => void;
  statusCounts?: Partial<Record<BuyOrderStatus | 'all', number>>;
}

export function BuyOrderStatusFilter({
  selectedStatus,
  onStatusChange,
  statusCounts = {},
}: BuyOrderStatusFilterProps) {
  const statuses: (BuyOrderStatus | 'all')[] = [
    'all',
    'new',
    'banking_collected',
    'pan_collected',
    'added_to_bank',
    'paid',
    'completed',
    'cancelled',
  ];

  const getStatusLabel = (status: BuyOrderStatus | 'all'): string => {
    if (status === 'all') return 'All Orders';
    return BUY_ORDER_STATUS_CONFIG[status]?.label || status;
  };

  const getStatusColor = (status: BuyOrderStatus | 'all'): string => {
    if (status === 'all') return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    const config = BUY_ORDER_STATUS_CONFIG[status];
    return config?.color || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {statuses.map((status) => {
        const count = statusCounts[status] || 0;
        const isSelected = selectedStatus === status;
        
        return (
          <Button
            key={status}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onStatusChange(status)}
            className={cn(
              "flex items-center gap-2",
              isSelected && status !== 'all' && getStatusColor(status)
            )}
          >
            {getStatusLabel(status)}
            {count > 0 && (
              <Badge 
                variant="secondary" 
                className={cn(
                  "ml-1 h-5 min-w-[20px] flex items-center justify-center",
                  isSelected ? "bg-white/20" : ""
                )}
              >
                {count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
