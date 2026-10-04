import { useMemo, useState, type ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Maximize2 } from "lucide-react";

export type DetailCell = string | number;
export type DetailSpec = {
  title: string;
  description?: string;
  stats?: { label: string; value: ReactNode; tone?: "default" | "success" | "warning" | "danger" }[];
  columns?: { label: string; numeric?: boolean; total?: boolean; format?: (value: number) => string }[];
  rows?: DetailCell[][];
  footer?: ReactNode;
};

export type HoverLine = [label: string, value: ReactNode];

export function HoverPanel({ title, lines, hint = true }: { title: string; lines: HoverLine[]; hint?: boolean }) {
  return <div className="space-y-2">
    <p className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</p>
    <div className="space-y-1.5">{lines.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-4 text-xs"><span className="text-muted-foreground">{label}</span><span className="text-right font-semibold tabular-nums text-foreground">{value}</span></div>)}</div>
    {hint && <p className="flex items-center gap-1 border-t border-border/60 pt-2 text-[10px] text-muted-foreground"><Maximize2 className="h-3 w-3" />Click for full breakdown</p>}
  </div>;
}

/** Wraps any data point: long hover shows a summary, click opens the structured dialog. */
export function Insight({ children, hover, onOpen, className = "" }: { children: ReactNode; hover?: ReactNode; onOpen?: () => void; className?: string }) {
  const interactive = !!onOpen;
  const body = <div role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} onClick={onOpen} onKeyDown={event => { if (interactive && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen?.(); } }} className={`${interactive ? "cursor-pointer rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}>{children}</div>;
  if (!hover) return body;
  return <HoverCard openDelay={550} closeDelay={80}><HoverCardTrigger asChild>{body}</HoverCardTrigger><HoverCardContent side="top" align="start" className="w-72">{hover}</HoverCardContent></HoverCard>;
}

const toneClass = { default: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-destructive" };

export function DetailDialog({ spec, onClose }: { spec: DetailSpec | null; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    let list = spec?.rows || [];
    if (query.trim()) { const q = query.toLowerCase(); list = list.filter(row => row.some(cell => String(cell).toLowerCase().includes(q))); }
    if (sort) list = [...list].sort((a, b) => { const x = a[sort.index], y = b[sort.index]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
    return list;
  }, [spec, query, sort]);
  const columns = spec?.columns || [];
  const totals = columns.map((column, index) => column.numeric && column.total !== false ? rows.reduce((sum, row) => sum + (typeof row[index] === "number" ? (row[index] as number) : 0), 0) : null);
  const fmt = (index: number, value: DetailCell) => typeof value === "number" ? (columns[index]?.format ? columns[index].format!(value) : value.toLocaleString("en-IN", { maximumFractionDigits: 1 })) : value;

  return <Dialog open={!!spec} onOpenChange={open => { if (!open) { onClose(); setQuery(""); setSort(null); } }}>
    <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col gap-4 overflow-hidden">
      <DialogHeader><DialogTitle className="[font-family:'Space_Grotesk_Variable',sans-serif]">{spec?.title}</DialogTitle>{spec?.description && <DialogDescription>{spec.description}</DialogDescription>}</DialogHeader>
      {!!spec?.stats?.length && <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">{spec.stats.map(stat => <div key={stat.label} className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{stat.label}</p><p className={`mt-1 text-base font-semibold tabular-nums ${toneClass[stat.tone || "default"]}`}>{stat.value}</p></div>)}</div>}
      {!!columns.length && <>
        {(spec?.rows?.length || 0) > 8 && <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search…" className="h-8 max-w-xs text-foreground" />}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          {rows.length ? <table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{columns.map((column, index) => <th key={column.label} onClick={() => setSort(current => current?.index === index ? { index, dir: current.dir === 1 ? -1 : 1 } : { index, dir: column.numeric ? -1 : 1 })} className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-medium text-muted-foreground ${column.numeric ? "text-right" : "text-left"}`}><span className="inline-flex items-center gap-1">{column.label}{sort?.index === index && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span></th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border/60 hover:bg-muted/40">{row.map((cell, index) => <td key={index} className={`whitespace-nowrap px-3 py-2 ${columns[index]?.numeric ? "text-right tabular-nums" : "text-foreground"}`}>{fmt(index, cell)}</td>)}</tr>)}</tbody>
            {totals.some(value => value != null) && rows.length > 1 && <tfoot className="sticky bottom-0 bg-muted"><tr className="border-t border-border font-semibold">{totals.map((value, index) => <td key={index} className={`px-3 py-2 ${columns[index]?.numeric ? "text-right tabular-nums" : ""}`}>{index === 0 ? `Total · ${rows.length}` : value != null ? fmt(index, value) : ""}</td>)}</tr></tfoot>}
          </table> : <p className="p-6 text-center text-xs text-muted-foreground">No matching records.</p>}
        </div>
      </>}
      {spec?.footer}
    </DialogContent>
  </Dialog>;
}
