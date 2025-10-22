
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Phone, Mail, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

const communicationModes = ["Email", "Call", "Letter", "Meeting"];

export function BankCommunicationsTab() {
  const [showBankCommDialog, setShowBankCommDialog] = useState(false);
  const [newComm, setNewComm] = useState({
    bank_name: "",
    contact_person: "",
    mode: "",
    notes: "",
    communication_date: new Date().toISOString().split('T')[0]
  });
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");

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
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Bank Communications</CardTitle>
          <ViewOnlyWrapper isViewOnly={!canManage}>
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
          </ViewOnlyWrapper>
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
  );
}
