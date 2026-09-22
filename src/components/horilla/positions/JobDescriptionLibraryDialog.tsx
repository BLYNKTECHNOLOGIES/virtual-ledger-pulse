import { useMemo, useState } from "react";
import { Eye, FileText, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  JD_FULL_COMPENDIUM_PATH,
  useJobDescriptions,
  useLinkJobDescription,
  type JobDescriptionRow,
} from "@/hooks/useJobDescriptions";
import { JobDescriptionViewer } from "./JobDescriptionViewer";

interface PositionOption {
  id: string;
  title: string;
}

interface JobDescriptionLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: PositionOption[];
}

/** Full JD library: every role charter, its linked position, and a view action. */
export function JobDescriptionLibraryDialog({
  open,
  onOpenChange,
  positions,
}: JobDescriptionLibraryDialogProps) {
  const { data: jds, isLoading } = useJobDescriptions();
  const linkMutation = useLinkJobDescription();
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<JobDescriptionRow | null>(null);
  const [viewFull, setViewFull] = useState(false);

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (jds || []).filter(
      (j) =>
        !term ||
        j.role_title.toLowerCase().includes(term) ||
        j.reference.toLowerCase().includes(term) ||
        (j.section || "").toLowerCase().includes(term),
    );
    const map = new Map<string, JobDescriptionRow[]>();
    rows.forEach((r) => {
      const key = r.section || "Other";
      map.set(key, [...(map.get(key) || []), r]);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [jds, search]);

  const positionTitle = (id: string | null) =>
    positions.find((p) => p.id === id)?.title || null;

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Job Description Library"
        description={`${jds?.length ?? 0} role descriptions — view each one and link it to a position`}
        contentClassName="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex h-9 w-full items-center rounded-lg border border-border bg-card px-3 sm:max-w-xs">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles or reference..."
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button variant="outline" className="h-9" onClick={() => setViewFull(true)}>
              <FileText className="h-4 w-4" /> Full compendium
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No job descriptions match your search.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map(([section, rows]) => (
                <div key={section} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section}
                  </p>
                  {rows.map((jd) => (
                    <div
                      key={jd.id}
                      className="rounded-lg border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground break-words">
                            {jd.role_title}
                          </p>
                          <p className="text-xs text-muted-foreground break-words">
                            {jd.reference}
                            {jd.page_from
                              ? ` · pages ${jd.page_from}–${jd.page_to}`
                              : ""}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="h-8 shrink-0"
                          onClick={() => setViewing(jd)}
                        >
                          <Eye className="h-3.5 w-3.5" /> View JD
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2 border-t border-border pt-2 sm:flex-row sm:items-center">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" /> Linked position
                        </span>
                        <Select
                          value={jd.position_id ?? "none"}
                          onValueChange={(v) =>
                            linkMutation.mutate({
                              jdId: jd.id,
                              positionId: v === "none" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-foreground sm:max-w-xs">
                            <SelectValue placeholder="Not linked" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not linked</SelectItem>
                            {positions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {jd.position_id && (
                          <span className="text-xs text-emerald-600">
                            {positionTitle(jd.position_id)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </ResponsiveDialog>

      <JobDescriptionViewer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.role_title || ""}
        subtitle={viewing?.reference}
        storagePath={viewing?.storage_path || null}
      />
      <JobDescriptionViewer
        open={viewFull}
        onOpenChange={setViewFull}
        title="Job Description Compendium"
        subtitle="BVT/HR/JD/2026/COMP-01 · v4.2 · all 41 role descriptions"
        storagePath={JD_FULL_COMPENDIUM_PATH}
      />
    </>
  );
}
