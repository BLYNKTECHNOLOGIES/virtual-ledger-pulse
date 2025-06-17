
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function AccountStatusTab() {
  const { toast } = useToast();

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data;
    },
  });

  const handleStartInvestigation = (accountId: string, accountName: string) => {
    toast({
      title: "Investigation Started",
      description: `Investigation started for ${accountName}`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankAccounts?.map((account) => (
            <div key={account.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-medium">{account.bank_name}</h4>
                  <p className="text-sm text-gray-600">{account.account_name}</p>
                </div>
                <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
                  {account.status}
                </Badge>
              </div>
              <p className="text-sm">Balance: ₹{Number(account.balance).toLocaleString()}</p>
              {account.status !== 'ACTIVE' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => handleStartInvestigation(account.id, account.account_name)}
                >
                  Start Investigation
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
