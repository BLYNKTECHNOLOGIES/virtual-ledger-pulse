import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { buildComplianceLink } from "./complianceDeepLink";
import { exportRowsToCsv } from "@/lib/complianceCsv";
import {
  Activity, ChevronDown, ChevronRight, Download, FilePlus2, FileText, Gavel,
  Landmark, MessageSquare, PencilLine, Search, Trash2,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import { InlineAttachmentStrip } from "./InlineAttachmentStrip";


type ActivityEvent = {
  at: string;
  source: string;
  action: "INSERT" | "UPDATE" | "DELETE" | string;
  record_id: string | null;
  title: string;
  subtitle: string | null;
  fields: string[];
  actor: string;
  attachments?: string[] | null;
};


type FeedPayload = { days: number; total: number; events: ActivityEvent[] };

const WINDOWS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

const SOURCE_META: Record<string, { label: string; icon: typeof Activity }> = {
  bank_cases: { label: "Bank cases", icon: Landmark },
  account_investigations: { label: "Investigations", icon: Search },
  compliance_documents: { label: "Documents", icon: FileText },
  bank_communications: { label: "Bank comms", icon: MessageSquare },
  compliance_case_updates: { label: "Case updates", icon: Gavel },
};

const actionMeta = (action: string) =>
  action === "INSERT"
    ? { label: "Created", icon: FilePlus2, cls: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400" }
    : action === "DELETE"
      ? { label: "Deleted", icon: Trash2, cls: "text-destructive bg-destructive/10" }
      : { label: "Updated", icon: PencilLine, cls: "text-primary bg-primary/10" };

const prettyField = (f: string) => f.replace(/_/g, " ").replace(/\bid\b/gi, "ID");

const dayHeading = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, dd MMM yyyy");
};

export function ComplianceActivityFeed() {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);
  const [source, setSource] = useState<string | "all">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance_recent_activity", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compliance_recent_activity", {
        p_days: days,
        p_limit: 300,
      });
      if (error) throw error;
      return data as unknown as FeedPayload;
    },
    staleTime: 60_000,
  });

  const events = useMemo(
    () => (data?.events ?? []).filter((e) => source === "all" || e.source === source),
    [data, source],
  );

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>();
    (data?.events ?? []).forEach((e) => map.set(e.source, (map.get(e.source) ?? 0) + 1));
    return map;
  }, [data]);

  const grouped = useMemo(() => {
    const groups: { key: string; heading: string; items: ActivityEvent[] }[] = [];
    events.forEach((e) => {
      const key = e.at.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, heading: dayHeading(e.at), items: [e] });
    });
    return groups;
  }, [events]);

  return (
    <Card>
      <CardHeader className="pb-3 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent activity
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Every compliance change made in the selected window, newest first
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.days}
                  onClick={() => setDays(w.days)}
                  className={`px-2.5 py-1 text-xs rounded-[5px] transition-colors ${
                    days === w.days
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={events.length === 0}
              onClick={() =>
                exportRowsToCsv(
                  "compliance-activity",
                  events.map((e) => ({
                    when: format(parseISO(e.at), "dd MMM yyyy HH:mm"),
                    area: SOURCE_META[e.source]?.label ?? e.source,
                    action: actionMeta(e.action).label,
                    record: e.title,
                    details: e.subtitle ?? "",
                    changed: e.fields.map(prettyField).join(", "),
                    docs: (e.attachments ?? []).length,
                    by: e.actor,
                  })),
                  [
                    { key: "when", label: "When" },
                    { key: "area", label: "Area" },
                    { key: "action", label: "Action" },
                    { key: "record", label: "Record" },
                    { key: "details", label: "Details" },
                    { key: "changed", label: "Fields changed" },
                    { key: "docs", label: "Documents" },
                    { key: "by", label: "By" },
                  ],
                )

              }
            >
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {sourceCounts.size > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setSource("all")}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                source === "all" ? "bg-primary/10 border-primary/40 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({data?.events.length ?? 0})
            </button>
            {Array.from(sourceCounts.entries()).map(([key, count]) => (
              <button
                key={key}
                onClick={() => setSource(key)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  source === key ? "bg-primary/10 border-primary/40 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {SOURCE_META[key]?.label ?? key} ({count})
              </button>
            ))}
          </div>
        )}
      </CardHeader>


      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
          </div>
        )}

        {error && (
          <p className="text-sm text-muted-foreground">
            Unable to load activity. {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No compliance updates recorded in this window.
          </p>
        )}

        {grouped.map((group) => (
          <Collapsible key={group.key} defaultOpen>
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-md px-1 py-1.5 hover:bg-muted/50">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                {group.heading}
              </span>
              <Badge variant="secondary" className="shrink-0">{group.items.length} update{group.items.length === 1 ? "" : "s"}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1 space-y-1 border-l border-border/70 ml-3 pl-3">
                {group.items.map((e, i) => {
                  const meta = actionMeta(e.action);
                  const SrcIcon = SOURCE_META[e.source]?.icon ?? Activity;
                  const ActionIcon = meta.icon;
                  const link = buildComplianceLink(e.source, e.record_id);
                  const clickable = Boolean(link) && e.action !== "DELETE";
                  // "OPEN · MEDIUM" style facts become pills; free-form notes stay as text.
                  const rawParts = (e.subtitle ?? "").split("·").map((p) => p.trim()).filter(Boolean);
                  const isFact = (p: string) => p.length <= 28 && !/\s{2,}/.test(p) && p.split(" ").length <= 3;
                  const subtitleParts = rawParts.every(isFact) ? rawParts : [];
                  const freeText = subtitleParts.length === 0 ? (e.subtitle ?? "") : "";

                  return (
                    <li
                      key={`${e.record_id}-${e.at}-${i}`}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={() => clickable && link && navigate(link)}
                      onKeyDown={(ev) => {
                        if (clickable && link && (ev.key === "Enter" || ev.key === " ")) {
                          ev.preventDefault();
                          navigate(link);
                        }
                      }}
                      className={`group/row grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-lg border border-transparent px-2 py-2.5 hover:border-border hover:bg-muted/40 ${
                        clickable ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
                      }`}
                    >
                      <span className={`mt-0.5 h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${meta.cls}`}>
                        <ActionIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>

                      <div className="min-w-0">
                        {/* Line 1 — what area + what happened */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] gap-1 font-normal shrink-0">
                            <SrcIcon className="h-3 w-3" /> {SOURCE_META[e.source]?.label ?? e.source}
                          </Badge>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.cls}`}>{meta.label}</span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {format(parseISO(e.at), "HH:mm")}
                          </span>
                        </div>

                        {/* Line 2 — the record */}
                        <p className="text-sm text-foreground font-medium mt-1 break-words">{e.title}</p>

                        {/* Line 3 — status facts as discrete pills */}
                        {subtitleParts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {subtitleParts.map((part, pi) => (
                              <span
                                key={pi}
                                className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                              >
                                {part}
                              </span>
                            ))}
                          </div>
                        )}
                        {freeText && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{freeText}</p>
                        )}

                        {e.action === "UPDATE" && e.fields.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Changed: <span className="text-foreground/80">{e.fields.slice(0, 6).map(prettyField).join(", ")}</span>
                            {e.fields.length > 6 ? ` +${e.fields.length - 6} more` : ""}
                          </p>
                        )}

                        {/* Inline document review — glance without opening the case */}
                        <InlineAttachmentStrip urls={e.attachments} />

                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          {e.actor} · {formatDistanceToNow(parseISO(e.at), { addSuffix: true })}
                        </p>
                      </div>

                      {clickable && (
                        <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground group-hover/row:text-foreground" />
                      )}
                    </li>

                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
