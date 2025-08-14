import { useToast } from "@/hooks/use-toast";
import { ValidationError, validateBankAccountBalance, validateProductStock, validatePaymentMethodUsage } from "@/utils/validations";

export function useValidation() {
  const { toast } = useToast();

  const validateBankBalance = async (bankAccountId: string, debitAmount: number): Promise<boolean> => {
    try {
      await validateBankAccountBalance(bankAccountId, debitAmount);
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        toast({
          title: "Bank Account Balance Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Validation Error",
          description: "Failed to validate bank account balance",
          variant: "destructive",
        });
      }
      return false;
    }
  };

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
          title: "Validation Error",
          description: "Failed to validate stock quantity",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const validatePaymentLimit = async (paymentMethodId: string, amount: number): Promise<boolean> => {
    try {
      await validatePaymentMethodUsage(paymentMethodId, amount);
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        toast({
          title: "Payment Limit Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Validation Error",
          description: "Failed to validate payment limit",
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const validatePositiveNumber = (value: number, fieldName: string): boolean => {
    if (value < 0) {
      toast({
        title: "Negative Value Error",
        description: `${fieldName} cannot be negative`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleDatabaseError = (error: any) => {
    if (error.message?.includes('It cannot be negative check previous entries and balances again!')) {
      toast({
        title: "Balance/Stock Error",
        description: "It cannot be negative check previous entries and balances again!",
        variant: "destructive",
      });
    } else if (error.message?.includes('cannot be negative')) {
      toast({
        title: "Validation Error",
        description: error.message,
        variant: "destructive",
      });
    } else if (error.message?.includes('check constraint')) {
      toast({
        title: "Data Validation Error",
        description: "The operation would result in invalid data. Please check your inputs.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Database Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return {
    validateBankBalance,
    validateStock,
    validatePaymentLimit,
    validatePositiveNumber,
    handleDatabaseError,
  };
}