
import { Badge } from "@/components/ui/badge";
import { useProductStockSummary } from "@/hooks/useWarehouseStock";

interface StockStatusBadgeProps {
  productId: string;
  showWarehouseBreakdown?: boolean;
  className?: string;
}

export function StockStatusBadge({ 
  productId, 
  showWarehouseBreakdown = false, 
  className 
}: StockStatusBadgeProps) {
  const { data: productSummaries, isLoading } = useProductStockSummary();

  if (isLoading) {
    return <Badge variant="outline" className={className}>Loading...</Badge>;
  }

  const productStock = productSummaries?.find(p => p.product_id === productId);
  
  if (!productStock || productStock.total_stock <= 0) {
    return <Badge variant="destructive" className={className}>Out of Stock</Badge>;
  }

  const { total_stock, warehouse_stocks, unit_of_measurement } = productStock;

  const getBadgeVariant = (stock: number) => {
    if (stock <= 0) return "destructive";
    if (stock <= 10) return "secondary";
    return "default";
  };

  if (showWarehouseBreakdown && warehouse_stocks.length > 1) {
    return (
      <div className="space-y-1">
        <Badge variant={getBadgeVariant(total_stock)} className={className}>
          Total: {total_stock} {unit_of_measurement}
        </Badge>
        <div className="flex flex-wrap gap-1">
          {warehouse_stocks
            .filter(ws => ws.quantity > 0)
            .map((ws) => (
              <Badge 
                key={ws.warehouse_id} 
                variant="outline" 
                className="text-xs"
              >
                {ws.warehouse_name}: {ws.quantity}
              </Badge>
            ))}
        </div>
      </div>
    );
  }

  return (
    <Badge variant={getBadgeVariant(total_stock)} className={className}>
      {total_stock} {unit_of_measurement}
    </Badge>
  );
}
