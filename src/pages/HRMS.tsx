
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, Trophy, Clock, Receipt, Calendar, FileCheck } from "lucide-react";
import { RecruitmentTab } from "@/components/hrms/RecruitmentTab";
import { EmployeeLifecycleTab } from "@/components/hrms/EmployeeLifecycleTab";
import { PerformanceTab } from "@/components/hrms/PerformanceTab";
import { ShiftAttendanceTab } from "@/components/hrms/ShiftAttendanceTab";
import { ClaimExpenseTab } from "@/components/hrms/ClaimExpenseTab";
import { LeavesTab } from "@/components/hrms/LeavesTab";
import { KYCApprovalsTab } from "@/components/hrms/KYCApprovalsTab";

export default function HRMS() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Tabs defaultValue="recruitment" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="recruitment" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Recruitment
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Employee Lifecycle
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Shift & Attendance
          </TabsTrigger>
          <TabsTrigger value="expense" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Claim Expense
          </TabsTrigger>
          <TabsTrigger value="leaves" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Leaves
          </TabsTrigger>
          <TabsTrigger value="kyc-approvals" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            KYC Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recruitment">
          <RecruitmentTab />
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

        <TabsContent value="kyc-approvals">
          <KYCApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
