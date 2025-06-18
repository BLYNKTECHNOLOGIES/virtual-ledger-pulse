
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, Trophy, Clock, Receipt, Calendar } from "lucide-react";
import { RecruitmentTab } from "@/components/hrms/RecruitmentTab";
import { EmployeeLifecycleTab } from "@/components/hrms/EmployeeLifecycleTab";
import { PerformanceTab } from "@/components/hrms/PerformanceTab";
import { ShiftAttendanceTab } from "@/components/hrms/ShiftAttendanceTab";
import { ClaimExpenseTab } from "@/components/hrms/ClaimExpenseTab";
import { LeavesTab } from "@/components/hrms/LeavesTab";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export default function HRMS() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className={cn(
      "space-y-6 p-4 w-full transition-all duration-200 ease-in-out",
      isCollapsed ? "max-w-full" : "max-w-full"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className={cn(
            "font-bold text-gray-900 transition-all duration-200",
            isCollapsed ? "text-2xl" : "text-3xl"
          )}>Human Resource Management System</h1>
        </div>
      </div>

      <Tabs defaultValue="recruitment" className="space-y-6">
        <div className="overflow-x-auto">
          <TabsList className={cn(
            "grid grid-cols-6 transition-all duration-200",
            isCollapsed ? "w-full min-w-[800px]" : "w-full"
          )}>
            <TabsTrigger value="recruitment" className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Recruitment</span>
            </TabsTrigger>
            <TabsTrigger value="lifecycle" className="flex items-center gap-2 text-xs sm:text-sm">
              <UserCheck className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Employee Lifecycle</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2 text-xs sm:text-sm">
              <Trophy className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Performance</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2 text-xs sm:text-sm">
              <Clock className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Shift & Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="expense" className="flex items-center gap-2 text-xs sm:text-sm">
              <Receipt className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Claim Expense</span>
            </TabsTrigger>
            <TabsTrigger value="leaves" className="flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-4 w-4" />
              <span className={cn(isCollapsed ? "hidden sm:inline" : "inline")}>Leaves</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className={cn(
          "w-full transition-all duration-200",
          isCollapsed ? "max-w-full" : "max-w-full"
        )}>
          <TabsContent value="recruitment" className="w-full">
            <RecruitmentTab />
          </TabsContent>

          <TabsContent value="lifecycle" className="w-full">
            <EmployeeLifecycleTab />
          </TabsContent>

          <TabsContent value="performance" className="w-full">
            <PerformanceTab />
          </TabsContent>

          <TabsContent value="attendance" className="w-full">
            <ShiftAttendanceTab />
          </TabsContent>

          <TabsContent value="expense" className="w-full">
            <ClaimExpenseTab />
          </TabsContent>

          <TabsContent value="leaves" className="w-full">
            <LeavesTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
