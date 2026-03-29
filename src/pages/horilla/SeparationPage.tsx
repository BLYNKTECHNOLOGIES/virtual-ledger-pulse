import { ResignationTab } from "@/components/hrms/ResignationTab";

export default function SeparationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Separation</h1>
        <p className="text-muted-foreground text-sm">Manage employee resignations, offboarding, and exit processes</p>
      </div>
      <ResignationTab />
    </div>
  );
}
