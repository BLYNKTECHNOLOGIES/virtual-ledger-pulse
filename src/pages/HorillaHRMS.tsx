
import { useState } from "react";
import { HorillaSidebar, HorillaModule } from "@/components/horilla/HorillaSidebar";
import { HorillaHeader } from "@/components/horilla/HorillaHeader";
import { HorillaDashboard } from "@/components/horilla/HorillaDashboard";
import { EmployeeDirectory } from "@/components/horilla/employee/EmployeeDirectory";
import { RecruitmentDashboard } from "@/components/horilla/recruitment/RecruitmentDashboard";
import { OnboardingDashboard } from "@/components/horilla/onboarding/OnboardingDashboard";
import { AttendanceDashboard } from "@/components/horilla/attendance/AttendanceDashboard";
import { LeaveDashboard } from "@/components/horilla/leave/LeaveDashboard";
import { PayrollDashboard } from "@/components/horilla/payroll/PayrollDashboard";

function PlaceholderModule({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <div className="w-20 h-20 bg-[#009C4A]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🚧</span>
        </div>
        <h3 className="text-xl font-bold text-gray-800">{name}</h3>
        <p className="text-sm text-gray-500 mt-1">This module will be built in the next phase</p>
      </div>
    </div>
  );
}

const moduleLabels: Record<HorillaModule, string> = {
  dashboard: "Dashboard",
  employee: "Employee",
  recruitment: "Recruitment",
  onboarding: "Onboarding",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  asset: "Asset",
  performance: "Performance",
  offboarding: "Offboarding",
  helpdesk: "Helpdesk",
};

export default function HorillaHRMS() {
  const [activeModule, setActiveModule] = useState<HorillaModule>("dashboard");

  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":
        return <HorillaDashboard onNavigate={setActiveModule} />;
      case "employee":
        return <EmployeeDirectory />;
      case "recruitment":
        return <RecruitmentDashboard />;
      case "onboarding":
        return <OnboardingDashboard />;
      case "attendance":
        return <AttendanceDashboard />;
      case "leave":
        return <LeaveDashboard />;
      case "payroll":
        return <PayrollDashboard />;
      default:
        return <PlaceholderModule name={moduleLabels[activeModule]} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <HorillaSidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <HorillaHeader activeModule={activeModule} />
        <main className="flex-1 overflow-y-auto p-6">
          {renderModule()}
        </main>
      </div>
    </div>
  );
}
