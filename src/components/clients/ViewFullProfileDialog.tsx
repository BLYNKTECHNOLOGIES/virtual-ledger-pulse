import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Calendar, Phone, Mail, MapPin, CreditCard, FileText, TrendingUp, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
 import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface ViewFullProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
  orders?: any[];
  kycData?: any[];
}

export function ViewFullProfileDialog({ open, onOpenChange, client, orders = [], kycData = [] }: ViewFullProfileDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({
    phone: "",
    email: "",
    state: ""
  });

  if (!client) return null;

  const startEditing = () => {
    setEditData({
      phone: client.phone || "",
      email: client.email || "",
      state: client.state || ""
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({ phone: "", email: "", state: "" });
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          phone: editData.phone || null,
          email: editData.email || null,
          state: editData.state || null
        })
        .eq("id", client.id);

      if (error) throw error;

      toast({
        title: "Updated",
        description: "Client details updated successfully."
      });

      queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating client:", error);
      toast({
        title: "Error",
        description: "Failed to update client details.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const totalOrders = orders.length;
  const totalVolume = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const avgOrderValue = totalOrders > 0 ? totalVolume / totalOrders : 0;
  const latestKyc = kycData[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Complete Client Profile - {client.name}
            </DialogTitle>
            {!isEditing ? (
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit Basic Details
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={cancelEditing} disabled={isSaving}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveChanges} disabled={isSaving}>
                  <Check className="h-4 w-4 mr-1" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="text-base font-semibold">{client.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Client ID</label>
                <p className="text-base font-mono">{client.client_id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Phone</label>
                {isEditing ? (
                  <Input
                    value={editData.phone}
                    onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone number"
                    className="mt-1"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{client.phone || 'Not provided'}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                {isEditing ? (
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Email address"
                    className="mt-1"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{client.email || 'Not provided'}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">State</label>
                {isEditing ? (
                  <Select
                    value={editData.state}
                    onValueChange={(value) => setEditData(prev => ({ ...prev, state: value }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES_AND_UTS.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{client.state || 'Not provided'}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Date of Onboarding</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(client.date_of_onboarding).toLocaleDateString()}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Assigned Operator</label>
                <p className="text-base">{client.assigned_operator || 'Unassigned'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Classification & Risk */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Classification & Risk</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Client Type</label>
                <Badge variant="outline" className="mt-1">
                  {client.client_type}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Risk Appetite</label>
                <Badge variant="outline" className="mt-1">
                  {client.risk_appetite}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Default Risk Level</label>
                <Badge variant="outline" className="mt-1">
                  {client.default_risk_level || 'MEDIUM'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Financial Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Monthly Limit</label>
                <p className="text-lg font-semibold">₹{client.monthly_limit?.toLocaleString() || 'Not set'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Current Month Used</label>
                <p className="text-lg font-semibold">₹{client.current_month_used?.toLocaleString() || '0'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">First Order Value</label>
                <p className="text-lg font-semibold text-green-600">₹{client.first_order_value?.toLocaleString() || '0'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Client Value Score</label>
                <p className="text-lg font-semibold text-blue-600">{client.client_value_score || 0}</p>
              </div>
            </CardContent>
          </Card>

          {/* Trading Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Trading Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Orders</label>
                <p className="text-2xl font-bold text-blue-600">{totalOrders}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Volume</label>
                <p className="text-2xl font-bold text-green-600">₹{totalVolume.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Average Order Value</label>
                <p className="text-2xl font-bold text-purple-600">₹{avgOrderValue.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* KYC Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                KYC Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">KYC Status</label>
                  <Badge variant={client.kyc_status === 'COMPLETED' ? 'default' : 'secondary'} className="mt-1">
                    {client.kyc_status}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Purpose of Buying</label>
                  <p className="text-base">{client.buying_purpose || 'Not specified'}</p>
                </div>
              </div>
              {latestKyc && (
                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <p className="text-sm font-medium">Latest KYC Submission</p>
                  <p className="text-sm text-muted-foreground">{new Date(latestKyc.created_at).toLocaleDateString()}</p>
                  {latestKyc.additional_info && (
                    <p className="text-sm mt-1">{latestKyc.additional_info}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bank Accounts */}
          {client.linked_bank_accounts && client.linked_bank_accounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Linked Bank Accounts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {client.linked_bank_accounts.map((account: any, index: number) => (
                    <div key={index} className="p-3 border rounded-md">
                      <p className="font-medium">{account.bank_name}</p>
                      <p className="text-sm text-muted-foreground">****{account.account_number?.slice(-4)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operator Notes */}
          {client.operator_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Operator Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{client.operator_notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}