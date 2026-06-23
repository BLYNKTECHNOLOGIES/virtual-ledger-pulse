import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, FileCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

const ALL_TAB = "__all__";
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface AllocationRow {
  id: string;
  pan_number: string | null;
  supplier_name: string | null;
  order_number: string | null;
  binance_order_number: string | null;
  subsidiary_id: string | null;
  firm_name: string | null;
  paid_amount: number;
  allocated_tds_amount: number;
  deduction_date: string | null;
  tds_certificate_number: string | null;
  bank?: { account_name: string | null; bank_name: string | null } | null;
}

export function TaxationComplianceTab() {
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [certificateNumber, setCertificateNumber] = useState("");
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [activeCompany, setActiveCompany] = useState<string>(ALL_TAB);
  const [section, setSection] = useState<'pending' | 'filed'>('pending');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  useEffect(() => { setSelectedRecords([]); }, [activeCompany, section]);

  const { data: allocations } = useQuery({
    queryKey: ['tds_allocations_compliance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tds_payment_allocations')
        .select(`*, bank:bank_accounts!bank_account_id(account_name, bank_name)`)
        .order('deduction_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AllocationRow[];
    },
  });

  const getFinancialQuarter = (date: string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (month >= 4 && month <= 6) return `Q1 (${year}-${year + 1})`;
    if (month >= 7 && month <= 9) return `Q2 (${year}-${year + 1})`;
    if (month >= 10 && month <= 12) return `Q3 (${year}-${year + 1})`;
    return `Q4 (${year - 1}-${year})`;
  };

  const fileTdsMutation = useMutation({
    mutationFn: async () => {
      if (!certificateNumber) throw new Error("Certificate number is required");
      const { error } = await supabase
        .from('tds_payment_allocations')
        .update({ tds_certificate_number: certificateNumber })
        .in('id', selectedRecords);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "TDS records filed successfully" });
      setSelectedRecords([]);
      setCertificateNumber("");
      setShowFileDialog(false);
      queryClient.invalidateQueries({ queryKey: ['tds_allocations_compliance'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const companies = useMemo(() => {
    const map = new Map<string, { firm_name: string }>();
    (allocations || []).forEach(a => {
      const key = a.subsidiary_id || `name:${a.firm_name || 'Unassigned'}`;
      if (!map.has(key)) map.set(key, { firm_name: a.firm_name || 'Unassigned' });
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.firm_name.localeCompare(b.firm_name));
  }, [allocations]);

  const byCompany = useMemo(() => {
    if (!allocations) return [];
    if (activeCompany === ALL_TAB) return allocations;
    return allocations.filter(a => (a.subsidiary_id || `name:${a.firm_name || 'Unassigned'}`) === activeCompany);
  }, [allocations, activeCompany]);

  const pending = useMemo(() => byCompany.filter(r => !r.tds_certificate_number), [byCompany]);
  const filed = useMemo(() => byCompany.filter(r => r.tds_certificate_number), [byCompany]);

  const handleRecordSelection = (id: string) => {
    setSelectedRecords(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleFileTds = () => {
    if (selectedRecords.length === 0) {
      toast({ title: "No Records Selected", description: "Please select at least one record to file", variant: "destructive" });
      return;
    }
    setShowFileDialog(true);
  };

  const renderRows = (rows: AllocationRow[], withSelect: boolean) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {withSelect && <TableHead className="w-10">Sel</TableHead>}
            <TableHead>Company</TableHead>
            <TableHead>Order #</TableHead>
            <TableHead>Binance Order #</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>PAN</TableHead>
            <TableHead>Paid From Bank</TableHead>
            <TableHead className="text-right">TDS Amount</TableHead>
            {!withSelect && <TableHead>Certificate No.</TableHead>}
            <TableHead>Quarter</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              {withSelect && (
                <TableCell>
                  <Checkbox checked={selectedRecords.includes(r.id)} onCheckedChange={() => handleRecordSelection(r.id)} />
                </TableCell>
              )}
              <TableCell className="text-xs">{r.firm_name || 'Unassigned'}</TableCell>
              <TableCell className="font-mono text-xs">{r.order_number || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{r.binance_order_number || '-'}</TableCell>
              <TableCell className="font-medium">{r.supplier_name || '-'}</TableCell>
              <TableCell className="font-mono text-xs">{r.pan_number || '-'}</TableCell>
              <TableCell className="text-xs">{r.bank ? `${r.bank.account_name || ''} - ${r.bank.bank_name || ''}` : '-'}</TableCell>
              <TableCell className="text-right tabular-nums">{inr(Number(r.allocated_tds_amount))}</TableCell>
              {!withSelect && <TableCell>{r.tds_certificate_number}</TableCell>}
              <TableCell>{getFinancialQuarter(r.deduction_date)}</TableCell>
              <TableCell>
                {r.tds_certificate_number
                  ? <Badge variant="default">Filed</Badge>
                  : <Badge variant="destructive">Pending</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const companyTabs = (
    <Tabs value={activeCompany} onValueChange={setActiveCompany} className="mb-4">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value={ALL_TAB}>All</TabsTrigger>
        {companies.map(c => <TabsTrigger key={c.key} value={c.key}>{c.firm_name}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-6">
      <Tabs value={section} onValueChange={(v) => setSection(v as 'pending' | 'filed')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2"><Receipt className="h-4 w-4" />Pending Tax</TabsTrigger>
          <TabsTrigger value="filed" className="flex items-center gap-2"><FileCheck className="h-4 w-4" />Filed Tax</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Pending Tax Records</CardTitle>
                <ViewOnlyWrapper isViewOnly={!hasPermission('compliance_manage')}>
                  <Button onClick={handleFileTds} disabled={selectedRecords.length === 0} className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />File TDS ({selectedRecords.length})
                  </Button>
                </ViewOnlyWrapper>
              </div>
            </CardHeader>
            <CardContent>
              {companyTabs}
              {pending.length === 0
                ? <div className="text-center py-8 text-muted-foreground">No pending tax records found</div>
                : renderRows(pending, true)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileCheck className="h-5 w-5" />Filed Tax Records</CardTitle>
            </CardHeader>
            <CardContent>
              {companyTabs}
              {filed.length === 0
                ? <div className="text-center py-8 text-muted-foreground">No filed tax records found</div>
                : renderRows(filed, false)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>File TDS</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="certificate">TDS Certificate Number</Label>
              <Input id="certificate" value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} placeholder="Enter certificate number" className="text-foreground" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFileDialog(false)}>Cancel</Button>
              <Button onClick={() => fileTdsMutation.mutate()} disabled={fileTdsMutation.isPending}>
                {fileTdsMutation.isPending ? "Filing..." : "File TDS"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
