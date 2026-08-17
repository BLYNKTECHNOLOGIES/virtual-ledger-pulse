import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, MessageSquare, Key, Search, Archive, Activity, Clock, ShieldAlert } from "lucide-react";
import { CaseTrackingTab } from "./CaseTrackingTab";
import { ActiveInvestigationsTab } from "./ActiveInvestigationsTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";
import { BankingCredentialsTab } from "./BankingCredentialsTab";
import { PastInvestigationsTab } from "./PastInvestigationsTab";
import { AccountStatusTab } from "./AccountStatusTab";
import { PendingApprovalsTab } from "./PendingApprovalsTab";
import { LienCaseTrackingTab } from "./LienCaseTrackingTab";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { complianceTabsListCls, complianceTabTriggerCls, complianceTabsWrapperCls } from "./complianceTabStyles";

const triggerCls = complianceTabTriggerCls;

export function BankingComplianceTab() {
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission("compliance_approve");

  const { data: pendingCount } = useQuery({
    queryKey: ['pending_approvals_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('investigation_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'PENDING');
      if (error) throw error;
      return count || 0;
    },
    enabled: canApprove,
  });

  return (
    <Tabs defaultValue="account-status" className="space-y-6">
      <div className={complianceTabsWrapperCls}>
        <TabsList className={complianceTabsListCls}>
          <TabsTrigger value="account-status" className={triggerCls}>
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Account Status</span>
            <span className="sm:hidden">Status</span>
          </TabsTrigger>
          <TabsTrigger value="cases" className={triggerCls}>
            <AlertTriangle className="h-4 w-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="liens" className={triggerCls}>
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Lien Cases</span>
            <span className="sm:hidden">Liens</span>
          </TabsTrigger>
          <TabsTrigger value="active-investigations" className={triggerCls}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Active Investigations</span>
            <span className="sm:hidden">Active</span>
          </TabsTrigger>
          <TabsTrigger value="pending-approvals" className={triggerCls}>
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Pending Approvals</span>
            <span className="sm:hidden">Pending</span>
            {canApprove && pendingCount && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-destructive text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past-investigations" className={triggerCls}>
            <Archive className="h-4 w-4" />
            <span className="hidden sm:inline">Past Cases</span>
            <span className="sm:hidden">Past</span>
          </TabsTrigger>
          <TabsTrigger value="bank-communications" className={triggerCls}>
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Communications</span>
            <span className="sm:hidden">Comms.</span>
          </TabsTrigger>
          <TabsTrigger value="banking-credentials" className={triggerCls}>
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">Credentials</span>
            <span className="sm:hidden">Creds.</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="account-status"><AccountStatusTab /></TabsContent>
      <TabsContent value="cases"><CaseTrackingTab /></TabsContent>
      <TabsContent value="liens"><LienCaseTrackingTab /></TabsContent>
      <TabsContent value="active-investigations"><ActiveInvestigationsTab /></TabsContent>
      <TabsContent value="pending-approvals"><PendingApprovalsTab /></TabsContent>
      <TabsContent value="past-investigations"><PastInvestigationsTab /></TabsContent>
      <TabsContent value="bank-communications"><BankCommunicationsTab /></TabsContent>
      <TabsContent value="banking-credentials"><BankingCredentialsTab /></TabsContent>
    </Tabs>
  );
}
