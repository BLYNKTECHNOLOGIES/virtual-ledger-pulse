import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calculator, Download, FileSpreadsheet, Receipt, CheckCircle, IndianRupee, Building } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import * as XLSX from "xlsx";
import { filterNonAdjustmentBanks } from "@/lib/adjustment-accounts";
import { openTransaction } from "@/components/transaction-detail";

interface AllocationRow {
  id: string;
  purchase_order_id: string;
  pan_number: string | null;
  supplier_name: string | null;
  order_number: string | null;
  binance_order_number: string | null;
  bank_account_id: string | null;
  subsidiary_id: string | null;
  firm_name: string | null;
  paid_amount: number;
  allocated_tds_amount: number;
  tds_rate: number | null;
  deduction_date: string | null;
  financial_year: string | null;
  payment_status: string;
  payment_batch_id: string | null;
  bank?: { account_name: string | null; bank_name: string | null } | null;
}

const ALL_TAB = "__all__";
const ALL_RATES = "__all_rates__";

// Normalize a TDS rate to a stable group key ("1", "20", or "other").
function rateKey(rate: number | null): string {
  const n = Number(rate || 0);
  if (n === 1) return "1";
  if (n === 20) return "20";
  return "other";
}
function rateLabel(key: string): string {
  if (key === "1") return "1% (PAN available)";
  if (key === "20") return "20% (PAN missing)";
  if (key === ALL_RATES) return "All Rates";
  return "Other";
}

function generateQuarterOptions() {
  const options: { value: string; label: string }[] = [];
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const currentFYStart = currentMonth >= 4 ? currentYear : currentYear - 1;

  for (let fyStart = currentFYStart; fyStart >= currentFYStart - 1; fyStart--) {
    const fyEnd = fyStart + 1;
    const fyLabel = `FY ${fyStart}-${fyEnd.toString().slice(-2)}`;
    options.push({ value: `Q4-${fyStart}`, label: `Q4 ${fyLabel} (Jan-Mar ${fyEnd})` });
    options.push({ value: `Q3-${fyStart}`, label: `Q3 ${fyLabel} (Oct-Dec ${fyStart})` });
    options.push({ value: `Q2-${fyStart}`, label: `Q2 ${fyLabel} (Jul-Sep ${fyStart})` });
    options.push({ value: `Q1-${fyStart}`, label: `Q1 ${fyLabel} (Apr-Jun ${fyStart})` });
  }
  return options;
}

function getQuarterDateRange(quarterKey: string): { start: string; end: string } {
  const [quarter, fyStartStr] = quarterKey.split('-');
  const fyStart = parseInt(fyStartStr);
  switch (quarter) {
    case 'Q1': return { start: `${fyStart}-04-01`, end: `${fyStart}-06-30` };
    case 'Q2': return { start: `${fyStart}-07-01`, end: `${fyStart}-09-30` };
    case 'Q3': return { start: `${fyStart}-10-01`, end: `${fyStart}-12-31` };
    case 'Q4': return { start: `${fyStart + 1}-01-01`, end: `${fyStart + 1}-03-31` };
    default: return { start: '', end: '' };
  }
}

