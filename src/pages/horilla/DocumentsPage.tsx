import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileSignature, FilePlus2, Archive, PenLine, Library, Users, Clock } from "lucide-react";
import TemplatesTab from "@/components/hrms/documents/TemplatesTab";
import SignatoriesTab from "@/components/hrms/documents/SignatoriesTab";
import CompanyLibraryTab from "@/components/hrms/documents/CompanyLibraryTab";
import EmployeeFilesTab from "@/components/hrms/documents/EmployeeFilesTab";

export default function DocumentsPage() {
  const [tab, setTab] = useState("templates");

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Documents"
        description="Letter templates, generation and the company document library"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="templates" className="gap-1.5"><FileSignature className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5"><FilePlus2 className="h-4 w-4" />Generate</TabsTrigger>
          <TabsTrigger value="issued" className="gap-1.5"><Archive className="h-4 w-4" />Issued</TabsTrigger>
          <TabsTrigger value="signatories" className="gap-1.5"><PenLine className="h-4 w-4" />Signatories</TabsTrigger>
          <TabsTrigger value="library" className="gap-1.5"><Library className="h-4 w-4" />Company library</TabsTrigger>
          <TabsTrigger value="employee-files" className="gap-1.5"><Users className="h-4 w-4" />Employee files</TabsTrigger>
        </TabsList>

        <TabsContent value="templates"><TemplatesTab /></TabsContent>

        <TabsContent value="generate">
          <EmptyState
            icon={Clock}
            title="Generation arrives in the next phase"
            description="Templates, variable mapping and the signatory registry are live. Letter rendering waits on the PDF-engine decision."
          />
        </TabsContent>

        <TabsContent value="issued">
          <EmptyState
            icon={Clock}
            title="No letters issued yet"
            description="Once generation is switched on, every issued letter appears here with its reference number, frozen values and audit trail."
          />
        </TabsContent>

        <TabsContent value="signatories"><SignatoriesTab /></TabsContent>
        <TabsContent value="library"><CompanyLibraryTab /></TabsContent>
        <TabsContent value="employee-files"><EmployeeFilesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
