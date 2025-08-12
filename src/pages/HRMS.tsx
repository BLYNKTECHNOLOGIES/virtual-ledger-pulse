
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, Trophy, Clock, Receipt, Calendar, UserCircle } from "lucide-react";
import { RecruitmentTab } from "@/components/hrms/RecruitmentTab";
import { EmployeeLifecycleTab } from "@/components/hrms/EmployeeLifecycleTab";
import { PerformanceTab } from "@/components/hrms/PerformanceTab";
import { ShiftAttendanceTab } from "@/components/hrms/ShiftAttendanceTab";
import { ClaimExpenseTab } from "@/components/hrms/ClaimExpenseTab";
import { LeavesTab } from "@/components/hrms/LeavesTab";
import { CandidatesTab } from "@/components/hrms/candidates/CandidatesTab";

export default function HRMS() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-orange-50 rounded-xl shadow-sm">
                  <Users className="h-8 w-8 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Human Resource Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive HR and employee management system
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <Tabs defaultValue="recruitment" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="recruitment" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Recruitment
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-2">
            <UserCircle className="h-4 w-4" />
            Candidates
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
    </div>
  );
}
