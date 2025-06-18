
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AddPayerDialog } from "./AddPayerDialog";
import { EditPayerDialog } from "./EditPayerDialog";

interface Payer {
  id: string;
  employee_id: string;
  safe_funds: boolean;
  payer_type: "UPI" | "Bank Transfer";
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
  employee: {
    name: string;
    employee_id: string;
    department: string;
  };
  payment_methods: Array<{
    id: string;
    bank_account_name: string;
    type: string;
    payment_limit: number;
  }>;
}

export function PayerManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPayer, setEditingPayer] = useState<Payer | null>(null);

  // Fetch payers with employee and payment method details
  const { data: payers, isLoading } = useQuery({
    queryKey: ['payers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payers')
        .select(`
          *,
          employee:employees(name, employee_id, department),
          payer_payment_methods(
            purchase_payment_methods(
              id,
              bank_account_name,
              type,
              payment_limit
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data?.map(payer => {
        // Safely cast payer_type with validation
        const allowedPayerTypes = ["UPI", "Bank Transfer"] as const;
        const payerType = allowedPayerTypes.includes(payer.payer_type as any) 
          ? payer.payer_type as "UPI" | "Bank Transfer"
          : "UPI";

        // Safely cast status with validation
        const allowedStatuses = ["ACTIVE", "INACTIVE"] as const;
        const status = allowedStatuses.includes(payer.status as any)
          ? payer.status as "ACTIVE" | "INACTIVE"
          : "ACTIVE";

        return {
          ...payer,
          payer_type: payerType,
          status: status,
          payment_methods: payer.payer_payment_methods?.map(
            (ppm: any) => ppm.purchase_payment_methods
          ) || []
        };
      }) || [];
    },
  });

  // Delete payer mutation
  const deletePayerMutation = useMutation({
    mutationFn: async (payerId: string) => {
      const { error } = await supabase
        .from('payers')
        .delete()
        .eq('id', payerId);

      if (error) throw error;
      return payerId;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payer deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['payers'] });
    },
    onError: (error) => {
      console.error('Error deleting payer:', error);
      toast({ title: "Error", description: "Failed to delete payer", variant: "destructive" });
    }
  });

  const handleDeletePayer = async (payerId: string) => {
    if (confirm('Are you sure you want to delete this payer?')) {
      deletePayerMutation.mutate(payerId);
    }
  };

  const handleEditPayer = (payer: Payer) => {
    setEditingPayer(payer);
  };

  const getStatusBadge = (status: string) => {
    return status === "ACTIVE" ? (
      <Badge className="bg-green-100 text-green-800">Active</Badge>
    ) : (
      <Badge className="bg-red-100 text-red-800">Inactive</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payer Management</h2>
          <p className="text-gray-600">Manage authorized payers for purchase orders</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Payer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Authorized Payers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading payers...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Safe Funds</TableHead>
                  <TableHead>Payer Type</TableHead>
                  <TableHead>Payment Methods</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payers?.map((payer) => (
                  <TableRow key={payer.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{payer.employee?.name}</div>
                        <div className="text-sm text-gray-500">ID: {payer.employee?.employee_id}</div>
                      </div>
                    </TableCell>
                    <TableCell>{payer.employee?.department}</TableCell>
                    <TableCell>
                      {payer.safe_funds ? (
                        <Badge className="bg-blue-100 text-blue-800">Safe</Badge>
                      ) : (
                        <Badge variant="outline">Regular</Badge>
                      )}
                    </TableCell>
                    <TableCell>{payer.payer_type}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {payer.payment_methods?.map((method, index) => (
                          <div key={method.id} className="text-sm">
                            <span className="font-medium">{method.bank_account_name}</span>
                            <span className="text-gray-500 ml-2">({method.type})</span>
                          </div>
                        ))}
                        {payer.payment_methods?.length === 0 && (
                          <span className="text-gray-400 text-sm">No methods assigned</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(payer.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPayer(payer)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePayer(payer.id)}
                          disabled={deletePayerMutation.isPending}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {payers?.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              No payers found. Add your first payer to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Payer Dialog */}
      <AddPayerDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
      />

      {/* Edit Payer Dialog */}
      <EditPayerDialog 
        open={!!editingPayer} 
        onOpenChange={(open) => !open && setEditingPayer(null)}
        payer={editingPayer}
      />
    </div>
  );
}
