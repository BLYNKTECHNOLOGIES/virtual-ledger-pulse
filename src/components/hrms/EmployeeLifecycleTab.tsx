import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCheck, FileText, LogOut, UserMinus } from "lucide-react";
import { EmployeeInformationTab } from "./EmployeeInformationTab";
import { OffboardingTab } from "./OffboardingTab";
import { OnboardingChecklistTab } from "./OnboardingChecklistTab";
import { ResignationTab } from "./ResignationTab";

export function EmployeeLifecycleTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="onboarding" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto whitespace-nowrap">
          <TabsTrigger value="onboarding" className="text-xs md:text-sm">Onboarding</TabsTrigger>
          <TabsTrigger value="employee-info" className="text-xs md:text-sm">Employee Info</TabsTrigger>
          <TabsTrigger value="resignation" className="text-xs md:text-sm">Resignation</TabsTrigger>
          <TabsTrigger value="offboarding" className="text-xs md:text-sm">Offboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding">
          <OnboardingChecklistTab />
        </TabsContent>

        <TabsContent value="employee-info">
          <EmployeeInformationTab />
        </TabsContent>

        <TabsContent value="resignation">
          <ResignationTab />
        </TabsContent>

        <TabsContent value="offboarding">
          <OffboardingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
