
import { useToast } from "@/hooks/use-toast";
import { validateProductStock, ValidationError } from "@/utils/validations";

export function useStockValidation() {
  const { toast } = useToast();

  const validateStock = async (productId: string, warehouseId: string, requiredQuantity: number): Promise<boolean> => {
    try {
      await validateProductStock(productId, warehouseId, requiredQuantity);
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        toast({
          title: "Stock Validation Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to validate stock quantity",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  return { validateStock };
}
