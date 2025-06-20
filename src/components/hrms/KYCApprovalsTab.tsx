
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Clock, MessageSquare, XCircle, CheckCircle } from "lucide-react";
import { PendingKYCTab } from "./kyc-approvals/PendingKYCTab";
import { QueriesTab } from "./kyc-approvals/QueriesTab";
import { RejectedKYCTab } from "./kyc-approvals/RejectedKYCTab";
import { AcceptedKYCTab } from "./kyc-approvals/AcceptedKYCTab";

export function KYCApprovalsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">KYC Approvals</h2>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending KYC
          </TabsTrigger>
          <TabsTrigger value="queries" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Queries
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected KYC
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Accepted KYC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingKYCTab />
        </TabsContent>

        <TabsContent value="queries">
          <QueriesTab />
        </TabsContent>

        <TabsContent value="rejected">
          <RejectedKYCTab />
        </TabsContent>

        <TabsContent value="accepted">
          <AcceptedKYCTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
