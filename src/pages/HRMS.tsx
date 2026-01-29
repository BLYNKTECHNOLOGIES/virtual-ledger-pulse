
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

      <Tabs defaultValue="recruitment" className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-7">
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
  );
}
