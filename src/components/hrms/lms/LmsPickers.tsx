import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { cn } from "@/lib/utils";
import { LMS_DEPARTMENTS, MODULE_TYPE_LABEL } from "@/lib/lms/constants";
import type { LmsEmployee, LmsKra, LmsModule } from "@/lib/lms/types";

const STATUS_LABEL: Record<LmsKra["catalogue_status"], string> = {
  live: "Live", partial: "Partly live", notlive: "Not live yet", planned: "Planned", future: "Future",
};
export const kraStatusLabel = (s: LmsKra["catalogue_status"]) => STATUS_LABEL[s] ?? s;

export function employeeLabel(e: Pick<LmsEmployee, "full_name" | "badge_id"> | null | undefined): string {
  if (!e) return "—";
  return e.badge_id ? `${e.full_name} (${e.badge_id})` : e.full_name;
}

/** Searchable employee picker over the LMS employee directory (names and posts only). */
export function EmployeeSelect({
  employees, value, onChange, placeholder = "Select a person", allowClear, activeOnly = true, disabled, id,
}: {
  employees: LmsEmployee[] | undefined;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  activeOnly?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () => (employees ?? []).filter((e) => !activeOnly || e.is_active || e.id === value),
    [employees, activeOnly, value],
  );
  const selected = (employees ?? []).find((e) => e.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? employeeLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search name, badge or post" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {allowClear && value ? (
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>
                  <X className="mr-2 h-4 w-4" aria-hidden /> Clear
                </CommandItem>
              ) : null}
              {list.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.full_name} ${e.badge_id ?? ""} ${e.position_title ?? ""} ${e.department_name ?? ""} ${e.id}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === e.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {e.full_name}
                      {e.badge_id ? <span className="t-mono ml-1.5 text-xs text-muted-foreground">{e.badge_id}</span> : null}
                      {!e.is_active ? <span className="ml-1.5 text-xs text-muted-foreground">(inactive)</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{[e.position_title, e.department_name].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable module picker over the module library. */
export function ModuleSelect({
  modules, value, onChange, placeholder = "Select a module", disabled,
}: {
  modules: LmsModule[] | undefined;
  value: string | null;
  onChange: (m: LmsModule | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => (modules ?? []).filter((m) => m.is_active && m.status !== "retired"), [modules]);
  const selected = (modules ?? []).find((m) => m.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.code} · ${selected.title}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search code or title" />
          <CommandList>
            <CommandEmpty>No module found.</CommandEmpty>
            <CommandGroup>
              {list.map((m) => (
                <CommandItem key={m.id} value={`${m.code} ${m.title} ${m.id}`} onSelect={() => { onChange(m); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm"><span className="t-mono text-xs text-muted-foreground">{m.code}</span> {m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{MODULE_TYPE_LABEL[m.module_type]} · {m.duration_minutes} min</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Pick KRAs from the catalogue, grouped by sub-department and layer. */
export function KraPickerDialog({
  open, onOpenChange, kras, selected, onDone, title = "Choose KRAs", certifiedCodes, lockedCodes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kras: LmsKra[] | undefined;
  selected: string[];
  onDone: (codes: string[]) => void;
  title?: string;
  /** KRAs the person already holds, marked in the list. */
  certifiedCodes?: Set<string>;
  /** KRAs that stay ticked (already on the plan); the picker then only adds. */
  lockedCodes?: Set<string>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [onlyLive, setOnlyLive] = useState(false);
  const [onlyPicked, setOnlyPicked] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(new Set(selected));
      setOnlyPicked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (kras ?? []).filter((k) => {
      if (!k.is_active && !picked.has(k.code)) return false;
      if (onlyPicked && !picked.has(k.code)) return false;
      if (dept !== "all" && k.department_code !== dept) return false;
      if (platform === "none" && k.platform) return false;
      if (platform !== "all" && platform !== "none" && k.platform !== platform) return false;
      if (onlyLive && !(k.catalogue_status === "live" || k.catalogue_status === "partial")) return false;
      if (!needle) return true;
      return `${k.code} ${k.name} ${k.layer_name} ${k.subdepartment_name}`.toLowerCase().includes(needle);
    });
  }, [kras, q, dept, platform, onlyLive, onlyPicked, picked]);

  const groups = useMemo(() => {
    const out: { key: string; sub: string; layer: string; items: LmsKra[] }[] = [];
    const idx = new Map<string, number>();
    for (const k of filtered) {
      const key = k.layer_code;
      if (!idx.has(key)) {
        idx.set(key, out.length);
        out.push({ key, sub: `${k.subdepartment_code} · ${k.subdepartment_name}`, layer: `${k.layer_code} · ${k.layer_name}`, items: [] });
      }
      out[idx.get(key)!].items.push(k);
    }
    return out;
  }, [filtered]);

  const toggle = (code: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else if (!lockedCodes?.has(code)) next.delete(code);
      return next;
    });
  const setMany = (codes: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      codes.forEach((c) => (on ? next.add(c) : !lockedCodes?.has(c) && next.delete(c)));
      return next;
    });
  const addedCount = lockedCodes ? Array.from(picked).filter((c) => !lockedCodes.has(c)).length : picked.size;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={lockedCodes ? "KRAs already on the plan stay ticked; remove one from the plan's KRA table instead." : "Search or filter, then tick the KRAs. A whole layer can be ticked at once."}
      contentClassName="max-w-3xl"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{lockedCodes ? `${addedCount} new` : `${picked.size} selected`}</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {lockedCodes ? (
              <Button disabled={addedCount === 0} onClick={() => { onDone(Array.from(picked)); onOpenChange(false); }}>Add {addedCount} KRA{addedCount === 1 ? "" : "s"}</Button>
            ) : (
              <Button onClick={() => { onDone(Array.from(picked)); onOpenChange(false); }}>Use {picked.size} KRA{picked.size === 1 ? "" : "s"}</Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, name or layer" className="pl-8" aria-label="Search KRAs" />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger aria-label="Department"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {LMS_DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger aria-label="Platform"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any platform</SelectItem>
              <SelectItem value="Binance">Binance</SelectItem>
              <SelectItem value="KuCoin">KuCoin</SelectItem>
              <SelectItem value="Bitget">Bitget</SelectItem>
              <SelectItem value="none">No platform</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={onlyLive} onCheckedChange={(v) => setOnlyLive(v === true)} /> Live and partly live only
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={onlyPicked} onCheckedChange={(v) => setOnlyPicked(v === true)} /> Show selected only
          </label>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMany(filtered.map((k) => k.code), true)} disabled={!filtered.length}>Tick all shown</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMany(filtered.map((k) => k.code), false)} disabled={!filtered.length}>Untick all shown</Button>
          </div>
        </div>
        {!kras?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">The KRA catalogue isn't imported yet. Import it in LMS Settings.</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No KRA matches these filters.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const codes = g.items.map((k) => k.code);
              const allOn = codes.every((c) => picked.has(c));
              return (
                <div key={g.key} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">{g.sub}</p>
                      <p className="truncate text-sm font-medium">{g.layer}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMany(codes, !allOn)}>
                      {allOn ? "Untick layer" : "Tick layer"}
                    </Button>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.items.map((k) => (
                      <li key={k.code}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/30">
                          <Checkbox className="mt-0.5" checked={picked.has(k.code)} disabled={lockedCodes?.has(k.code)} onCheckedChange={(v) => toggle(k.code, v === true)} aria-label={k.code} />
                          <span className="min-w-0 flex-1">
                            <span className="t-mono mr-2 text-xs text-muted-foreground">{k.code}</span>
                            <span className="text-sm">{k.name}</span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {k.platform ? <Badge variant="outline" className="text-[10px]">{k.platform}</Badge> : null}
                              {k.catalogue_status !== "live" ? <Badge variant="muted" className="text-[10px]">{kraStatusLabel(k.catalogue_status)}</Badge> : null}
                              {certifiedCodes?.has(k.code) ? <Badge variant="success" className="text-[10px]">Already certified</Badge> : null}
                              {lockedCodes?.has(k.code) ? <Badge variant="info" className="text-[10px]">On the plan</Badge> : null}
                              {!k.is_active ? <Badge variant="destructive-soft" className="text-[10px]">Removed from catalogue</Badge> : null}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
