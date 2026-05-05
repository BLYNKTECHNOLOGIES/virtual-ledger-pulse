import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, MessageSquare, Key, Search, Archive } from "lucide-react";
import { CaseTrackingTab } from "./CaseTrackingTab";
import { ActiveInvestigationsTab } from "./ActiveInvestigationsTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";
import { BankingCredentialsTab } from "./BankingCredentialsTab";
import { PastInvestigationsTab } from "./PastInvestigationsTab";

const triggerCls =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium gap-1.5 md:gap-2 whitespace-nowrap";

export function BankingComplianceTab() {
  return (
    <Tabs defaultValue="cases" className="space-y-6">
      <TabsList className="h-auto w-full justify-start gap-1 bg-transparent border-b border-border rounded-none p-0 overflow-x-auto">
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

      <TabsContent value="cases"><CaseTrackingTab /></TabsContent>
      <TabsContent value="active-investigations"><ActiveInvestigationsTab /></TabsContent>
      <TabsContent value="past-investigations"><PastInvestigationsTab /></TabsContent>
      <TabsContent value="bank-communications"><BankCommunicationsTab /></TabsContent>
      <TabsContent value="banking-credentials"><BankingCredentialsTab /></TabsContent>
    </Tabs>
  );
}
