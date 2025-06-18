
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
      "min-h-screen w-full bg-gray-50 transition-all duration-200 ease-in-out",
      "p-4 space-y-6"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className={cn(
            "font-bold text-gray-900 transition-all duration-200",
            isCollapsed ? "text-2xl lg:text-3xl" : "text-xl lg:text-3xl"
          )}>Human Resource Management System</h1>
        </div>
      </div>

      <Tabs defaultValue="recruitment" className="space-y-6 w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className={cn(
            "grid w-full transition-all duration-200",
            "grid-cols-2 sm:grid-cols-3 md:grid-cols-6",
            isCollapsed ? "min-w-[600px] md:min-w-0" : "min-w-[700px] lg:min-w-0"
          )}>
            <TabsTrigger value="recruitment" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Recruitment</span>
            </TabsTrigger>
            <TabsTrigger value="lifecycle" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <UserCheck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Employee Lifecycle</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Trophy className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Performance</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Shift & Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="expense" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Receipt className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Claim Expense</span>
            </TabsTrigger>
            <TabsTrigger value="leaves" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={cn(
                "truncate",
                isCollapsed ? "hidden sm:inline" : "inline"
              )}>Leaves</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="w-full">
          <TabsContent value="recruitment" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <RecruitmentTab />
            </div>
          </TabsContent>

          <TabsContent value="lifecycle" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <EmployeeLifecycleTab />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <PerformanceTab />
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <ShiftAttendanceTab />
            </div>
          </TabsContent>

          <TabsContent value="expense" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <ClaimExpenseTab />
            </div>
          </TabsContent>

          <TabsContent value="leaves" className="w-full mt-0">
            <div className={cn(
              "transition-all duration-200",
              isCollapsed ? "max-w-full" : "max-w-full"
            )}>
              <LeavesTab />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
