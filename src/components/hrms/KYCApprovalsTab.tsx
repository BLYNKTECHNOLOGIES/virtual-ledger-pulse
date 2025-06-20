
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck, Clock, CheckCircle, XCircle, HelpCircle, Video } from "lucide-react";
import { PendingApprovalsTab } from "./kyc/PendingApprovalsTab";
import { ApprovedKYCTab } from "./kyc/ApprovedKYCTab";
import { RejectedKYCTab } from "./kyc/RejectedKYCTab";
import { QueryKYCTab } from "./kyc/QueryKYCTab";
import { VideoKYCTab } from "./kyc/VideoKYCTab";

export function KYCApprovalsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileCheck className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">KYC Approvals</h2>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Approvals
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected
          </TabsTrigger>
          <TabsTrigger value="query" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Query
          </TabsTrigger>
          <TabsTrigger value="video-kyc" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Video KYC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingApprovalsTab />
        </TabsContent>

        <TabsContent value="approved">
          <ApprovedKYCTab />
        </TabsContent>

        <TabsContent value="rejected">
          <RejectedKYCTab />
        </TabsContent>

        <TabsContent value="query">
          <QueryKYCTab />
        </TabsContent>

        <TabsContent value="video-kyc">
          <VideoKYCTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
