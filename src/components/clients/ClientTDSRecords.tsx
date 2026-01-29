import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, FileCheck, IndianRupee, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ClientTDSRecordsProps {
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
}

export function ClientTDSRecords({ clientId, clientName, clientPhone }: ClientTDSRecordsProps) {
  const navigate = useNavigate();

  // Fetch client data if only clientId is provided
  const { data: client } = useQuery({
    queryKey: ['client-for-tds', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('name, phone')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !clientName,
  });

  const name = clientName || client?.name;
  const phone = clientPhone || client?.phone;

  // Fetch TDS records for this seller (by matching supplier_name in purchase_orders)
  const { data: tdsRecords, isLoading } = useQuery({
    queryKey: ['client-tds-records', name, phone],
    queryFn: async () => {
      if (!name) return [];
      
      // First get purchase order IDs for this supplier
      let query = supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, total_amount, order_date')
        .or(`supplier_name.eq.${name}${phone ? `,contact_number.eq.${phone}` : ''}`);
      
      const { data: purchaseOrders, error: poError } = await query;
      
      if (poError) throw poError;
      if (!purchaseOrders || purchaseOrders.length === 0) return [];

      const poIds = purchaseOrders.map(po => po.id);
      
      // Now get TDS records for these purchase orders
      const { data: tds, error: tdsError } = await supabase
        .from('tds_records')
        .select('*')
        .in('purchase_order_id', poIds)
        .order('created_at', { ascending: false });
      
      if (tdsError) throw tdsError;

      // Merge TDS records with purchase order info
      return (tds || []).map(record => {
        const po = purchaseOrders.find(p => p.id === record.purchase_order_id);
        return {
          ...record,
          order_number: po?.order_number,
          supplier_name: po?.supplier_name,
          order_date: po?.order_date,
        };
      });
    },
    enabled: !!name,
  });

  // Calculate statistics
  const stats = {
    totalTdsDeducted: tdsRecords?.reduce((sum, r) => sum + (r.tds_amount || 0), 0) || 0,
    pendingRecords: tdsRecords?.filter(r => !r.tds_certificate_number).length || 0,
    filedRecords: tdsRecords?.filter(r => r.tds_certificate_number).length || 0,
    totalRecords: tdsRecords?.length || 0,
  };

  // Get financial quarter
  const getFinancialQuarter = (date: string) => {
    const orderDate = new Date(date);
    const month = orderDate.getMonth() + 1;
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading TDS records...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-orange-600" />
            TDS Records (Seller)
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/compliance?tab=taxation')}
          >
            View in Compliance
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <IndianRupee className="h-4 w-4" />
              <span className="text-xs font-medium">Total TDS Deducted</span>
            </div>
            <p className="text-lg font-bold text-orange-700">
              ₹{stats.totalTdsDeducted.toLocaleString()}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-medium">Total Records</span>
            </div>
            <p className="text-lg font-bold text-blue-700">{stats.totalRecords}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <Receipt className="h-4 w-4" />
              <span className="text-xs font-medium">Pending Filing</span>
            </div>
            <p className="text-lg font-bold text-yellow-700">{stats.pendingRecords}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <FileCheck className="h-4 w-4" />
              <span className="text-xs font-medium">Filed</span>
            </div>
            <p className="text-lg font-bold text-green-700">{stats.filedRecords}</p>
          </div>
        </div>

        {/* TDS Records Table */}
        {tdsRecords && tdsRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>TDS Deducted</TableHead>
                  <TableHead>Net Paid</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tdsRecords.slice(0, 5).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.order_number}</TableCell>
                    <TableCell>{record.pan_number}</TableCell>
                    <TableCell>₹{record.total_amount?.toLocaleString()}</TableCell>
                    <TableCell className="text-orange-600 font-medium">
                      ₹{record.tds_amount?.toLocaleString()}
                    </TableCell>
                    <TableCell>₹{record.net_payable_amount?.toLocaleString()}</TableCell>
                    <TableCell>{getFinancialQuarter(record.deduction_date)}</TableCell>
                    <TableCell>
                      {record.tds_certificate_number ? (
                        <Badge className="bg-green-100 text-green-800">Filed</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tdsRecords.length > 5 && (
              <div className="text-center py-2 text-sm text-muted-foreground">
                Showing 5 of {tdsRecords.length} records. 
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={() => navigate('/compliance?tab=taxation')}
                  className="ml-1"
                >
                  View all in Compliance
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No TDS records found for this seller
          </div>
        )}
      </CardContent>
    </Card>
  );
}
