
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, Trophy, Clock, Receipt, Calendar, UserCircle, Shield } from "lucide-react";
import { RecruitmentTab } from "@/components/hrms/RecruitmentTab";
import { EmployeeLifecycleTab } from "@/components/hrms/EmployeeLifecycleTab";
import { PerformanceTab } from "@/components/hrms/PerformanceTab";
import { ShiftAttendanceTab } from "@/components/hrms/ShiftAttendanceTab";
import { ClaimExpenseTab } from "@/components/hrms/ClaimExpenseTab";
import { LeavesTab } from "@/components/hrms/LeavesTab";
import { CandidatesTab } from "@/components/hrms/candidates/CandidatesTab";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function HRMS() {
  const navigate = useNavigate();
  
  return (
    <PermissionGate
      permissions={["hrms_view"]}
      fallback={
        <div className="min-h-screen bg-background p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access HRMS.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-4 md:mb-6 shadow-sm border border-gray-100">
        <div className="px-4 py-5 md:px-6 md:py-8">
          <div className="flex items-center gap-3">
            <div className="p-2 md:p-3 bg-orange-50 rounded-xl shadow-sm shrink-0">
              <Users className="h-6 w-6 md:h-8 md:w-8 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">
                Human Resource Management
              </h1>
              <p className="text-slate-600 text-sm md:text-lg truncate">
                Comprehensive HR & employee management
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="recruitment" className="space-y-4 md:space-y-6">
        <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-7 whitespace-nowrap">
          <TabsTrigger value="recruitment" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Recruitment</span>
            <span className="sm:hidden">Recruit</span>
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <UserCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Candidates</span>
            <span className="sm:hidden">Cands.</span>
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Employee Lifecycle</span>
            <span className="sm:hidden">Lifecycle</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
            <span className="sm:hidden">Perf.</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Shift & Attendance</span>
            <span className="sm:hidden">Attend.</span>
          </TabsTrigger>
          <TabsTrigger value="expense" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Claim Expense</span>
            <span className="sm:hidden">Expense</span>
          </TabsTrigger>
          <TabsTrigger value="leaves" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Calendar className="h-4 w-4" />
            Leaves
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recruitment">
          <RecruitmentTab />
        </TabsContent>

        <TabsContent value="candidates">
          <CandidatesTab />
        </TabsContent>

        <TabsContent value="lifecycle">
          <EmployeeLifecycleTab />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceTab />
        </TabsContent>

        <TabsContent value="attendance">
          <ShiftAttendanceTab />
        </TabsContent>

        <TabsContent value="expense">
          <ClaimExpenseTab />
        </TabsContent>

        <TabsContent value="leaves">
          <LeavesTab />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  );
}
