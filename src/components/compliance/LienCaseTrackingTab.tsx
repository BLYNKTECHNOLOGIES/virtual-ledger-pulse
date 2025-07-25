import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Filter, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddLienUpdateDialog } from "./AddLienUpdateDialog";
import { ViewTimelineDialog } from "./ViewTimelineDialog";

const indianStates = [
  "N/A", "Unknown",
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry"
];

export function LienCaseTrackingTab() {
  const [showNewLienDialog, setShowNewLienDialog] = useState(false);
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>("placeholder");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [newLien, setNewLien] = useState({
    bank_account_id: "",
    date_imposed: "",
    acknowledgment_number: "",
    lawyer: "",
    amount: "",
    city: "",
    state: ""
  });
  const { toast } = useToast();

  // Fetch bank accounts with error handling
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('bank_accounts')
          .select('*')
          .order('bank_name');
        if (error) {
          console.error('Error fetching bank accounts:', error);
          throw error;
        }
        return data || [];
      } catch (error) {
        console.error('Query error:', error);
        return [];
      }
    },
  });

  // Fetch lien cases with comprehensive error handling
  const { data: lienCases, refetch: refetchLiens } = useQuery({
    queryKey: ['lien_cases', selectedBankFilter, selectedStatusFilter],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('lien_cases')
          .select('*, bank_accounts(bank_name, account_name)')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching lien cases:', error);
          throw error;
        }
        
        let lienData = data || [];
        
        // Filter by bank if selected
        if (selectedBankFilter && selectedBankFilter !== "placeholder") {
          lienData = lienData.filter(lien => 
            lien.bank_accounts?.bank_name === selectedBankFilter
          );
        }
        
        // Filter by status if selected
        if (selectedStatusFilter !== "all") {
          lienData = lienData.filter(lien => lien.status === selectedStatusFilter);
        }
        
        return lienData;
      } catch (error) {
        console.error('Lien cases query error:', error);
        return [];
      }
    },
  });

  // Get unique bank names for filter with safe fallback
  const uniqueBankNames = Array.from(new Set((bankAccounts || []).map(account => account.bank_name).filter(Boolean)));

  const generateLienNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('lien_cases')
        .select('lien_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) return "LIEN-0001";

      if (!data || data.length === 0) return "LIEN-0001";

      const lastNumber = parseInt(data[0].lien_number.split('-')[1]) || 0;
      return `LIEN-${String(lastNumber + 1).padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating lien number:', error);
      return "LIEN-0001";
    }
  };

  const handleReportLien = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const lienNumber = await generateLienNumber();
      
      const { error } = await supabase
        .from('lien_cases')
        .insert([{
          lien_number: lienNumber,
          bank_account_id: newLien.bank_account_id,
          date_imposed: newLien.date_imposed,
          acknowledgment_number: newLien.acknowledgment_number,
          lawyer: newLien.lawyer,
          amount: Number(newLien.amount),
          city: newLien.city,
          state: newLien.state
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Lien ${lienNumber} reported successfully`,
      });

      setNewLien({
        bank_account_id: "",
        date_imposed: "",
        acknowledgment_number: "",
        lawyer: "",
        amount: "",
        city: "",
        state: ""
      });
      setShowNewLienDialog(false);
      refetchLiens();
    } catch (error) {
      console.error('Error reporting lien:', error);
      toast({
        title: "Error",
        description: "Failed to report lien",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Lien Case Tracking
          </CardTitle>
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={selectedBankFilter} onValueChange={setSelectedBankFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by bank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>
                    Select a bank
                  </SelectItem>
                  {uniqueBankNames
                    .filter(bankName => bankName && bankName.trim() !== "")
                    .map((bankName) => (
                      <SelectItem key={bankName} value={bankName}>
                        {bankName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedBankFilter && selectedBankFilter !== "placeholder" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBankFilter("placeholder")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              {selectedStatusFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStatusFilter("all")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Dialog open={showNewLienDialog} onOpenChange={setShowNewLienDialog}>
              <DialogTrigger asChild>
                <Button className="bg-red-600 hover:bg-red-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Report New Lien
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Report New Lien</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleReportLien} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Bank Account *</Label>
                      <Select 
                        value={newLien.bank_account_id} 
                        onValueChange={(value) => setNewLien(prev => ({ ...prev, bank_account_id: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {(bankAccounts || []).map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.bank_name} - {account.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Date of Lien *</Label>
                      <Input
                        type="date"
                        value={newLien.date_imposed}
                        onChange={(e) => setNewLien(prev => ({ ...prev, date_imposed: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Acknowledgment Number</Label>
                      <Input
                        value={newLien.acknowledgment_number}
                        onChange={(e) => setNewLien(prev => ({ ...prev, acknowledgment_number: e.target.value }))}
                        placeholder="ACK-2024-001"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Lawyer</Label>
                      <Input
                        value={newLien.lawyer}
                        onChange={(e) => setNewLien(prev => ({ ...prev, lawyer: e.target.value }))}
                        placeholder="Lawyer name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Lien Amount *</Label>
                      <Input
                        type="number"
                        value={newLien.amount}
                        onChange={(e) => setNewLien(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={newLien.city}
                        onChange={(e) => setNewLien(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="City name"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select 
                      value={newLien.state} 
                      onValueChange={(value) => setNewLien(prev => ({ ...prev, state: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {indianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowNewLienDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Report Lien</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {(lienCases || []).map((lien) => (
            <div key={lien.id} className={`border rounded-lg p-4 ${lien.status === 'Resolved' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className={`font-medium ${lien.status === 'Resolved' ? 'text-green-900' : 'text-red-900'}`}>{lien.lien_number}</h4>
                  <p className={`text-sm ${lien.status === 'Resolved' ? 'text-green-700' : 'text-red-700'}`}>
                    {lien.bank_accounts?.bank_name} - {lien.bank_accounts?.account_name}
                  </p>
                </div>
                <Badge variant={lien.status === 'Resolved' ? 'default' : lien.status === 'Active' ? 'destructive' : 'secondary'} className={lien.status === 'Resolved' ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}>
                  {lien.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className={lien.status === 'Resolved' ? 'text-green-600' : 'text-red-600'}>Amount:</span> ₹{Number(lien.amount).toLocaleString()}
                </div>
                <div>
                  <span className={lien.status === 'Resolved' ? 'text-green-600' : 'text-red-600'}>Date:</span> {new Date(lien.date_imposed).toLocaleDateString()}
                </div>
                {lien.city && (
                  <div>
                    <span className={lien.status === 'Resolved' ? 'text-green-600' : 'text-red-600'}>Location:</span> {lien.city}, {lien.state}
                  </div>
                )}
                {lien.lawyer && (
                  <div>
                    <span className={lien.status === 'Resolved' ? 'text-green-600' : 'text-red-600'}>Lawyer:</span> {lien.lawyer}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <AddLienUpdateDialog 
                  lienCaseId={lien.id} 
                  onUpdateAdded={() => refetchLiens()} 
                />
                <ViewTimelineDialog lienCaseId={lien.id} />
              </div>
            </div>
          ))}
          
          {(!lienCases || lienCases.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              No lien cases found. {(selectedBankFilter && selectedBankFilter !== "placeholder") || selectedStatusFilter !== "all" ? "Try removing the filters or" : ""} Report your first lien case to get started.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
