import { useMailStatus } from "@/lib/ats/mail";
import { useInterviewCounts } from "@/lib/ats/interviews";
import { useCallback, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FileUp, Plus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtsContext } from "@/components/ats/AtsContext";
import { JobEditor } from "@/components/ats/JobEditor";
import { AddCandidateDialog } from "@/components/ats/AddCandidateDialog";
import type { AtsJob } from "@/lib/ats/api";
import AtsOverviewPage from "./AtsOverviewPage";
import AtsJobsPage from "./AtsJobsPage";
import AtsJobDetailPage from "./AtsJobDetailPage";
import AtsSettingsPage from "./AtsSettingsPage";
import AtsCandidatesPage from "./AtsCandidatesPage";
import AtsCandidatePage from "./AtsCandidatePage";
import AtsInboxPage from "./AtsInboxPage";
import AtsInterviewsPage from "./AtsInterviewsPage";
import AtsImportPage from "./AtsImportPage";
import AtsReportsPage from "./AtsReportsPage";

const TABS = [
  { label: "Overview", icon: LayoutDashboard, description: "What needs your attention today, and how hiring is going.", to: "/hrms/ats", match: (p: string) => p === "/hrms/ats" || p === "/hrms/ats/" },
  { label: "Candidates", icon: Users, description: "Everyone who has applied, sorted by job.", to: "/hrms/ats/candidates", match: (p: string) => p.startsWith("/hrms/ats/candidates") || p.startsWith("/hrms/ats/import") },
  { label: "Inbox", icon: Inbox, description: "Candidate emails and replies in one place.", to: "/hrms/ats/inbox", match: (p: string) => p.startsWith("/hrms/ats/inbox") },
  { label: "Interviews", icon: CalendarClock, description: "Every interview, grouped by day. All times are IST.", to: "/hrms/ats/interviews", match: (p: string) => p.startsWith("/hrms/ats/interviews") },
  { label: "Jobs", icon: Briefcase, description: "Your openings, their status and their pipelines.", to: "/hrms/ats/jobs", match: (p: string) => p.startsWith("/hrms/ats/jobs") },
  { label: "Reports", icon: BarChart3, description: "Hiring numbers for any period, with an Excel download.", to: "/hrms/ats/reports", match: (p: string) => p.startsWith("/hrms/ats/reports") },
  { label: "Settings", icon: Settings2, description: "Stages, sources, rejection reasons, careers page, email and interviews.", to: "/hrms/ats/settings", match: (p: string) => p.startsWith("/hrms/ats/settings") },
];

export default function AtsWorkspace() {
  const { pathname } = useLocation();
  const mailSt = useMailStatus();
  const ivCounts = useInterviewCounts();
  const [editor, setEditor] = useState<{ open: boolean; job: AtsJob | null }>({ open: false, job: null });
  const [adder, setAdder] = useState<{ open: boolean; jobId: string | null }>({ open: false, jobId: null });
  const openJobEditor = useCallback((job?: AtsJob | null) => setEditor({ open: true, job: job ?? null }), []);
  const openAddCandidate = useCallback((jobId?: string | null) => setAdder({ open: true, jobId: jobId ?? null }), []);
  const ctx = useMemo(() => ({ openJobEditor, openAddCandidate }), [openJobEditor, openAddCandidate]);
  const isOverview = TABS[0].match(pathname);
  const isJobsList = pathname === "/hrms/ats/jobs" || pathname === "/hrms/ats/jobs/";
  const isCandList = pathname === "/hrms/ats/candidates" || pathname === "/hrms/ats/candidates/";
  const showNewJob = isOverview || isJobsList;
  const showAddCand = isOverview || isCandList;

  return (
    <AtsContext.Provider value={ctx}>
      <div className="page-mount space-y-5">
        <PageHeader
          title="ATS"
          description={(TABS.find((t) => t.match(pathname)) ?? TABS[0]).description}
          actions={showNewJob || showAddCand ? (
            <div className="flex flex-wrap gap-2">
              {showAddCand && <Button variant={showNewJob ? "outline" : "default"} onClick={() => openAddCandidate(null)} className="gap-1.5"><UserPlus className="h-4 w-4" /> Add candidate</Button>}
              {showAddCand && <Button variant="outline" asChild className="gap-1.5"><Link to="/hrms/ats/import"><FileUp className="h-4 w-4" /> Import</Link></Button>}
              {showNewJob && <Button onClick={() => openJobEditor(null)} className="gap-1.5"><Plus className="h-4 w-4" /> New job</Button>}
            </div>
          ) : undefined}
        />
        <nav aria-label="ATS sections" className="max-w-full overflow-x-auto">
          <div className="inline-flex h-11 items-center gap-0.5 rounded-xl border border-border bg-muted/60 p-1">
            {TABS.map((t) => {
              const active = t.match(pathname);
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end
                  className={cn(
                    "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                    active ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {t.label}
                  {t.label === "Inbox" && !mailSt.isLoading && !mailSt.isError && mailSt.data?.enabled && Number(mailSt.data.unread) > 0 && <span aria-label={`${mailSt.data.unread} unread`} className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums">{mailSt.data.unread}</span>}
                  {t.label === "Interviews" && !ivCounts.isLoading && !ivCounts.isError && (ivCounts.data?.today ?? 0) > 0 && <span aria-label={`${ivCounts.data?.today} today`} title={`${ivCounts.data?.today} today · ${ivCounts.data?.action} need an update`} className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums">{ivCounts.data?.today}</span>}
                </NavLink>
              );
            })}
          </div>
        </nav>
        <Routes>
          <Route index element={<AtsOverviewPage />} />
          <Route path="candidates" element={<AtsCandidatesPage />} />
          <Route path="candidates/:candidateId" element={<AtsCandidatePage />} />
          <Route path="inbox" element={<AtsInboxPage />} />
          <Route path="interviews" element={<AtsInterviewsPage />} />
          <Route path="jobs" element={<AtsJobsPage />} />
          <Route path="jobs/:jobId" element={<AtsJobDetailPage />} />
          <Route path="settings" element={<AtsSettingsPage />} />
          <Route path="import" element={<AtsImportPage />} />
          <Route path="reports" element={<AtsReportsPage />} />
          <Route path="*" element={<Navigate to="/hrms/ats" replace />} />
        </Routes>
      </div>
      <JobEditor open={editor.open} job={editor.job} onClose={() => setEditor((s) => ({ ...s, open: false }))} />
      <AddCandidateDialog open={adder.open} jobId={adder.jobId} onOpenChange={(o) => setAdder((s) => ({ ...s, open: o }))} />
    </AtsContext.Provider>
  );
}
