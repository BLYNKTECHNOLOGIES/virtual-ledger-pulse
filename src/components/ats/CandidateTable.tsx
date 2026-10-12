import { UnreadMailMark } from "./UnreadMailMark";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/ats/format";
import type { AtsAppRow } from "@/lib/ats/candidates";
import { AppStatusBadge, ResumeIcon, Stars, UnreviewedDot, fmtMonthly, fmtYears, isUnreviewed } from "./CandidateBits";

export function CandidateTable({
  rows, idleDays, onOpen, hideJob, selected, onToggle, onToggleAll,
}: {
  rows: AtsAppRow[]; idleDays: number; onOpen: (r: AtsAppRow) => void; hideJob?: boolean;
  selected?: Set<string>; onToggle?: (r: AtsAppRow) => void; onToggleAll?: (on: boolean) => void;
}) {
  const sel = !!selected && !!onToggle;
  const pageAll = sel && rows.length > 0 && rows.every((r) => selected!.has(r.application_id!));
  const pageSome = sel && rows.some((r) => selected!.has(r.application_id!));
  const idle = (r: AtsAppRow) => r.status === "active" && (r.days_in_stage ?? 0) >= idleDays;
  return (
    <>
      {/* cards on small screens */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.application_id}>
            <div className="flex items-start gap-2">
            {sel && <Checkbox className="mt-3.5" checked={selected!.has(r.application_id!)} onCheckedChange={() => onToggle!(r)} aria-label={`Select ${r.full_name}`} />}
            <button type="button" onClick={() => onOpen(r)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center gap-2">
                <UnreviewedDot show={isUnreviewed(r)} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.full_name}</span><UnreadMailMark candidateId={r.candidate_id} />
                <AppStatusBadge status={r.status} />
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="t-mono">{r.ref_no}</span><ResumeIcon show={r.has_resume} />
                <span className="truncate">· {hideJob ? r.stage_name : `${r.job_title ?? "General"} · ${r.stage_name ?? ""}`}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Applied {fmtDate(r.applied_at)}</span>
                <span className={cn(idle(r) && "font-medium text-warning")}>{r.days_in_stage ?? 0} d in stage</span>
                <Stars value={r.rating_avg} count={r.rating_count} />
              </div>
            </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sel && <TableHead className="w-10"><Checkbox checked={pageAll ? true : pageSome ? "indeterminate" : false} onCheckedChange={(v) => onToggleAll?.(v === true)} aria-label="Select this page" /></TableHead>}
              <TableHead>Candidate</TableHead>
              {!hideJob && <TableHead>Job</TableHead>}
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="text-right">Days in stage</TableHead>
              <TableHead className="text-right">Experience</TableHead>
              <TableHead className="text-right">Expected CTC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.application_id} tabIndex={0} className="cursor-pointer"
                onClick={() => onOpen(r)} onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
                {sel && <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Checkbox checked={selected!.has(r.application_id!)} onCheckedChange={() => onToggle!(r)} aria-label={`Select ${r.full_name}`} /></TableCell>}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <UnreviewedDot show={isUnreviewed(r)} />
                    <span className="font-medium text-foreground">{r.full_name}</span><UnreadMailMark candidateId={r.candidate_id} />
                    <ResumeIcon show={r.has_resume} />
                  </div>
                  <div className="t-mono text-xs text-muted-foreground">{r.ref_no}</div>
                </TableCell>
                {!hideJob && <TableCell className="max-w-[14rem] truncate">{r.job_title ?? <span className="text-muted-foreground">General</span>}</TableCell>}
                <TableCell className="whitespace-nowrap">{r.stage_name}</TableCell>
                <TableCell><AppStatusBadge status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.source_name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.applied_at)}</TableCell>
                <TableCell><Stars value={r.rating_avg} count={r.rating_count} /></TableCell>
                <TableCell className={cn("text-right tabular-nums", idle(r) && "font-medium text-warning")}>{r.days_in_stage ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtYears(r.total_experience_years)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMonthly(r.expected_ctc_monthly)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
