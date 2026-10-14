import { BookOpen, GraduationCap, Grid3x3, LayoutDashboard, Library, Plus, Settings, Users, Armchair } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLmsAccess } from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import type { LmsView } from "@/lib/lms/constants";
import { LmsDashboard } from "@/components/hrms/lms/LmsDashboard";
import { LmsPlansList } from "@/components/hrms/lms/LmsPlansList";
import { LmsPlanDetail } from "@/components/hrms/lms/LmsPlanDetail";
import { LmsPlanBuilder } from "@/components/hrms/lms/LmsPlanBuilder";
import { LmsLibrary } from "@/components/hrms/lms/LmsLibrary";
import { LmsModuleDetail } from "@/components/hrms/lms/LmsModuleDetail";
import { LmsPresent } from "@/components/hrms/lms/LmsPresent";
import { LmsSeats } from "@/components/hrms/lms/LmsSeats";
import { LmsKraCatalogue } from "@/components/hrms/lms/LmsKraCatalogue";
import { LmsMatrix } from "@/components/hrms/lms/LmsMatrix";
import { LmsSettings } from "@/components/hrms/lms/LmsSettings";

const TABS: { view: LmsView; label: string; icon: React.ElementType }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "plans", label: "Trainees", icon: Users },
  { view: "library", label: "Module Library", icon: Library },
  { view: "seats", label: "Seats", icon: Armchair },
  { view: "kras", label: "KRA Catalogue", icon: BookOpen },
  { view: "matrix", label: "Training Matrix", icon: Grid3x3 },
  { view: "settings", label: "Settings", icon: Settings },
];

/**
 * HRMS → LMS. KRA-based training: a module library (one module per KRA, plus
 * orientation and platform modules), seats, day-by-day training plans with
 * tests, practical sign-offs and supervised live days, and per-KRA certification.
 * Trainees don't log in; the trainer runs the class screen and records results.
 */
export default function LmsPage() {
  const { view, params, go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const planId = params.get("plan");
  const moduleId = params.get("module");

  if (view === "present") {
    return (
      <div className="p-4 md:p-6 space-y-4 page-mount">
        <LmsPresent />
      </div>
    );
  }

  const activeTab: LmsView = view === "new-plan" ? "plans" : view;

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" aria-hidden /> LMS</span>}
        description="Training library, KRA-based training plans, tests, practical sign-offs and certification."
        actions={canManage && view !== "new-plan" ? <Button onClick={() => go("new-plan")}><Plus className="mr-1.5 h-4 w-4" /> New training plan</Button> : undefined}
      />
      <nav aria-label="LMS sections" className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full gap-1 border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.view === activeTab;
            return (
              <button
                key={t.view}
                type="button"
                onClick={() => go(t.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden /> {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {view === "dashboard" ? <LmsDashboard /> : null}
      {view === "plans" ? (planId ? <LmsPlanDetail key={planId} planId={planId} /> : <LmsPlansList />) : null}
      {view === "new-plan" ? <LmsPlanBuilder key={`${params.get("employee") ?? ""}|${params.get("seat") ?? ""}`} /> : null}
      {view === "library" ? (moduleId ? <LmsModuleDetail key={moduleId} moduleId={moduleId} /> : <LmsLibrary />) : null}
      {view === "seats" ? <LmsSeats /> : null}
      {view === "kras" ? <LmsKraCatalogue /> : null}
      {view === "matrix" ? <LmsMatrix /> : null}
      {view === "settings" ? <LmsSettings /> : null}
    </div>
  );
}
