
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Plus } from "lucide-react";
import { NewVideoKYCTab } from "./video-kyc/NewVideoKYCTab";
import { CompletedVideoKYCTab } from "./video-kyc/CompletedVideoKYCTab";

export function VideoKYCTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Video className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Video KYC Management</h2>
      </div>

      <Tabs defaultValue="new" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Video KYC
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Completed Video KYC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <NewVideoKYCTab />
        </TabsContent>

        <TabsContent value="completed">
          <CompletedVideoKYCTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