function getCurrentQuarter(): string {
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  if (month >= 4 && month <= 6) return `Q1-${year}`;
  if (month >= 7 && month <= 9) return `Q2-${year}`;
  if (month >= 10 && month <= 12) return `Q3-${year}`;
  return `Q4-${year - 1}`;
}

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function TaxManagementTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [activeCompany, setActiveCompany] = useState<string>(ALL_TAB);
  const [activeRate, setActiveRate] = useState<string>(ALL_RATES);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentBankAccountId, setPaymentBankAccountId] = useState("");
  const [includePaidInExport, setIncludePaidInExport] = useState(false);

  const quarterOptions = useMemo(() => generateQuarterOptions(), []);
  const dateRange = useMemo(() => getQuarterDateRange(selectedQuarter), [selectedQuarter]);

  // Reset selection when switching tabs / quarters
  useEffect(() => { setSelectedIds([]); }, [activeCompany, activeRate, selectedQuarter]);

  // Fetch per-transaction TDS allocations for the quarter
  const { data: allocations, isLoading } = useQuery({
    queryKey: ['tds_allocations_quarter', selectedQuarter],
    queryFn: async () => {
      const { start, end } = dateRange;
      const data = await fetchAllPaginated<any>(() =>
        supabase
          .from('tds_payment_allocations')
          .select(`*, bank:bank_accounts!bank_account_id(account_name, bank_name)`)
          .gte('deduction_date', start)
          .lte('deduction_date', end)
          .order('deduction_date', { ascending: false }));
      return (data || []) as unknown as AllocationRow[];

    },
    enabled: !!dateRange.start,
  });

  // Bank accounts (active, non-dormant, non-adjustment) with company link
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_active_with_firm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, balance, subsidiary_id')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null)
        .order('account_name');
      if (error) throw error;
      return filterNonAdjustmentBanks(data || []) as any[];
    },
  });

  // All active subsidiaries (so every company is always reflected as a tab,
  // even when it has no TDS in the selected quarter)
  const { data: subsidiaries } = useQuery({
    queryKey: ['subsidiaries_active_for_tds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsidiaries')
        .select('id, firm_name')
        .eq('status', 'ACTIVE')
        .order('firm_name');
      if (error) throw error;
      return (data || []) as { id: string; firm_name: string }[];
    },
  });

  // Distinct companies: union of all active subsidiaries + any company present in
  // the quarter's allocations (covers banks not linked to a subsidiary record).
  const companies = useMemo(() => {
    const map = new Map<string, { firm_name: string; subsidiary_id: string | null }>();
    (subsidiaries || []).forEach(s => {
      map.set(s.id, { firm_name: s.firm_name, subsidiary_id: s.id });
    });
    (allocations || []).forEach(a => {
      const key = a.subsidiary_id || `name:${a.firm_name || 'Unassigned'}`;
      if (!map.has(key)) map.set(key, { firm_name: a.firm_name || 'Unassigned', subsidiary_id: a.subsidiary_id });
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.firm_name.localeCompare(b.firm_name));
  }, [subsidiaries, allocations]);

  // Rows for the active company tab (before rate sub-grouping)
  const companyRows = useMemo(() => {
    if (!allocations) return [];
    if (activeCompany === ALL_TAB) return allocations;
    return allocations.filter(a => (a.subsidiary_id || `name:${a.firm_name || 'Unassigned'}`) === activeCompany);
  }, [allocations, activeCompany]);

  // Rate sub-groups present for the active company, with per-group TDS totals.
  const rateGroups = useMemo(() => {
    const order = ['1', '20', 'other'];
    const map = new Map<string, { count: number; total: number }>();
    companyRows.forEach(r => {
      const k = rateKey(r.tds_rate);
      const cur = map.get(k) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.allocated_tds_amount || 0);
      map.set(k, cur);
    });
    return order.filter(k => map.has(k)).map(k => ({ key: k, ...map.get(k)! }));
  }, [companyRows]);

  // If the current rate sub-tab has no rows for this company, fall back to All.
  useEffect(() => {
    if (activeRate !== ALL_RATES && !rateGroups.some(g => g.key === activeRate)) {
      setActiveRate(ALL_RATES);
    }
  }, [rateGroups, activeRate]);

  // Rows for the active company AND active rate sub-group
  const visibleRows = useMemo(() => {
    if (activeRate === ALL_RATES) return companyRows;
    return companyRows.filter(r => rateKey(r.tds_rate) === activeRate);
  }, [companyRows, activeRate]);

  const totals = useMemo(() => {
    const rows = allocations || [];
    return {
      totalTds: rows.reduce((s, r) => s + Number(r.allocated_tds_amount || 0), 0),
      paidTds: rows.filter(r => r.payment_status === 'PAID').reduce((s, r) => s + Number(r.allocated_tds_amount || 0), 0),
      unpaidTds: rows.filter(r => r.payment_status !== 'PAID').reduce((s, r) => s + Number(r.allocated_tds_amount || 0), 0),
    };
  }, [allocations]);

  const activeCompanyInfo = useMemo(
    () => companies.find(c => c.key === activeCompany) || null,
    [companies, activeCompany]
  );

  // Bank accounts belonging to the active company (for per-company payment)
  const companyBankAccounts = useMemo(() => {
    if (!bankAccounts) return [];
    if (!activeCompanyInfo?.subsidiary_id) return bankAccounts;
    return bankAccounts.filter(b => b.subsidiary_id === activeCompanyInfo.subsidiary_id);
  }, [bankAccounts, activeCompanyInfo]);

  const selectableUnpaid = useMemo(
    () => visibleRows.filter(r => r.payment_status !== 'PAID'),
    [visibleRows]
  );

  const selectedTotal = useMemo(
    () => visibleRows.filter(r => selectedIds.includes(r.id)).reduce((s, r) => s + Number(r.allocated_tds_amount || 0), 0),
    [visibleRows, selectedIds]
  );

  const bulkPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentBankAccountId) throw new Error("Please select a bank account");
      if (selectedIds.length === 0) throw new Error("No records selected");

      const batchId = `TDS-${selectedQuarter}-${Date.now()}`;
      const firmLabel = activeCompanyInfo?.firm_name || 'TDS';

      const { error: updateError } = await supabase
        .from('tds_payment_allocations')
        .update({
          payment_status: 'PAID',
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
          payment_bank_account_id: paymentBankAccountId,
          payment_batch_id: batchId,
        })
        .in('id', selectedIds);
      if (updateError) throw updateError;

      const quarterLabel = quarterOptions.find(q => q.value === selectedQuarter)?.label || selectedQuarter;
      const { error: expenseError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: paymentBankAccountId,
          transaction_type: 'EXPENSE',
          amount: selectedTotal,
          description: `TDS payment - ${firmLabel} - ${quarterLabel} (${selectedIds.length} entries)`,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'TDS',
          reference_number: batchId,
          created_by: user?.id,
        });
      if (expenseError) throw expenseError;

      return { batchId, amount: selectedTotal, count: selectedIds.length, firm: firmLabel };
    },
    onSuccess: (result) => {
      toast({
        title: "TDS Payment Recorded",
        description: `${inr(result.amount)} paid for ${result.firm} (${result.count} entries)`,
      });
      setSelectedIds([]);
      setPaymentBankAccountId("");
      setShowPaymentDialog(false);
      queryClient.invalidateQueries({ queryKey: ['tds_allocations_quarter'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to process TDS payment", variant: "destructive" });
    },
  });

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    // Export follows the current company AND rate sub-group selection, so each
    // 1% / 20% group can be exported separately.
    const source = visibleRows;
    const dataRows = includePaidInExport ? source : source.filter(r => r.payment_status !== 'PAID');
    if (dataRows.length === 0) {
      toast({ title: "No Data", description: "No TDS records to export", variant: "destructive" });
      return;
    }
    const [quarter, fyStart] = selectedQuarter.split('-');
    const fyLabel = `FY${fyStart}-${(parseInt(fyStart) + 1).toString().slice(-2)}`;

    const exportData = dataRows.map(r => ({
      'Company': r.firm_name || 'Unassigned',
      'Client / Supplier': r.supplier_name || '',
      'PAN': r.pan_number || '',
      'TDS Rate': r.tds_rate != null ? `${r.tds_rate}%` : '',
      'Order Number': r.order_number || '',
      'Binance Order Number': r.binance_order_number || '',
      'Paid From Bank': r.bank ? `${r.bank.account_name || ''} - ${r.bank.bank_name || ''}` : '',
      'Payment Amount': Number(r.paid_amount || 0),
      'TDS Amount': Number(r.allocated_tds_amount || 0),
      'Quarter': `${quarter} (${fyLabel})`,
      'Status': r.payment_status === 'PAID' ? 'Paid' : 'Unpaid',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TDS Allocations');
    const rateTag = activeRate === ALL_RATES ? 'AllRates' : `${activeRate}pct`;
    const companyTag = activeCompany === ALL_TAB ? 'AllCompanies' : (activeCompanyInfo?.firm_name || 'Company').replace(/[^a-zA-Z0-9]+/g, '');
    const fileName = `TDS_${selectedQuarter}_${companyTag}_${rateTag}_${includePaidInExport ? 'All' : 'Unpaid'}.${fmt}`;
    XLSX.writeFile(wb, fileName, { bookType: fmt });
    toast({ title: "Export Complete", description: `Exported ${exportData.length} rows to ${fileName}` });
  };

  const toggleSelectAll = () => {
    const unpaidIds = selectableUnpaid.map(r => r.id);
    const allSelected = unpaidIds.length > 0 && unpaidIds.every(id => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : unpaidIds);
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const renderTable = () => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={selectableUnpaid.length > 0 && selectableUnpaid.every(r => selectedIds.includes(r.id))}
                onCheckedChange={toggleSelectAll}
                disabled={selectableUnpaid.length === 0}
              />
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>PAN</TableHead>
            <TableHead>TDS Rate</TableHead>
            <TableHead>Order #</TableHead>
            <TableHead>Binance Order #</TableHead>
            <TableHead>Paid From Bank</TableHead>
            <TableHead className="text-right">Payment Amt</TableHead>
            <TableHead className="text-right">TDS Amt</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                No TDS records for this selection
              </TableCell>
            </TableRow>
          ) : visibleRows.map(r => (
            <TableRow
              key={r.id}
              className={r.purchase_order_id ? "cursor-pointer hover:bg-muted/50" : undefined}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a, input, [role="checkbox"], [data-no-row-click]')) return;
                if (r.purchase_order_id) openTransaction({ type: 'purchase_order', id: r.purchase_order_id });
              }}
              title={r.purchase_order_id ? "Click to view full order details" : undefined}
            >
              <TableCell data-no-row-click>
                <Checkbox
                  checked={selectedIds.includes(r.id)}
                  onCheckedChange={() => toggleRow(r.id)}
                  disabled={r.payment_status === 'PAID'}
                />
              </TableCell>
              <TableCell className="text-xs">{r.firm_name || 'Unassigned'}</TableCell>
              <TableCell className="font-medium">{r.supplier_name || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{r.pan_number || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{r.order_number || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{r.binance_order_number || '-'}</TableCell>
              <TableCell className="text-xs">
                {r.bank ? `${r.bank.account_name || ''} - ${r.bank.bank_name || ''}` : '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{inr(Number(r.paid_amount))}</TableCell>
              <TableCell className="text-right tabular-nums font-medium text-orange-600">
                {inr(Number(r.allocated_tds_amount))}
              </TableCell>
              <TableCell>
                {r.payment_status === 'PAID' ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                ) : (
                  <Badge variant="destructive">Unpaid</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const canPay = activeCompany !== ALL_TAB && selectedIds.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Label className="text-sm text-muted-foreground">Select Quarter</Label>
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {quarterOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Checkbox id="includePaid" checked={includePaidInExport} onCheckedChange={(c) => setIncludePaidInExport(!!c)} />
            <Label htmlFor="includePaid" className="text-sm">Include paid in export</Label>
          </div>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><Calculator className="h-4 w-4" /><span className="text-sm">Total TDS Deducted</span></div>
          <p className="text-2xl font-bold">{inr(totals.totalTds)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><Receipt className="h-4 w-4" /><span className="text-sm">Unpaid TDS</span></div>
          <p className="text-2xl font-bold text-destructive">{inr(totals.unpaidTds)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><CheckCircle className="h-4 w-4" /><span className="text-sm">Paid TDS</span></div>
          <p className="text-2xl font-bold text-green-600">{inr(totals.paidTds)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><IndianRupee className="h-4 w-4" /><span className="text-sm">TDS Transactions</span></div>
          <p className="text-2xl font-bold">{allocations?.length || 0}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">TDS by Company</CardTitle>
            {canPay && (
              <ViewOnlyWrapper isViewOnly={!hasPermission('accounting_manage')}>
                <Button onClick={() => setShowPaymentDialog(true)}>
                  <Building className="h-4 w-4 mr-2" />
                  Pay {inr(selectedTotal)} ({selectedIds.length})
                </Button>
              </ViewOnlyWrapper>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse py-8 text-center text-muted-foreground">Loading TDS records...</div>
          ) : (
            <Tabs value={activeCompany} onValueChange={setActiveCompany}>
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value={ALL_TAB}>All</TabsTrigger>
                {companies.map(c => (
                  <TabsTrigger key={c.key} value={c.key}>{c.firm_name}</TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={activeCompany} className="mt-4">
                {activeCompany === ALL_TAB && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Select a company tab to record a TDS payment for that company.
                  </p>
                )}
                {renderTable()}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Payment dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Record TDS Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Company:</span><span className="font-medium">{activeCompanyInfo?.firm_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Quarter:</span><span className="font-medium">{quarterOptions.find(q => q.value === selectedQuarter)?.label}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Selected entries:</span><span className="font-medium">{selectedIds.length}</span></div>
              <div className="flex justify-between text-lg"><span className="font-medium">Total Amount:</span><span className="font-bold text-destructive">{inr(selectedTotal)}</span></div>
            </div>
            <div>
              <Label>Deduct from {activeCompanyInfo?.firm_name || 'Company'} Bank Account *</Label>
              <Select value={paymentBankAccountId} onValueChange={setPaymentBankAccountId}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {companyBankAccounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_name} - {acc.bank_name}
                      <span className="text-muted-foreground ml-2">(₹{parseFloat(acc.balance.toString()).toLocaleString('en-IN')})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companyBankAccounts.length === 0 && (
                <p className="text-xs text-destructive mt-1">No active bank account found for this company.</p>
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>Note:</strong> This creates a single expense entry on the selected company bank and marks the selected TDS entries as paid for {activeCompanyInfo?.firm_name || 'this company'}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button onClick={() => bulkPaymentMutation.mutate()} disabled={!paymentBankAccountId || bulkPaymentMutation.isPending}>
              {bulkPaymentMutation.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
