
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, FileCheck, CheckSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function TaxationComplianceTab() {
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [certificateNumber, setCertificateNumber] = useState("");
  const [showFileDialog, setShowFileDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch TDS records for taxation compliance
  const { data: tdsRecords } = useQuery({
    queryKey: ['tds_records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tds_records')
        .select(`
          *,
          purchase_orders!inner(
            order_number,
            supplier_name,
            total_amount
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Function to get financial quarter
  const getFinancialQuarter = (date: string) => {
    const orderDate = new Date(date);
    const month = orderDate.getMonth() + 1; // JavaScript months are 0-indexed
    const year = orderDate.getFullYear();
    
    let quarter = "";
    let financialYear = "";
    
    if (month >= 4 && month <= 6) {
      quarter = "Q1";
      financialYear = `${year}-${year + 1}`;
    } else if (month >= 7 && month <= 9) {
      quarter = "Q2";
      financialYear = `${year}-${year + 1}`;
    } else if (month >= 10 && month <= 12) {
      quarter = "Q3";
      financialYear = `${year}-${year + 1}`;
    } else {
      quarter = "Q4";
      financialYear = `${year - 1}-${year}`;
    }
    
    return `${quarter} (${financialYear})`;
  };

  // File TDS mutation
  const fileTdsMutation = useMutation({
    mutationFn: async () => {
      if (!certificateNumber) {
        throw new Error("Certificate number is required");
      }

      const { error } = await supabase
        .from('tds_records')
        .update({ tds_certificate_number: certificateNumber })
        .in('id', selectedRecords);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "TDS records filed successfully",
      });
      setSelectedRecords([]);
      setCertificateNumber("");
      setShowFileDialog(false);
      queryClient.invalidateQueries({ queryKey: ['tds_records'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Separate pending and filed records
  const pendingTaxRecords = tdsRecords?.filter(record => !record.tds_certificate_number) || [];
  const filedTaxRecords = tdsRecords?.filter(record => record.tds_certificate_number) || [];

  const handleRecordSelection = (recordId: string) => {
    setSelectedRecords(prev => 
      prev.includes(recordId) 
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  const handleFileTds = () => {
    if (selectedRecords.length === 0) {
      toast({
        title: "No Records Selected",
        description: "Please select at least one record to file",
        variant: "destructive",
      });
      return;
    }
    setShowFileDialog(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Pending Tax
          </TabsTrigger>
          <TabsTrigger value="filed" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Filed Tax
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Pending Tax Records
                </CardTitle>
                <Button 
                  onClick={handleFileTds}
                  disabled={selectedRecords.length === 0}
                  className="flex items-center gap-2"
                >
                  <FileCheck className="h-4 w-4" />
                  File TDS ({selectedRecords.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pendingTaxRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No pending tax records found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Purchase Order</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>PAN Number</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>TDS Amount</TableHead>
                      <TableHead>Net Payable</TableHead>
                      <TableHead>Financial Quarter</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTaxRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedRecords.includes(record.id)}
                            onChange={() => handleRecordSelection(record.id)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {record.purchase_orders?.order_number}
                        </TableCell>
                        <TableCell>{record.purchase_orders?.supplier_name}</TableCell>
                        <TableCell>{record.pan_number}</TableCell>
                        <TableCell>₹{record.total_amount.toLocaleString()}</TableCell>
                        <TableCell>₹{record.tds_amount.toLocaleString()}</TableCell>
                        <TableCell>₹{record.net_payable_amount.toLocaleString()}</TableCell>
                        <TableCell>{getFinancialQuarter(record.deduction_date)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">Pending</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Filed Tax Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filedTaxRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No filed tax records found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Purchase Order</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>PAN Number</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>TDS Amount</TableHead>
                      <TableHead>Certificate No.</TableHead>
                      <TableHead>Financial Quarter</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filedTaxRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.purchase_orders?.order_number}
                        </TableCell>
                        <TableCell>{record.purchase_orders?.supplier_name}</TableCell>
                        <TableCell>{record.pan_number}</TableCell>
                        <TableCell>₹{record.total_amount.toLocaleString()}</TableCell>
                        <TableCell>₹{record.tds_amount.toLocaleString()}</TableCell>
                        <TableCell>{record.tds_certificate_number}</TableCell>
                        <TableCell>{getFinancialQuarter(record.deduction_date)}</TableCell>
                        <TableCell>
                          <Badge variant="default">Filed</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File TDS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="certificate">TDS Certificate Number</Label>
              <Input
                id="certificate"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="Enter certificate number"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFileDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => fileTdsMutation.mutate()}
                disabled={fileTdsMutation.isPending}
              >
                {fileTdsMutation.isPending ? "Filing..." : "File TDS"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
