import { useState } from "react";
import { OnboardingDashboard } from "@/components/hrms/onboarding-pipeline/OnboardingDashboard";
import { OnboardingWizard } from "@/components/hrms/onboarding-pipeline/OnboardingWizard";

export default function EmployeeOnboardingPipelinePage() {
  const [view, setView] = useState<"dashboard" | "wizard">("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const openWizard = (id: string | null) => {
    setSelectedId(id);
    setView("wizard");
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {view === "dashboard" ? (
        <OnboardingDashboard
          onNewOnboarding={() => openWizard(null)}
          onSelectOnboarding={(id) => openWizard(id)}
        />
      ) : (
        <OnboardingWizard
          onboardingId={selectedId}
          onBack={() => { setView("dashboard"); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
