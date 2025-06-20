
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Calendar, CheckCircle } from "lucide-react";
import { NewVideoKYCTab } from "./NewVideoKYCTab";
import { CompletedVideoKYCTab } from "./CompletedVideoKYCTab";

export function VideoKYCTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Video className="h-6 w-6 text-purple-600" />
        <h3 className="text-xl font-semibold">Video KYC Management</h3>
      </div>

      <Tabs defaultValue="new" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            New Video KYC
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed KYC
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
