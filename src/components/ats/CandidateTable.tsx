import { Mail } from "lucide-react";
import { UnreadMailMark } from "./UnreadMailMark";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/ats/format";
import { useUnreadCandidateIds } from "@/lib/ats/mail";
import type { AtsAppRow } from "@/lib/ats/candidates";
import { AppStatusBadge, ResumeIcon, Stars, UnreviewedDot, fmtMonthly, fmtYears, isUnreviewed } from "./CandidateBits";
import { CandidateAvatar, IdleDays, StageChip } from "./AtsUi";

const LG = "hidden lg:table-cell";
const XL = "hidden xl:table-cell";

export function CandidateTable({
  rows, idleDays, onOpen, hideJob, selected, onToggle, onToggleAll,
}: {
  rows: AtsAppRow[]; idleDays: number; onOpen: (r: AtsAppRow) => void; hideJob?: boolean;
  selected?: Set<string>; onToggle?: (r: AtsAppRow) => void; onToggleAll?: (on: boolean) => void;
}) {
  const unread = useUnreadCandidateIds();
  const sel = !!selected && !!onToggle;
  const pageAll = sel && rows.length > 0 && rows.every((r) => selected!.has(r.application_id!));
  const pageSome = sel && rows.some((r) => selected!.has(r.application_id!));
  const idle = (r: AtsAppRow) => r.status === "active" && (r.days_in_stage ?? 0) >= idleDays;
  const hasDot = rows.some(isUnreviewed);
  const hasMail = rows.some((r) => !!r.candidate_id && !!unread.data?.has(r.candidate_id));
  return (
    <>
      {/* cards on small screens */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.application_id}>
            <div className="flex items-start gap-2">
            {sel && <Checkbox className="mt-3.5" checked={selected!.has(r.application_id!)} onCheckedChange={() => onToggle!(r)} aria-label={`Select ${r.full_name}`} />}
            <button type="button" onClick={() => onOpen(r)}
              className={cn("min-w-0 flex-1 rounded-lg border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sel && selected!.has(r.application_id!) && "bg-primary/5")}>
              <div className="flex items-center gap-2">
                <UnreviewedDot show={isUnreviewed(r)} />
                <CandidateAvatar full_name={r.full_name ?? ""} size="sm" />
                <span className={cn("min-w-0 flex-1 truncate text-sm text-foreground", isUnreviewed(r) ? "font-semibold" : "font-medium")}>{r.full_name}</span><UnreadMailMark candidateId={r.candidate_id} />
                <AppStatusBadge status={r.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="t-mono whitespace-nowrap">{r.ref_no}</span><ResumeIcon show={r.has_resume} />
                {!hideJob && <span className="min-w-0 truncate">· {r.job_title ?? "General application"} ·</span>}
                <StageChip name={r.stage_name} kind={r.stage_kind} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">Applied {fmtDate(r.applied_at)}</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><IdleDays days={r.days_in_stage} idle={idle(r)} idleDays={idleDays} suffix=" d in stage" /></span>
                <Stars value={r.rating_avg} count={r.rating_count} />
              </div>
            </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sel && <TableHead className="w-10"><Checkbox checked={pageAll ? true : pageSome ? "indeterminate" : false} onCheckedChange={(v) => onToggleAll?.(v === true)} aria-label="Select this page" /></TableHead>}
              <TableHead>Candidate</TableHead>
              {!hideJob && <TableHead className={LG}>Job</TableHead>}
              <TableHead className="whitespace-nowrap">Stage</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className={cn(LG, "whitespace-nowrap")}>Source</TableHead>
              <TableHead className="whitespace-nowrap">Applied</TableHead>
              <TableHead className={XL}>Rating</TableHead>
              <TableHead className={cn(LG, "whitespace-nowrap text-right")}>Days in stage</TableHead>
              <TableHead className={cn(XL, "whitespace-nowrap text-right")}>Experience</TableHead>
              <TableHead className={cn(XL, "whitespace-nowrap text-right")}>Expected CTC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const on = sel && selected!.has(r.application_id!);
              return (
              <TableRow key={r.application_id} tabIndex={0} data-state={on ? "selected" : undefined}
                className={cn("cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", on && "bg-primary/5 data-[state=selected]:bg-primary/5")}
                onClick={() => onOpen(r)} onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
                {sel && <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Checkbox checked={on} onCheckedChange={() => onToggle!(r)} aria-label={`Select ${r.full_name}`} /></TableCell>}
                <TableCell className="min-w-[12rem]">
                  <div className="flex items-center gap-2">
                    <span className="flex w-2 shrink-0 justify-center"><UnreviewedDot show={isUnreviewed(r)} /></span>
                    <CandidateAvatar full_name={r.full_name ?? ""} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("truncate whitespace-nowrap text-sm text-foreground", isUnreviewed(r) ? "font-semibold" : "font-medium")}>{r.full_name}</span>
                        <UnreadMailMark candidateId={r.candidate_id} /><ResumeIcon show={r.has_resume} />
                      </div>
                      <div className="t-mono whitespace-nowrap text-xs text-muted-foreground">{r.ref_no}</div>
                    </div>
                  </div>
                </TableCell>
                {!hideJob && <TableCell className={cn(LG, "max-w-[14rem]")}>{r.job_title ?? <span className="text-muted-foreground">General application</span>}</TableCell>}
                <TableCell className="whitespace-nowrap"><StageChip name={r.stage_name} kind={r.stage_kind} /></TableCell>
                <TableCell className="whitespace-nowrap"><AppStatusBadge status={r.status} /></TableCell>
                <TableCell className={cn(LG, "whitespace-nowrap text-muted-foreground")}>{r.source_name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(r.applied_at)}</TableCell>
                <TableCell className={cn(XL, "whitespace-nowrap")}><Stars value={r.rating_avg} count={r.rating_count} /></TableCell>
                <TableCell className={cn(LG, "whitespace-nowrap text-right")}><IdleDays days={r.days_in_stage} idle={idle(r)} idleDays={idleDays} /></TableCell>
                <TableCell className={cn(XL, "whitespace-nowrap text-right tabular-nums")}>{fmtYears(r.total_experience_years)}</TableCell>
                <TableCell className={cn(XL, "whitespace-nowrap text-right tabular-nums")}>{fmtMonthly(r.expected_ctc_monthly)}</TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {(hasDot || hasMail) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {hasDot && <span className="inline-flex items-center gap-1.5"><UnreviewedDot show /> Not reviewed yet</span>}
          {hasMail && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-primary" aria-hidden /> Unread email reply</span>}
        </p>
      )}
    </>
  );
}
