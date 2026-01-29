
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Building2, MessageSquare, Key, Search, Archive } from "lucide-react";
import { CaseTrackingTab } from "./CaseTrackingTab";
import { ActiveInvestigationsTab } from "./ActiveInvestigationsTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";
import { BankingCredentialsTab } from "./BankingCredentialsTab";
import { PastInvestigationsTab } from "./PastInvestigationsTab";

export function BankingComplianceTab() {
  return (
    <Tabs defaultValue="cases" className="space-y-6">
      <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-5">
        <TabsTrigger value="cases" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
          <AlertTriangle className="h-4 w-4" />
          Cases
        </TabsTrigger>
        <TabsTrigger value="active-investigations" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Active Investigations</span>
          <span className="sm:hidden">Active</span>
        </TabsTrigger>
        <TabsTrigger value="past-investigations" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
          <Archive className="h-4 w-4" />
          <span className="hidden sm:inline">Past Cases</span>
          <span className="sm:hidden">Past</span>
        </TabsTrigger>
        <TabsTrigger value="bank-communications" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Communications</span>
          <span className="sm:hidden">Comms.</span>
        </TabsTrigger>
        <TabsTrigger value="banking-credentials" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
          <Key className="h-4 w-4" />
          <span className="hidden sm:inline">Credentials</span>
          <span className="sm:hidden">Creds.</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cases">
        <CaseTrackingTab />
      </TabsContent>

      <TabsContent value="active-investigations">
        <ActiveInvestigationsTab />
      </TabsContent>

      <TabsContent value="past-investigations">
        <PastInvestigationsTab />
      </TabsContent>

      <TabsContent value="bank-communications">
        <BankCommunicationsTab />
      </TabsContent>

      <TabsContent value="banking-credentials">
        <BankingCredentialsTab />
      </TabsContent>
    </Tabs>
  );
}
