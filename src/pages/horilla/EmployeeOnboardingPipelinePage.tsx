import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OnboardingDashboard } from "@/components/hrms/onboarding-pipeline/OnboardingDashboard";
import { OnboardingWizard } from "@/components/hrms/onboarding-pipeline/OnboardingWizard";

export default function EmployeeOnboardingPipelinePage() {
  const [view, setView] = useState<"dashboard" | "wizard">("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const openWizard = (id: string | null) => {
    setSelectedId(id);
    setView("wizard");
  };

  // Deep link support: /hrms/onboarding-pipeline?id=<onboarding_id> opens that
  // candidate directly (used by the "form submitted" HR notification).
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setSelectedId(id);
      setView("wizard");
    }
  }, [searchParams]);

  const backToDashboard = () => {
    setView("dashboard");
    setSelectedId(null);
    if (searchParams.get("id")) {
      searchParams.delete("id");
      setSearchParams(searchParams, { replace: true });
    }
  };

  return (
    <div className="hrms-page space-y-4 max-w-6xl mx-auto page-mount">
      {view === "dashboard" ? (
        <OnboardingDashboard
          onNewOnboarding={() => openWizard(null)}
          onSelectOnboarding={(id) => openWizard(id)}
        />
      ) : (
        <OnboardingWizard onboardingId={selectedId} onBack={backToDashboard} />
      )}
    </div>
  );
}
