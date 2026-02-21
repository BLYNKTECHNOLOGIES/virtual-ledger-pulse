import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileBarChart } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface Props {
  category: string | null;
  onClose: () => void;
  startDate?: Date;
  endDate?: Date;
  formatCurrency: (value: number) => string;
}

export function ExpenseCategoryDrillDown({ category, onClose, startDate, endDate, formatCurrency }: Props) {
  const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['expense-category-drilldown', category, startStr, endStr],
    queryFn: async () => {
      if (!category) return [];
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          id, amount, description, transaction_date, reference_number, category, created_at,
          bank_accounts!bank_account_id(account_name, bank_name),
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .eq('transaction_type', 'EXPENSE')
        .eq('category', category)
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr)
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!category,
  });

  const total = transactions?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

  return (
    <Dialog open={!!category} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="md:max-w-[95vw] w-full h-[95vh] max-h-[95vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-destructive" />
            Expenses: {category}
          </DialogTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Period: {startStr} to {endStr}</span>
            <Badge variant="secondary">{transactions?.length || 0} transactions</Badge>
            <span className="font-semibold text-foreground">Total: {formatCurrency(total)}</span>
          </div>
        </DialogHeader>

        <div className="border rounded-lg flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : transactions && transactions.length > 0 ? (
                transactions.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{format(new Date(t.transaction_date), 'MMM dd, yyyy')}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(t.created_at), 'HH:mm:ss')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.bank_accounts?.account_name} - {t.bank_accounts?.bank_name}
                    </TableCell>
                    <TableCell className="text-sm max-w-[250px] truncate">{t.description || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.reference_number || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {t.created_by_user?.first_name || t.created_by_user?.username || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      -₹{Number(t.amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No transactions found for this category
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
