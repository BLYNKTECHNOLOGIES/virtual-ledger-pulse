import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, MessageSquare } from "lucide-react";
import { DocumentManagementTab } from "./DocumentManagementTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { LegalCommunicationsTab } from "./LegalCommunicationsTab";

export function LegalComplianceTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Document Management
          </TabsTrigger>
          <TabsTrigger value="legal-actions" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Legal Actions
          </TabsTrigger>
          <TabsTrigger value="communications" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Legal Communications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentManagementTab />
        </TabsContent>

        <TabsContent value="legal-actions">
          <LegalActionsTab />
        </TabsContent>

        <TabsContent value="communications">
          <LegalCommunicationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}