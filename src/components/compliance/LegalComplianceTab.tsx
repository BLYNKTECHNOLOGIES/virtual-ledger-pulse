import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, MessageSquare } from "lucide-react";
import { DocumentManagementTab } from "./DocumentManagementTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { LegalCommunicationsTab } from "./LegalCommunicationsTab";

const triggerCls =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium gap-1.5 md:gap-2 whitespace-nowrap";

export function LegalComplianceTab() {
  return (
    <Tabs defaultValue="documents" className="space-y-6">
      <TabsList className="h-auto w-full justify-start gap-1 bg-transparent border-b border-border rounded-none p-0 overflow-x-auto">
        <TabsTrigger value="documents" className={triggerCls}>
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Document Management</span>
          <span className="sm:hidden">Documents</span>
        </TabsTrigger>
        <TabsTrigger value="legal-actions" className={triggerCls}>
          <Scale className="h-4 w-4" />
          <span className="hidden sm:inline">Legal Actions</span>
          <span className="sm:hidden">Legal</span>
        </TabsTrigger>
        <TabsTrigger value="communications" className={triggerCls}>
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Legal Communications</span>
          <span className="sm:hidden">Comms.</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="documents"><DocumentManagementTab /></TabsContent>
      <TabsContent value="legal-actions"><LegalActionsTab /></TabsContent>
      <TabsContent value="communications"><LegalCommunicationsTab /></TabsContent>
    </Tabs>
  );
}
