
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Clock, History } from "lucide-react";
import { CreateConversionForm } from "./conversion/CreateConversionForm";
import { PendingConversionsTable } from "./conversion/PendingConversionsTable";
import { ConversionHistoryTable } from "./conversion/ConversionHistoryTable";
import { PermissionGate } from "@/components/PermissionGate";

export function InterProductConversionTab() {
  const [subTab, setSubTab] = useState("create");

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="create" className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending Approval
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <PermissionGate permissions={["stock_conversion_create"]}>
            <CreateConversionForm />
          </PermissionGate>
        </TabsContent>

        <TabsContent value="pending">
          <PermissionGate permissions={["stock_conversion_approve"]}>
            <PendingConversionsTable />
          </PermissionGate>
        </TabsContent>

        <TabsContent value="history">
          <ConversionHistoryTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
