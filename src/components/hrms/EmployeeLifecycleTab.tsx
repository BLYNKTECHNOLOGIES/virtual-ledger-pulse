import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeInformationTab } from "./EmployeeInformationTab";
import { OffboardingTab } from "./OffboardingTab";
import { ResignationTab } from "./ResignationTab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function EmployeeLifecycleTab() {
  const navigate = useNavigate();

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
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <Users className="h-10 w-10 mx-auto text-primary opacity-60" />
              <h3 className="text-lg font-semibold">Employee Onboarding Pipeline</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Manage the complete onboarding process — from basic details to salary setup, document collection, and final activation.
              </p>
              <Button onClick={() => navigate("/hrms/onboarding-pipeline")}>
                <ExternalLink className="h-4 w-4 mr-1" /> Open Onboarding Pipeline
              </Button>
            </CardContent>
          </Card>
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
