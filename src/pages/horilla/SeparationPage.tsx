import { PageHeader } from "@/components/shared/PageHeader";
import { ResignationTab } from "@/components/hrms/ResignationTab";

export default function SeparationPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Separation"
        description="Manage employee resignations, offboarding, and exit processes"
      />
      <ResignationTab />
    </div>
  );
}
