import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, MessageSquare, Key, Search, Archive } from "lucide-react";
import { CaseTrackingTab } from "./CaseTrackingTab";
import { ActiveInvestigationsTab } from "./ActiveInvestigationsTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";
import { BankingCredentialsTab } from "./BankingCredentialsTab";
import { PastInvestigationsTab } from "./PastInvestigationsTab";

import { complianceTabsListCls, complianceTabTriggerCls, complianceTabsWrapperCls } from "./complianceTabStyles";

const triggerCls = complianceTabTriggerCls;

export function BankingComplianceTab() {
  return (
    <Tabs defaultValue="cases" className="space-y-6">
      <div className={complianceTabsWrapperCls}>
        <TabsList className={complianceTabsListCls}>
          <TabsTrigger value="cases" className={triggerCls}>
            <AlertTriangle className="h-4 w-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="active-investigations" className={triggerCls}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Active Investigations</span>
            <span className="sm:hidden">Active</span>
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

      <TabsContent value="cases"><CaseTrackingTab /></TabsContent>
      <TabsContent value="active-investigations"><ActiveInvestigationsTab /></TabsContent>
      <TabsContent value="past-investigations"><PastInvestigationsTab /></TabsContent>
      <TabsContent value="bank-communications"><BankCommunicationsTab /></TabsContent>
      <TabsContent value="banking-credentials"><BankingCredentialsTab /></TabsContent>
    </Tabs>
  );
}
