import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function AccountStatusTab() {
  const [showInvestigationDialog, setShowInvestigationDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [investigationData, setInvestigationData] = useState({
    type: "",
    reason: "",
    priority: "MEDIUM",
    notes: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: activeInvestigations } = useQuery({
    queryKey: ['active_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select('bank_account_id, priority, investigation_type, reason, created_at')
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return data;
    },
  });

  const { data: completedInvestigations } = useQuery({
    queryKey: ['completed_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select('*, bank_accounts(bank_name, account_name)')
        .eq('status', 'COMPLETED')
        .order('resolved_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleStartInvestigation = (account: any) => {
    setSelectedAccount(account);
    setShowInvestigationDialog(true);
  };

  const groupedAccounts = {
    underInvestigation: bankAccounts?.filter(account => 
      activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || [],
    active: bankAccounts?.filter(account => 
      account.status === 'ACTIVE' && 
      !activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || [],
    inactive: bankAccounts?.filter(account => 
      account.status !== 'ACTIVE' && 
      !activeInvestigations?.some(inv => inv.bank_account_id === account.id)
    ) || []
  };

  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'MEDIUM': return 'bg-warning/10 text-warning border-warning/20';
      case 'LOW': return 'bg-success/10 text-success border-success/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityCardStyle = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'border-destructive/30 bg-destructive/5 shadow-md ring-1 ring-destructive/10';
      case 'MEDIUM': return 'border-warning/30 bg-warning/5 shadow-md ring-1 ring-warning/10';
      case 'LOW': return 'border-success/30 bg-success/5 shadow-md ring-1 ring-success/10';
      default: return 'border-border bg-muted/30 shadow-md ring-1 ring-border';
    }
  };

  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return { title: 'text-destructive', subtitle: 'text-destructive/80', balance: 'text-destructive/90' };
      case 'MEDIUM': return { title: 'text-warning', subtitle: 'text-warning/80', balance: 'text-warning/90' };
      case 'LOW': return { title: 'text-success', subtitle: 'text-success/80', balance: 'text-success/90' };
      default: return { title: 'text-foreground', subtitle: 'text-muted-foreground', balance: 'text-foreground/80' };
    }
  };

  const renderInvestigationCard = (account: any, investigation: any) => {
    const priority = investigation?.priority || 'MEDIUM';
    const priorityBadgeStyle = getPriorityBadgeStyle(priority);
    const priorityCardStyle = getPriorityCardStyle(priority);
    const textColors = getPriorityTextColor(priority);

    return (
      <div 
        key={account.id} 
        className={`${priorityCardStyle} rounded-lg p-4 transition-all duration-200`}
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className={`font-medium ${textColors.title}`}>
              {account.bank_name}
            </h4>
            <p className={`text-sm ${textColors.subtitle}`}>
              {account.account_name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
              {account.status}
            </Badge>
            <Badge variant="secondary" className={priorityBadgeStyle}>
              {priority} Priority
            </Badge>
            <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">
              Under Investigation
            </Badge>
          </div>
        </div>
        <p className={`text-sm mb-2 ${textColors.balance}`}>
          Balance: ₹{Number(account.balance).toLocaleString()}
        </p>
      </div>
    );
  };

  const renderAccountCard = (account: any, isUnderInvestigation = false, isInactive = false) => (
    <div 
      key={account.id} 
      className={`border rounded-lg p-4 transition-all duration-200 ${
        isInactive
        ? 'border-destructive/30 bg-destructive/5 hover:shadow-sm hover:bg-destructive/10'
        : 'border-border bg-card hover:shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className={`font-medium ${
            isInactive 
            ? 'text-destructive' 
            : 'text-foreground'
          }`}>
            {account.bank_name}
          </h4>
          <p className={`text-sm ${
            isInactive 
            ? 'text-destructive/80' 
            : 'text-muted-foreground'
          }`}>
            {account.account_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>
            {account.status}
          </Badge>
        </div>
      </div>
      <p className={`text-sm mb-2 ${
        isInactive 
        ? 'text-destructive/90' 
        : 'text-muted-foreground'
      }`}>
        Balance: ₹{Number(account.balance).toLocaleString()}
      </p>
      {account.status !== 'ACTIVE' && !isUnderInvestigation && (
        <Button 
          size="sm" 
          variant="outline" 
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
          onClick={() => handleStartInvestigation(account)}
        >
          Start Investigation
        </Button>
      )}
    </div>
  );

  const renderAccountGroup = (title: string, accounts: any[], iconColor: string, isUnderInvestigation = false, isInactive = false) => {
    if (accounts.length === 0) return null;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className={`w-3 h-3 rounded-full ${iconColor}`}></div>
          <h3 className="text-lg font-semibold text-foreground">
            {title} ({accounts.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account => renderAccountCard(account, isUnderInvestigation, isInactive))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {groupedAccounts.underInvestigation.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-warning"></div>
              <h3 className="text-lg font-semibold text-foreground">
                🚨 Under Investigation ({groupedAccounts.underInvestigation.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedAccounts.underInvestigation.map(account => {
                const investigation = activeInvestigations?.find(inv => inv.bank_account_id === account.id);
                const priority = investigation?.priority || 'MEDIUM';
                const priorityBadgeStyle = getPriorityBadgeStyle(priority);
                const priorityCardStyle = getPriorityCardStyle(priority);
                const textColors = getPriorityTextColor(priority);

                return (
                  <div key={account.id} className={`${priorityCardStyle} rounded-lg p-4 transition-all duration-200`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className={`font-medium ${textColors.title}`}>{account.bank_name}</h4>
                        <p className={`text-sm ${textColors.subtitle}`}>{account.account_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={account.status === 'ACTIVE' ? 'default' : 'destructive'}>{account.status}</Badge>
                        <Badge variant="secondary" className={priorityBadgeStyle}>{priority} Priority</Badge>
                        <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">Under Investigation</Badge>
                      </div>
                    </div>
                    <p className={`text-sm mb-2 ${textColors.balance}`}>Balance: ₹{Number(account.balance).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {groupedAccounts.active.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-success"></div>
              <h3 className="text-lg font-semibold text-foreground">Active Accounts ({groupedAccounts.active.length})</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedAccounts.active.map(account => (
                <div key={account.id} className="border border-border rounded-lg p-4 bg-card hover:shadow-sm transition-all duration-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-foreground">{account.bank_name}</h4>
                      <p className="text-sm text-muted-foreground">{account.account_name}</p>
                    </div>
                    <Badge variant="default">{account.status}</Badge>
                  </div>
                  <p className="text-sm mb-2 text-muted-foreground">Balance: ₹{Number(account.balance).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {groupedAccounts.inactive.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-destructive"></div>
              <h3 className="text-lg font-semibold text-foreground">Inactive Accounts ({groupedAccounts.inactive.length})</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedAccounts.inactive.map(account => (
                <div key={account.id} className="border border-destructive/30 rounded-lg p-4 bg-destructive/5 hover:shadow-sm hover:bg-destructive/10 transition-all duration-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-destructive">{account.bank_name}</h4>
                      <p className="text-sm text-destructive/80">{account.account_name}</p>
                    </div>
                    <Badge variant="destructive">{account.status}</Badge>
                  </div>
                  <p className="text-sm mb-2 text-destructive/90">Balance: ₹{Number(account.balance).toLocaleString()}</p>
                  <Button size="sm" variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50" onClick={() => handleStartInvestigation(account)}>
                    Start Investigation
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedInvestigations && completedInvestigations.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
              <h3 className="text-lg font-semibold text-foreground">📋 Past Cases ({completedInvestigations.length})</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedInvestigations.map(investigation => (
                <div key={investigation.id} className="border border-border rounded-lg p-4 bg-muted/30">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-foreground">{investigation.bank_accounts?.bank_name || 'Unknown Bank'}</h4>
                      <p className="text-sm text-muted-foreground">{investigation.bank_accounts?.account_name || 'Unknown Account'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="bg-success/10 text-success border-success/20">COMPLETED</Badge>
                      <Badge variant="secondary" className={getPriorityBadgeStyle(investigation.priority)}>{investigation.priority} Priority</Badge>
                    </div>
                  </div>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <p><span className="font-medium">Type:</span> {investigation.investigation_type?.replace('_', ' ')}</p>
                    <p><span className="font-medium">Reason:</span> {investigation.reason}</p>
                    <p><span className="font-medium">Resolved:</span> {investigation.resolved_at ? new Date(investigation.resolved_at).toLocaleDateString() : 'N/A'}</p>
                    {investigation.resolution_notes && <p><span className="font-medium">Resolution:</span> {investigation.resolution_notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      <Dialog open={showInvestigationDialog} onOpenChange={setShowInvestigationDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Start Investigation - {selectedAccount?.account_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Investigation Type *</Label>
              <Select value={investigationData.type} onValueChange={(value) => setInvestigationData(prev => ({ ...prev, type: value }))} required>
                <SelectTrigger><SelectValue placeholder="Select investigation type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compliance_review">Compliance Review</SelectItem>
                  <SelectItem value="cyber_lien">Cyber Lien</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={investigationData.priority} onValueChange={(value) => setInvestigationData(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason for Investigation *</Label>
              <Textarea value={investigationData.reason} onChange={(e) => setInvestigationData(prev => ({ ...prev, reason: e.target.value }))} placeholder="Enter the reason for starting this investigation" rows={3} required />
            </div>

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea value={investigationData.notes} onChange={(e) => setInvestigationData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Enter any additional notes" rows={2} />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowInvestigationDialog(false)}>Cancel</Button>
              <Button type="button" onClick={async (e) => {
                e.preventDefault();
                if (!investigationData.type || !investigationData.reason.trim()) {
                  toast({ title: "Validation Error", description: "Please fill in all required fields (Investigation Type and Reason).", variant: "destructive" });
                  return;
                }
                try {
                  const { error } = await supabase.from('account_investigations').insert({
                    bank_account_id: selectedAccount.id,
                    investigation_type: investigationData.type,
                    reason: investigationData.reason,
                    priority: investigationData.priority,
                    notes: investigationData.notes,
                    assigned_to: 'Current User',
                    status: 'ACTIVE'
                  });
                  if (error) {
                    toast({ title: "Error", description: error.message || "Failed to start investigation. Please try again.", variant: "destructive" });
                    return;
                  }
                  toast({ title: "Investigation Started", description: `Investigation "${investigationData.type}" started for ${selectedAccount?.account_name}` });
                  queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
                  queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
                  setShowInvestigationDialog(false);
                  setInvestigationData({ type: "", reason: "", priority: "MEDIUM", notes: "" });
                  setSelectedAccount(null);
                } catch (error: any) {
                  toast({ title: "Error", description: error.message || "Failed to start investigation. Please try again.", variant: "destructive" });
                }
              }}>Start Investigation</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
