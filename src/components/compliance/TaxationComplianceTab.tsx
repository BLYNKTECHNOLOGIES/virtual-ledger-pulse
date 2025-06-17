
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, FileCheck } from "lucide-react";

export function TaxationComplianceTab() {
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

  // Separate pending and filed records
  const pendingTaxRecords = tdsRecords?.filter(record => !record.tds_certificate_number) || [];
  const filedTaxRecords = tdsRecords?.filter(record => record.tds_certificate_number) || [];

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
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Pending Tax Records
              </CardTitle>
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
                      <TableHead>Purchase Order</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>PAN Number</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>TDS Amount</TableHead>
                      <TableHead>Net Payable</TableHead>
                      <TableHead>Financial Year</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTaxRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.purchase_orders?.order_number}
                        </TableCell>
                        <TableCell>{record.purchase_orders?.supplier_name}</TableCell>
                        <TableCell>{record.pan_number}</TableCell>
                        <TableCell>₹{record.total_amount.toLocaleString()}</TableCell>
                        <TableCell>₹{record.tds_amount.toLocaleString()}</TableCell>
                        <TableCell>₹{record.net_payable_amount.toLocaleString()}</TableCell>
                        <TableCell>{record.financial_year}</TableCell>
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
                      <TableHead>Financial Year</TableHead>
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
                        <TableCell>{record.financial_year}</TableCell>
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
    </div>
  );
}
