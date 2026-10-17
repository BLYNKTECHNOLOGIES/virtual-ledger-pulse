import { useSearchParams } from "react-router-dom";
import { Briefcase, Building2, GitBranch, Network } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgChartView } from "@/components/hrms/OrgChartView";
import { OrgStructureView } from "@/components/hrms/org/OrgStructureView";
import DepartmentsPage from "./DepartmentsPage";
import PositionsPage from "./PositionsPage";

const TABS = ["structure", "reporting", "departments", "designations"] as const;
type OrgTab = (typeof TABS)[number];

/**
 * The one place for the organisation's structure: the designed structure (designations and who they
 * report to), people's reporting lines, departments and designations. Every other screen reads these.
 */
export default function OrganizationPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") ?? "";
  const tab: OrgTab = (TABS as readonly string[]).includes(raw) ? (raw as OrgTab) : "structure";
  // Switching tabs drops the other tab's filters (e.g. ?planning=undecided).
  const setTab = (next: string) => {
    const n = new URLSearchParams();
    if (next !== "structure") n.set("tab", next);
    setParams(n, { replace: true });
  };

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Organization"
        description="Designations, departments and who reports to whom. Every other screen uses these."
      />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="structure" className="gap-1.5"><Network className="h-3.5 w-3.5" />Structure</TabsTrigger>
          <TabsTrigger value="reporting" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" />Reporting lines</TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Departments</TabsTrigger>
          <TabsTrigger value="designations" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Designations</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="mt-0">
          <OrgStructureView onEditDesignations={() => setTab("designations")} />
        </TabsContent>
        <TabsContent value="reporting" className="mt-0">
          <p className="mb-3 text-sm text-muted-foreground">Who each person actually reports to. Each card shows the person's designation and department.</p>
          <OrgChartView />
        </TabsContent>
        <TabsContent value="departments" className="mt-0">
          <DepartmentsPage embedded />
        </TabsContent>
        <TabsContent value="designations" className="mt-0">
          <PositionsPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
