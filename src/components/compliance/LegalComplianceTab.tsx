import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, MessageSquare } from "lucide-react";
import { DocumentManagementTab } from "./DocumentManagementTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { LegalCommunicationsTab } from "./LegalCommunicationsTab";

export function LegalComplianceTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-3">
          <TabsTrigger value="documents" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Document Management</span>
            <span className="sm:hidden">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="legal-actions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Legal Actions</span>
            <span className="sm:hidden">Legal</span>
          </TabsTrigger>
          <TabsTrigger value="communications" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Legal Communications</span>
            <span className="sm:hidden">Comms.</span>
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