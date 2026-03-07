
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCheck, FileText, Users, LogOut } from "lucide-react";
import { OnboardingDialog } from "./OnboardingDialog";
import { EmployeeInformationTab } from "./EmployeeInformationTab";
import { OffboardingTab } from "./OffboardingTab";

export function EmployeeLifecycleTab() {
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [checkedItems, setCheckedItems] = useState({
    documents: false,
    training: false,
    assets: false,
    welcome: false
  });

  const onboardingItems = [
    { id: 'documents', label: 'Documents Submission (ID proof, address proof)', checked: checkedItems.documents },
    { id: 'training', label: 'Training Schedules Completed', checked: checkedItems.training },
    { id: 'assets', label: 'Asset Allocation (laptop, ID card)', checked: checkedItems.assets },
    { id: 'welcome', label: 'Welcome Email Sent', checked: checkedItems.welcome }
  ];

  const allChecked = Object.values(checkedItems).every(Boolean);

  const handleCheckChange = (id: string, checked: boolean) => {
    setCheckedItems(prev => ({
      ...prev,
      [id]: checked
    }));
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="onboarding" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto whitespace-nowrap">
          <TabsTrigger value="onboarding" className="text-xs md:text-sm">Onboarding</TabsTrigger>
          <TabsTrigger value="employee-info" className="text-xs md:text-sm">Employee Info</TabsTrigger>
          <TabsTrigger value="status" className="text-xs md:text-sm">Status</TabsTrigger>
          <TabsTrigger value="offboarding" className="text-xs md:text-sm">Offboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <UserCheck className="h-5 w-5" />
                  Employee Onboarding
                </CardTitle>
                <Button 
                  onClick={() => setShowOnboardingDialog(true)}
                  disabled={!allChecked}
                  className={`w-full sm:w-auto ${!allChecked ? "opacity-50 cursor-not-allowed" : ""}`}
                  size="sm"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Start Onboarding
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <h3 className="font-semibold mb-4">Onboarding Checklist</h3>
                {onboardingItems.map((item) => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={item.id}
                      checked={item.checked}
                      onCheckedChange={(checked) => handleCheckChange(item.id, checked as boolean)}
                    />
                    <label htmlFor={item.id} className="text-sm">{item.label}</label>
                  </div>
                ))}
                
                {allChecked && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-medium">✓ All checklist items completed!</p>
                    <p className="text-green-600 text-sm">You can now start the onboarding process.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employee-info">
          <EmployeeInformationTab />
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Employee Status Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No status changes recorded</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offboarding">
          <OffboardingTab />
        </TabsContent>
      </Tabs>

      <OnboardingDialog 
        open={showOnboardingDialog} 
        onOpenChange={setShowOnboardingDialog}
      />
    </div>
  );
}
