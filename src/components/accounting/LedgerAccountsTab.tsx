
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddLedgerAccountDialog } from "./AddLedgerAccountDialog";

export function LedgerAccountsTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['ledger-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const filteredAccounts = accounts?.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.account_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Ledger Accounts</CardTitle>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading accounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 p-3 text-left">Account Name</th>
                  <th className="border border-gray-200 p-3 text-left">Account Code</th>
                  <th className="border border-gray-200 p-3 text-left">Type</th>
                  <th className="border border-gray-200 p-3 text-left">Opening Balance</th>
                  <th className="border border-gray-200 p-3 text-left">Current Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts?.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 p-3 font-medium">{account.name}</td>
                    <td className="border border-gray-200 p-3">{account.account_code || '-'}</td>
                    <td className="border border-gray-200 p-3">
                      <Badge variant="secondary">{account.account_type}</Badge>
                    </td>
                    <td className="border border-gray-200 p-3">₹{account.opening_balance}</td>
                    <td className="border border-gray-200 p-3">₹{account.current_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAccounts?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No accounts found. Add your first account to get started.
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AddLedgerAccountDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
      />
    </Card>
  );
}
