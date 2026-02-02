import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Building, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  balance: number;
  lien_amount: number;
}

interface BankBalanceFilterWidgetProps {
  compact?: boolean;
  className?: string;
}

export function BankBalanceFilterWidget({ compact = false, className = "" }: BankBalanceFilterWidgetProps) {
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch active bank accounts
  const { data: bankAccounts = [], isLoading } = useQuery({
    queryKey: ['active_bank_accounts_widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number, balance, lien_amount')
        .eq('status', 'ACTIVE')
        .order('bank_name');

      if (error) throw error;
      return data as BankAccount[];
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Calculate total balance of selected banks
  const selectedBalance = bankAccounts
    .filter(account => selectedBankIds.includes(account.id))
    .reduce((sum, account) => {
      const availableBalance = Number(account.balance) - Number(account.lien_amount || 0);
      return sum + availableBalance;
    }, 0);

  const handleToggleBank = (bankId: string) => {
    setSelectedBankIds(prev => 
      prev.includes(bankId) 
        ? prev.filter(id => id !== bankId)
        : [...prev, bankId]
    );
  };

  const handleSelectAll = () => {
    if (selectedBankIds.length === bankAccounts.length) {
      setSelectedBankIds([]);
    } else {
      setSelectedBankIds(bankAccounts.map(b => b.id));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (accountNumber.length <= 4) return accountNumber;
    return '•••• ' + accountNumber.slice(-4);
  };

  if (isLoading) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-4 md:p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-8 bg-muted rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 ${className}`}>
      <CardHeader className={compact ? "pb-2 pt-4 px-4" : "pb-3"}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-emerald-800">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Building className="h-4 w-4 text-emerald-600" />
            </div>
            <span className={compact ? "text-sm" : "text-base"}>Bank Balance</span>
          </CardTitle>
          {selectedBankIds.length > 0 && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
              {selectedBankIds.length} selected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0 pb-4 px-4" : "pt-0"}>
        {/* Balance Display */}
        <div className="mb-4">
          {selectedBankIds.length === 0 ? (
            <div className="text-center py-2">
              <p className="text-2xl md:text-3xl font-bold text-muted-foreground">₹0.00</p>
              <p className="text-xs text-muted-foreground mt-1">Select banks to view balance</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-2xl md:text-3xl font-bold text-emerald-700">
                {formatCurrency(selectedBalance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Combined balance (excl. lien)
              </p>
            </div>
          )}
        </div>

        {/* Bank Selector */}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full justify-between bg-white hover:bg-emerald-50 border-emerald-200"
              size={compact ? "sm" : "default"}
            >
              <span className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-emerald-600" />
                {selectedBankIds.length === 0 
                  ? "Select bank accounts" 
                  : `${selectedBankIds.length} account${selectedBankIds.length > 1 ? 's' : ''} selected`
                }
              </span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Active Bank Accounts</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSelectAll}
                  className="text-xs h-7 px-2"
                >
                  {selectedBankIds.length === bankAccounts.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="p-2 space-y-1">
                {bankAccounts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No active bank accounts found
                  </div>
                ) : (
                  bankAccounts.map((account) => {
                    const availableBalance = Number(account.balance) - Number(account.lien_amount || 0);
                    const isSelected = selectedBankIds.includes(account.id);
                    
                    return (
                      <div
                        key={account.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-emerald-50 border border-emerald-200' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => handleToggleBank(account.id)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => handleToggleBank(account.id)}
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {account.bank_name}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs text-muted-foreground truncate">
                              {account.account_name} • {maskAccountNumber(account.account_number)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-semibold ${availableBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(availableBalance)}
                          </p>
                          {Number(account.lien_amount) > 0 && (
                            <p className="text-[10px] text-amber-600">
                              Lien: {formatCurrency(Number(account.lien_amount))}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Selected Banks Summary */}
        {selectedBankIds.length > 0 && (
          <div className="mt-3 pt-3 border-t border-emerald-200/50">
            <div className="flex flex-wrap gap-1.5">
              {bankAccounts
                .filter(account => selectedBankIds.includes(account.id))
                .slice(0, 3)
                .map(account => (
                  <Badge 
                    key={account.id} 
                    variant="outline" 
                    className="text-[10px] bg-white border-emerald-200 text-emerald-700"
                  >
                    {account.bank_name}
                  </Badge>
                ))}
              {selectedBankIds.length > 3 && (
                <Badge variant="outline" className="text-[10px] bg-white border-emerald-200 text-emerald-700">
                  +{selectedBankIds.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
