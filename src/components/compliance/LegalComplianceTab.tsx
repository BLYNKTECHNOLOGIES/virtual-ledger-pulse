import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, MessageSquare } from "lucide-react";
import { DocumentManagementTab } from "./DocumentManagementTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { LegalCommunicationsTab } from "./LegalCommunicationsTab";

import { complianceSubTabsListCls, complianceSubTabTriggerCls, complianceSubTabsWrapperCls } from "./complianceTabStyles";

const triggerCls = complianceSubTabTriggerCls;

export function LegalComplianceTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = searchParams.get("sub") || "documents";
  const setSub = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("sub", value);
    if (value !== sub) next.delete("focus");
    setSearchParams(next, { replace: true });
  };
  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-4">
      <div className={complianceSubTabsWrapperCls}>
        <TabsList className={complianceSubTabsListCls}>
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
