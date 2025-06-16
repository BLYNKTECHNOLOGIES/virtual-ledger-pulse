
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useWarehouseStock } from "@/hooks/useWarehouseStock";

interface WarehouseSelectorProps {
  productId?: string;
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  showStockInfo?: boolean;
}

export function WarehouseSelector({
  productId,
  value,
  onValueChange,
  label = "Warehouse",
  placeholder = "Select warehouse",
  showStockInfo = false
}: WarehouseSelectorProps) {
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: warehouseStock } = useWarehouseStock();

  const getWarehouseStock = (warehouseId: string) => {
    if (!productId || !warehouseStock) return null;
    
    const stock = warehouseStock.find(
      s => s.warehouse_id === warehouseId && s.product_id === productId
    );
    
    return stock?.quantity || 0;
  };

  return (
    <div>
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {warehouses?.map((warehouse) => {
            const stockQuantity = showStockInfo && productId ? getWarehouseStock(warehouse.id) : null;
            
            return (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{warehouse.name}</span>
                  {showStockInfo && stockQuantity !== null && (
                    <Badge variant={stockQuantity > 0 ? "default" : "secondary"} className="ml-2">
                      {stockQuantity}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
