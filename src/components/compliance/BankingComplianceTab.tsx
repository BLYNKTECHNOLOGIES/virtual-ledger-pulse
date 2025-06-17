
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Phone, Mail, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddLienUpdateDialog } from "./AddLienUpdateDialog";
import { ViewTimelineDialog } from "./ViewTimelineDialog";

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry"
];

const communicationModes = ["Email", "Call", "Letter", "Meeting"];

export function BankingComplianceTab() {
  const [showNewLienDialog, setShowNewLienDialog] = useState(false);
  const [showBankCommDialog, setShowBankCommDialog] = useState(false);
  const [newLien, setNewLien] = useState({
    bank_account_id: "",
    date_imposed: "",
    acknowledgment_number: "",
    lawyer: "",
    amount: "",
    city: "",
    state: ""
  });
  const [newComm, setNewComm] = useState({
    bank_name: "",
    contact_person: "",
    mode: "",
    notes: "",
    communication_date: new Date().toISOString().split('T')[0]
  });
  const { toast } = useToast();

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch lien cases
  const { data: lienCases, refetch: refetchLiens } = useQuery({
    queryKey: ['lien_cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lien_cases')
        .select('*, bank_accounts(bank_name, account_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch bank communications
  const { data: bankComms, refetch: refetchComms } = useQuery({
    queryKey: ['bank_communications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_communications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generateLienNumber = async () => {
    const { data, error } = await supabase
      .from('lien_cases')
      .select('lien_number')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return "LIEN-0001";

    if (!data || data.length === 0) return "LIEN-0001";

    const lastNumber = parseInt(data[0].lien_number.split('-')[1]) || 0;
    return `LIEN-${String(lastNumber + 1).padStart(4, '0')}`;
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
      toast({
        title: "Error",
        description: "Failed to report lien",
        variant: "destructive",
      });
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('bank_communications')
        .insert([newComm]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Communication logged successfully",
      });

      setNewComm({
        bank_name: "",
        contact_person: "",
        mode: "",
        notes: "",
        communication_date: new Date().toISOString().split('T')[0]
      });
      setShowBankCommDialog(false);
      refetchComms();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log communication",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Lien Case Tracking */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Lien Case Tracking
            </CardTitle>
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
                          {bankAccounts?.map((account) => (
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
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {lienCases?.map((lien) => (
              <div key={lien.id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium text-red-900">{lien.lien_number}</h4>
                    <p className="text-sm text-red-700">
                      {lien.bank_accounts?.bank_name} - {lien.bank_accounts?.account_name}
                    </p>
                  </div>
                  <Badge variant={lien.status === 'Active' ? 'destructive' : 'secondary'}>
                    {lien.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-red-600">Amount:</span> ₹{Number(lien.amount).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-red-600">Date:</span> {new Date(lien.date_imposed).toLocaleDateString()}
                  </div>
                  {lien.city && (
                    <div>
                      <span className="text-red-600">Location:</span> {lien.city}, {lien.state}
                    </div>
                  )}
                  {lien.lawyer && (
                    <div>
                      <span className="text-red-600">Lawyer:</span> {lien.lawyer}
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
          </div>
        </CardContent>
      </Card>

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts?.map((account) => (
              <div key={account.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium">{account.bank_name}</h4>
                    <p className="text-sm text-gray-600">{account.account_name}</p>
                  </div>
                  <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
                    {account.status}
                  </Badge>
                </div>
                <p className="text-sm">Balance: ₹{Number(account.balance).toLocaleString()}</p>
                {account.status !== 'ACTIVE' && (
                  <Button size="sm" variant="outline" className="mt-2">
                    Start Investigation
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bank Communications */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Bank Communications</CardTitle>
            <Dialog open={showBankCommDialog} onOpenChange={setShowBankCommDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Log New Communication
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log Bank Communication</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddCommunication} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Bank Name *</Label>
                    <Input
                      value={newComm.bank_name}
                      onChange={(e) => setNewComm(prev => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="Bank name"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Contact Person *</Label>
                    <Input
                      value={newComm.contact_person}
                      onChange={(e) => setNewComm(prev => ({ ...prev, contact_person: e.target.value }))}
                      placeholder="Person name"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Mode of Communication *</Label>
                    <Select 
                      value={newComm.mode} 
                      onValueChange={(value) => setNewComm(prev => ({ ...prev, mode: value }))}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {communicationModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newComm.communication_date}
                      onChange={(e) => setNewComm(prev => ({ ...prev, communication_date: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={newComm.notes}
                      onChange={(e) => setNewComm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      placeholder="Communication details..."
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowBankCommDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Log Communication</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {bankComms?.map((comm) => (
              <div key={comm.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium">{comm.bank_name}</h4>
                    <p className="text-sm text-gray-600">Contact: {comm.contact_person}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {comm.mode === 'Email' && <Mail className="h-4 w-4" />}
                    {comm.mode === 'Call' && <Phone className="h-4 w-4" />}
                    {comm.mode === 'Letter' && <FileText className="h-4 w-4" />}
                    <span className="text-sm">{comm.mode}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{comm.notes}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(comm.communication_date).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
