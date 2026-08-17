import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, MessageSquare } from "lucide-react";
import { DocumentManagementTab } from "./DocumentManagementTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { LegalCommunicationsTab } from "./LegalCommunicationsTab";

import { complianceTabsListCls, complianceTabTriggerCls, complianceTabsWrapperCls } from "./complianceTabStyles";

const triggerCls = complianceTabTriggerCls;

export function LegalComplianceTab() {
  return (
    <Tabs defaultValue="documents" className="space-y-6">
      <div className={complianceTabsWrapperCls}>
        <TabsList className={complianceTabsListCls}>
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
      </div>

      <TabsContent value="documents"><DocumentManagementTab /></TabsContent>
      <TabsContent value="legal-actions"><LegalActionsTab /></TabsContent>
      <TabsContent value="communications"><LegalCommunicationsTab /></TabsContent>
    </Tabs>
  );
}
