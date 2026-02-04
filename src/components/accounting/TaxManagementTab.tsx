
import { useState, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface TDSRecord {
  id: string;
  pan_number: string;
  tds_amount: number;
  total_amount: number;
  net_payable_amount: number;
  deduction_date: string;
  financial_year: string;
  payment_status: string;
  tds_certificate_number: string | null;
  payment_batch_id: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payment_bank_account_id: string | null;
  payment_reference: string | null;
  purchase_orders?: {
    order_number: string;
    supplier_name: string;
  };
  paid_by_user?: {
    username: string;
    first_name: string | null;
    last_name: string | null;
  };
  payment_bank_account?: {
    account_name: string;
    bank_name: string;
  };
}

// Generate quarter options for past 2 years
function generateQuarterOptions() {
  const options: { value: string; label: string }[] = [];
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  // Determine current FY
  const currentFYStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  
  // Generate quarters for current FY and previous FY
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

// Get date range for a quarter
function getQuarterDateRange(quarterKey: string): { start: string; end: string } {
  const [quarter, fyStartStr] = quarterKey.split('-');
  const fyStart = parseInt(fyStartStr);
  
  switch (quarter) {
    case 'Q1':
      return { start: `${fyStart}-04-01`, end: `${fyStart}-06-30` };
    case 'Q2':
      return { start: `${fyStart}-07-01`, end: `${fyStart}-09-30` };
    case 'Q3':
      return { start: `${fyStart}-10-01`, end: `${fyStart}-12-31` };
    case 'Q4':
      return { start: `${fyStart + 1}-01-01`, end: `${fyStart + 1}-03-31` };
    default:
      return { start: '', end: '' };
  }
}

// Get current quarter
function getCurrentQuarter(): string {
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  
  if (month >= 4 && month <= 6) return `Q1-${year}`;
  if (month >= 7 && month <= 9) return `Q2-${year}`;
  if (month >= 10 && month <= 12) return `Q3-${year}`;
  return `Q4-${year - 1}`;
}

export function TaxManagementTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentBankAccountId, setPaymentBankAccountId] = useState("");
  const [includePaidInExport, setIncludePaidInExport] = useState(false);
  
  const quarterOptions = useMemo(() => generateQuarterOptions(), []);
  const dateRange = useMemo(() => getQuarterDateRange(selectedQuarter), [selectedQuarter]);

  // Fetch TDS records for selected quarter with payment details
  const { data: tdsRecords, isLoading } = useQuery({
    queryKey: ['tds_records_quarter', selectedQuarter],
    queryFn: async () => {
      const { start, end } = dateRange;
      
      const { data, error } = await supabase
        .from('tds_records')
        .select(`
          *,
          purchase_orders!inner(
            order_number,
            supplier_name
          ),
          paid_by_user:users!paid_by(
            username,
            first_name,
            last_name
          ),
          payment_bank_account:bank_accounts!payment_bank_account_id(
            account_name,
            bank_name
          )
        `)
        .gte('deduction_date', start)
        .lte('deduction_date', end)
        .order('deduction_date', { ascending: false });
      
      if (error) throw error;
      return data as TDSRecord[];
    },
    enabled: !!dateRange.start,
  });

  // Fetch bank accounts (excluding dormant)
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, balance')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      if (error) throw error;
      return data;
    },
  });

  // Aggregate TDS by PAN for display
  const aggregatedByPan = useMemo(() => {
    if (!tdsRecords) return [];
    
    const panMap = new Map<string, {
      pan_number: string;
      supplier_name: string;
      total_tds: number;
      paid_tds: number;
      unpaid_tds: number;
      records: TDSRecord[];
      unpaid_record_ids: string[];
      paid_record_ids: string[];
      // Payment details from the most recent paid record
      last_paid_at: string | null;
      last_paid_by_username: string | null;
      last_payment_bank: string | null;
      last_payment_batch_id: string | null;
    }>();
    
    tdsRecords.forEach(record => {
      const existing = panMap.get(record.pan_number) || {
        pan_number: record.pan_number,
        supplier_name: record.purchase_orders?.supplier_name || 'Unknown',
        total_tds: 0,
        paid_tds: 0,
        unpaid_tds: 0,
        records: [],
        unpaid_record_ids: [],
        paid_record_ids: [],
        last_paid_at: null,
        last_paid_by_username: null,
        last_payment_bank: null,
        last_payment_batch_id: null,
      };
      
      existing.total_tds += record.tds_amount;
      existing.records.push(record);
      
      if (record.payment_status === 'PAID') {
        existing.paid_tds += record.tds_amount;
        existing.paid_record_ids.push(record.id);
        
        // Track most recent payment details
        if (!existing.last_paid_at || (record.paid_at && record.paid_at > existing.last_paid_at)) {
          existing.last_paid_at = record.paid_at;
          existing.last_paid_by_username = record.paid_by_user?.first_name 
            || record.paid_by_user?.username 
            || null;
          existing.last_payment_bank = record.payment_bank_account 
            ? `${record.payment_bank_account.account_name} - ${record.payment_bank_account.bank_name}`
            : null;
          existing.last_payment_batch_id = record.payment_batch_id;
        }
      } else {
        existing.unpaid_tds += record.tds_amount;
        existing.unpaid_record_ids.push(record.id);
      }
      
      panMap.set(record.pan_number, existing);
    });
    
    return Array.from(panMap.values());
  }, [tdsRecords]);

  // Filter for unpaid only
  const unpaidPanEntries = useMemo(() => 
    aggregatedByPan.filter(entry => entry.unpaid_tds > 0),
    [aggregatedByPan]
  );

  // Filter for paid only (fully paid PANs)
  const paidPanEntries = useMemo(() => 
    aggregatedByPan.filter(entry => entry.paid_tds > 0),
    [aggregatedByPan]
  );

  // Calculate totals
  const totals = useMemo(() => ({
    totalTds: aggregatedByPan.reduce((sum, e) => sum + e.total_tds, 0),
    paidTds: aggregatedByPan.reduce((sum, e) => sum + e.paid_tds, 0),
    unpaidTds: aggregatedByPan.reduce((sum, e) => sum + e.unpaid_tds, 0),
  }), [aggregatedByPan]);

  // Selected total
  const selectedTotal = useMemo(() => {
    return unpaidPanEntries
      .filter(entry => selectedRecords.includes(entry.pan_number))
      .reduce((sum, entry) => sum + entry.unpaid_tds, 0);
  }, [selectedRecords, unpaidPanEntries]);

  // Bulk payment mutation
  const bulkPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentBankAccountId) throw new Error("Please select a bank account");
      if (selectedRecords.length === 0) throw new Error("No records selected");

      const batchId = `TDS-${selectedQuarter}-${Date.now()}`;
      
      // Get all unpaid record IDs for selected PANs
      const recordIds = unpaidPanEntries
        .filter(entry => selectedRecords.includes(entry.pan_number))
        .flatMap(entry => entry.unpaid_record_ids);

      // 1. Update all TDS records to PAID
      const { error: updateError } = await supabase
        .from('tds_records')
        .update({
          payment_status: 'PAID',
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
          payment_bank_account_id: paymentBankAccountId,
          payment_batch_id: batchId,
        })
        .in('id', recordIds);

      if (updateError) throw updateError;

      // 2. Create SINGLE expense entry for the entire bulk payment
      const quarterLabel = quarterOptions.find(q => q.value === selectedQuarter)?.label || selectedQuarter;
      
      const { error: expenseError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: paymentBankAccountId,
          transaction_type: 'EXPENSE',
          amount: selectedTotal,
          description: `Bulk TDS payment - ${quarterLabel} (${selectedRecords.length} PANs)`,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'TDS',
          reference_number: batchId,
          created_by: user?.id,
        });

      if (expenseError) throw expenseError;

      return { batchId, amount: selectedTotal, count: selectedRecords.length };
    },
    onSuccess: (result) => {
      toast({
        title: "TDS Payment Recorded",
        description: `₹${result.amount.toLocaleString()} deducted from bank for ${result.count} PANs`,
      });
      setSelectedRecords([]);
      setPaymentBankAccountId("");
      setShowPaymentDialog(false);
      queryClient.invalidateQueries({ queryKey: ['tds_records_quarter'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process TDS payment",
        variant: "destructive",
      });
    },
  });

  // Export function
  const handleExport = (format: 'csv' | 'xlsx') => {
    const dataToExport = includePaidInExport ? aggregatedByPan : unpaidPanEntries;
    
    if (dataToExport.length === 0) {
      toast({
        title: "No Data",
        description: "No TDS records to export for the selected quarter",
        variant: "destructive",
      });
      return;
    }

    const quarterLabel = quarterOptions.find(q => q.value === selectedQuarter)?.label || selectedQuarter;
    const [quarter, fyStart] = selectedQuarter.split('-');
    const fyLabel = `FY${fyStart}-${(parseInt(fyStart) + 1).toString().slice(-2)}`;

    const exportData = dataToExport.map(entry => ({
      'Client Name': entry.supplier_name,
      'PAN': entry.pan_number,
      'Quarter': `${quarter} (${fyLabel})`,
      'Total TDS Amount': entry.total_tds,
      'Payment Status': entry.unpaid_tds > 0 ? 'Unpaid' : 'Paid',
      'Unpaid Amount': entry.unpaid_tds,
      'Paid Amount': entry.paid_tds,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TDS Records');

    const fileName = `TDS_${selectedQuarter}_${includePaidInExport ? 'All' : 'Unpaid'}.${format}`;
    
    if (format === 'csv') {
      XLSX.writeFile(wb, fileName, { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
    }

    toast({
      title: "Export Complete",
      description: `Exported ${exportData.length} records to ${fileName}`,
    });
  };

  // Handle selection
  const handleSelectAll = () => {
    if (selectedRecords.length === unpaidPanEntries.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(unpaidPanEntries.map(e => e.pan_number));
    }
  };

  const handleSelectPan = (pan: string) => {
    setSelectedRecords(prev =>
      prev.includes(pan) ? prev.filter(p => p !== pan) : [...prev, pan]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Quarter Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <Label className="text-sm text-muted-foreground">Select Quarter</Label>
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Checkbox
              id="includePaid"
              checked={includePaidInExport}
              onCheckedChange={(checked) => setIncludePaidInExport(!!checked)}
            />
            <Label htmlFor="includePaid" className="text-sm">Include paid in export</Label>
          </div>
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calculator className="h-4 w-4" />
              <span className="text-sm">Total TDS Deducted</span>
            </div>
            <p className="text-2xl font-bold">₹{totals.totalTds.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Receipt className="h-4 w-4" />
              <span className="text-sm">Unpaid TDS</span>
            </div>
            <p className="text-2xl font-bold text-destructive">₹{totals.unpaidTds.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Paid TDS</span>
            </div>
            <p className="text-2xl font-bold text-green-600">₹{totals.paidTds.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <IndianRupee className="h-4 w-4" />
              <span className="text-sm">Unique PANs</span>
            </div>
            <p className="text-2xl font-bold">{aggregatedByPan.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* TDS Records Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              TDS Records - {quarterOptions.find(q => q.value === selectedQuarter)?.label}
            </CardTitle>
            {selectedRecords.length > 0 && (
              <ViewOnlyWrapper isViewOnly={!hasPermission('accounting_manage')}>
                <Button onClick={() => setShowPaymentDialog(true)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Selected as Paid (₹{selectedTotal.toLocaleString()})
                </Button>
              </ViewOnlyWrapper>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading TDS records...</div>
          ) : unpaidPanEntries.length === 0 && aggregatedByPan.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No TDS records found for this quarter
            </div>
          ) : (
            <Tabs defaultValue="unpaid">
              <TabsList className="mb-4">
                <TabsTrigger value="unpaid">
                  Unpaid ({unpaidPanEntries.length})
                </TabsTrigger>
                <TabsTrigger value="paid">
                  Paid ({paidPanEntries.filter(e => e.paid_tds > 0).length})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All Records ({aggregatedByPan.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="unpaid">
                {unpaidPanEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    All TDS for this quarter has been paid
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedRecords.length === unpaidPanEntries.length && unpaidPanEntries.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Client Name</TableHead>
                        <TableHead>PAN</TableHead>
                        <TableHead className="text-right">TDS Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidPanEntries.map((entry) => (
                        <TableRow key={entry.pan_number}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(entry.pan_number)}
                              onCheckedChange={() => handleSelectPan(entry.pan_number)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{entry.supplier_name}</TableCell>
                          <TableCell>{entry.pan_number}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            ₹{entry.unpaid_tds.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">Unpaid</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="paid">
                {paidPanEntries.filter(e => e.paid_tds > 0).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No paid TDS records for this quarter
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead>PAN</TableHead>
                        <TableHead className="text-right">TDS Paid</TableHead>
                        <TableHead>Paid By</TableHead>
                        <TableHead>Paid Date & Time</TableHead>
                        <TableHead>Bank Account</TableHead>
                        <TableHead>Batch ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidPanEntries.filter(e => e.paid_tds > 0).map((entry) => (
                        <TableRow key={entry.pan_number}>
                          <TableCell className="font-medium">{entry.supplier_name}</TableCell>
                          <TableCell>{entry.pan_number}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            ₹{entry.paid_tds.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {entry.last_paid_by_username ? (
                              <Badge variant="outline">{entry.last_paid_by_username}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.last_paid_at ? (
                              <div className="text-sm">
                                <div>{format(new Date(entry.last_paid_at), "MMM dd, yyyy")}</div>
                                <div className="text-muted-foreground text-xs">
                                  {format(new Date(entry.last_paid_at), "HH:mm:ss")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.last_payment_bank ? (
                              <span className="text-sm">{entry.last_payment_bank}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.last_payment_batch_id ? (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {entry.last_payment_batch_id}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="all">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client Name</TableHead>
                      <TableHead>PAN</TableHead>
                      <TableHead className="text-right">Total TDS</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Unpaid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedByPan.map((entry) => (
                      <TableRow key={entry.pan_number}>
                        <TableCell className="font-medium">{entry.supplier_name}</TableCell>
                        <TableCell>{entry.pan_number}</TableCell>
                        <TableCell className="text-right">₹{entry.total_tds.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-green-600">
                          ₹{entry.paid_tds.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          ₹{entry.unpaid_tds.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {entry.unpaid_tds === 0 ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>
                          ) : entry.paid_tds > 0 ? (
                            <Badge variant="secondary">Partial</Badge>
                          ) : (
                            <Badge variant="destructive">Unpaid</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Bulk Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Bulk TDS Payment
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quarter:</span>
                <span className="font-medium">
                  {quarterOptions.find(q => q.value === selectedQuarter)?.label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selected PANs:</span>
                <span className="font-medium">{selectedRecords.length}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-medium">Total Amount:</span>
                <span className="font-bold text-destructive">₹{selectedTotal.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <Label>Deduct from Bank Account *</Label>
              <Select value={paymentBankAccountId} onValueChange={setPaymentBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                      <span className="text-muted-foreground ml-2">
                        (₹{parseFloat(account.balance.toString()).toLocaleString()})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>Note:</strong> This will create a single expense entry for the total TDS amount 
              and mark all selected PAN records as paid.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkPaymentMutation.mutate()}
              disabled={!paymentBankAccountId || bulkPaymentMutation.isPending}
            >
              {bulkPaymentMutation.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
