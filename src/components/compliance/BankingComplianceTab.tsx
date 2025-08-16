
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Building2, MessageSquare, Key, Search, Archive } from "lucide-react";
import { CaseTrackingTab } from "./CaseTrackingTab";
import { AccountStatusTab } from "./AccountStatusTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";
import { BankingCredentialsTab } from "./BankingCredentialsTab";
import { ActiveInvestigationsTab } from "./ActiveInvestigationsTab";
import { PastInvestigationsTab } from "./PastInvestigationsTab";

export function BankingComplianceTab() {
  return (
    <Tabs defaultValue="cases" className="space-y-6">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="cases" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Cases
        </TabsTrigger>
        <TabsTrigger value="account-status" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Account Status
        </TabsTrigger>
        <TabsTrigger value="active-investigations" className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          Active Investigations
        </TabsTrigger>
        <TabsTrigger value="past-investigations" className="flex items-center gap-2">
          <Archive className="h-4 w-4" />
          Past Cases
        </TabsTrigger>
        <TabsTrigger value="bank-communications" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Communications
        </TabsTrigger>
        <TabsTrigger value="banking-credentials" className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          Credentials
        </TabsTrigger>
      </TabsList>

      <TabsContent value="cases">
        <CaseTrackingTab />
      </TabsContent>

      <TabsContent value="account-status">
        <AccountStatusTab />
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
