
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Building2, MessageSquare } from "lucide-react";
import { LienCaseTrackingTab } from "./LienCaseTrackingTab";
import { AccountStatusTab } from "./AccountStatusTab";
import { BankCommunicationsTab } from "./BankCommunicationsTab";

export function BankingComplianceTab() {
  return (
    <Tabs defaultValue="lien-cases" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="lien-cases" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Lien Case Tracking
        </TabsTrigger>
        <TabsTrigger value="account-status" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Account Status
        </TabsTrigger>
        <TabsTrigger value="bank-communications" className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Bank Communications
        </TabsTrigger>
      </TabsList>

      <TabsContent value="lien-cases">
        <LienCaseTrackingTab />
      </TabsContent>

      <TabsContent value="account-status">
        <AccountStatusTab />
      </TabsContent>

      <TabsContent value="bank-communications">
        <BankCommunicationsTab />
      </TabsContent>
    </Tabs>
  );
}
