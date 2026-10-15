import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowLeft, ArrowUp, ExternalLink, FileUp, Link2, Loader2, MonitorPlay, Pencil, Plus, Save, Send, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  useLmsAccess, useLmsCertifications, useLmsInvalidate, useLmsKras, useLmsModule, useLmsPlanItemsIndex, useLmsPlans,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import {
  addAssetFile, addAssetLink, addChecklistItem, deleteAsset, deleteChecklistItem, publishModuleVersion, updateAsset, updateChecklistItem,
  updateModule,
} from "@/lib/lms/actions";
import {
  ASSET_KIND_LABEL, LANGUAGE_LABEL, MODULE_STATUS_LABEL, MODULE_TYPE_LABEL, PRODUCTION_STEPS, departmentName,
} from "@/lib/lms/constants";
import { isChunkedPath, lmsFileUrl } from "@/lib/lms/db";
import { bumpVersion, fmtDate, formatBytes, isHttpUrl, isSafeMediaUrl, minutesLabel } from "@/lib/lms/format";
import type { LmsAsset, LmsAssetKind, LmsAssetLanguage, LmsKra, LmsModule, LmsModuleStatus } from "@/lib/lms/types";
import { ConfirmAction, ErrorBlock, Fact, LoadingBlock, ModuleStatusBadge, ReadOnlyNote, errorText } from "./LmsShared";
import { LmsMarkdown } from "./LmsMarkdown";
import { kraStatusLabel } from "./LmsPickers";

export async function openAsset(a: Pick<LmsAsset, "storage_path" | "external_url">) {
  // Open the tab first so pop-up blockers allow it, then point it at the signed link.
  const w = window.open("", "_blank");
  try {
    if (a.storage_path && isChunkedPath(a.storage_path) && w) {
      w.document.write("<p style='font-family: sans-serif; padding: 16px;'>Preparing the file…</p>");
    }
    const url = a.storage_path ? (await lmsFileUrl(a.storage_path)).url : a.external_url;
    if (!url) throw new Error("This file has no link");
    if (!isSafeMediaUrl(url)) throw new Error("This link isn't a web address (http or https), so it can't be opened.");
    if (w) {
      w.opener = null;
      w.location.href = url;
    } else {
      window.open(url, "_blank", "noopener");
    }
  } catch (e) {
    w?.close();
    toast.error(errorText(e));
  }
}

export function LmsModuleDetail({ moduleId }: { moduleId: string }) {
  const { go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const q = useLmsModule(moduleId);
  const krasQ = useLmsKras();
  const certsQ = useLmsCertifications();
  const plansQ = useLmsPlans();
  const itemsQ = useLmsPlanItemsIndex();
  const refresh = () => invalidate();

  const m = q.data?.module ?? null;
  const kraMap = useMemo(() => new Map((krasQ.data ?? []).map((k) => [k.code, k])), [krasQ.data]);

  /** KRAs whose certificates a new version of this module should flag for a refresher. */
  const refresherCodes = useMemo(() => {
    if (!m) return [] as string[];
    if (m.module_type === "platform" && m.platform) return (krasQ.data ?? []).filter((k) => k.platform === m.platform).map((k) => k.code);
    return q.data?.kraCodes ?? [];
  }, [m, krasQ.data, q.data?.kraCodes]);
  const affectedCerts = useMemo(() => {
    const set = new Set(refresherCodes);
    return (certsQ.data ?? []).filter((c) => c.status === "certified" && set.has(c.kra_code)).length;
  }, [refresherCodes, certsQ.data]);
  const usedIn = useMemo(() => {
    const open = new Set((plansQ.data ?? []).filter((p) => p.status === "active" || p.status === "draft").map((p) => p.id));
    return new Set((itemsQ.data ?? []).filter((i) => i.module_id === moduleId && open.has(i.plan_id)).map((i) => i.plan_id)).size;
  }, [plansQ.data, itemsQ.data, moduleId]);

  if (q.error && !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !m) return <LoadingBlock rows={8} />;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => go("library")}><ArrowLeft className="mr-1.5 h-4 w-4" /> Module library</Button>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="t-mono text-xs text-muted-foreground">{m.code}</p>
              <h2 className="t-section">{m.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ModuleStatusBadge status={m.status} />
                <Badge variant="outline">{MODULE_TYPE_LABEL[m.module_type]}</Badge>
                {m.platform ? <Badge variant="outline">{m.platform}</Badge> : null}
                {!m.is_active ? <Badge variant="destructive-soft">Removed from catalogue</Badge> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => go("present", { module: m.id, lang: "en" })}><MonitorPlay className="mr-1.5 h-3.5 w-3.5" /> Present (English)</Button>
              <Button size="sm" variant="outline" onClick={() => go("present", { module: m.id, lang: "hinglish" })}><MonitorPlay className="mr-1.5 h-3.5 w-3.5" /> Present (Hinglish)</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Fact label="Department">{m.department_code ? departmentName(m.department_code) : "Company-wide"}</Fact>
            <Fact label="Sub-department">{m.subdepartment_code ?? "—"}</Fact>
            <Fact label="Teaching time">{minutesLabel(m.duration_minutes)}</Fact>
            <Fact label="Version">v{m.version}{m.version_published_at ? ` · ${fmtDate(m.version_published_at)}` : ""}</Fact>
            <Fact label="Owner">{m.owner_name ?? "—"}</Fact>
            <Fact label="In open plans">{usedIn}</Fact>
          </div>
        </CardContent>
      </Card>

      {!canManage ? <ReadOnlyNote /> : null}

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Master text</TabsTrigger>
            <TabsTrigger value="files">Files ({q.data?.assets.length ?? 0})</TabsTrigger>
            <TabsTrigger value="checklist">Practical checklist ({q.data?.checklist.length ?? 0})</TabsTrigger>
            <TabsTrigger value="version">Version</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview"><OverviewTab m={m} kraCodes={q.data?.kraCodes ?? []} kraMap={kraMap} canManage={canManage} onSaved={refresh} /></TabsContent>
        <TabsContent value="content"><ContentTab m={m} canManage={canManage} onSaved={refresh} /></TabsContent>
        <TabsContent value="files"><FilesTab m={m} assets={q.data?.assets ?? []} canManage={canManage} onSaved={refresh} /></TabsContent>
        <TabsContent value="checklist"><ChecklistTab m={m} items={q.data?.checklist ?? []} canManage={canManage} onSaved={refresh} /></TabsContent>
        <TabsContent value="version"><VersionTab m={m} canManage={canManage} affected={affectedCerts} refresherCodes={refresherCodes} onSaved={refresh} /></TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ m, kraCodes, kraMap, canManage, onSaved }: {
  m: LmsModule; kraCodes: string[]; kraMap: Map<string, LmsKra>; canManage: boolean; onSaved: () => void;
}) {
  const [summary, setSummary] = useState(m.summary ?? "");
  const [minutes, setMinutes] = useState(m.duration_minutes);
  const [owner, setOwner] = useState(m.owner_name ?? "");
  const [quizTag, setQuizTag] = useState(m.quiz_tag ?? "");
  const [status, setStatus] = useState<LmsModuleStatus>(m.status);
  const [production, setProduction] = useState<Record<string, boolean>>(m.production ?? {});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSummary(m.summary ?? "");
    setMinutes(m.duration_minutes);
    setOwner(m.owner_name ?? "");
    setQuizTag(m.quiz_tag ?? "");
    setStatus(m.status);
    setProduction(m.production ?? {});
  }, [m]);
  const save = async () => {
    setSaving(true);
    try {
      await updateModule(m.id, {
        summary: summary.trim() || null,
        duration_minutes: Math.min(600, Math.max(5, Math.round(minutes || 45))),
        owner_name: owner.trim() || null,
        quiz_tag: quizTag.trim() || null,
        status,
        production,
      });
      toast.success("Module saved");
      onSaved();
    } catch (e) {
      toast.error(`Couldn't save: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="t-card-title">About this module</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lms-msum">Summary</Label>
            <Textarea id="lms-msum" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!canManage} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lms-mmin">Teaching time (minutes)</Label>
              <Input id="lms-mmin" type="number" min={5} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as LmsModuleStatus)} disabled={!canManage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODULE_STATUS_LABEL) as LmsModuleStatus[]).map((s) => <SelectItem key={s} value={s}>{MODULE_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lms-mowner">Owner (prepares the module)</Label>
              <Input id="lms-mowner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lms-mquiz">Quiz tag</Label>
              <Input id="lms-mquiz" value={quizTag} onChange={(e) => setQuizTag(e.target.value)} disabled={!canManage} />
              <p className="text-xs text-muted-foreground">Tag the module's questions with this in the Quiz question bank.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Production steps</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRODUCTION_STEPS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(production[s.key])} disabled={!canManage} onCheckedChange={(v) => setProduction((p) => ({ ...p, [s.key]: v === true }))} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          {canManage ? (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="t-card-title">KRAs this module teaches ({kraCodes.length})</CardTitle></CardHeader>
        <CardContent>
          {kraCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.module_type === "company" ? "Everyone takes this module once, before any other." :
                m.module_type === "department" || m.module_type === "subdepartment" ? "An orientation module: it is added to a plan for any KRA in this area." :
                  m.module_type === "platform" ? `Added to a plan for any ${m.platform} KRA.` : "No KRA is linked to this module."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {kraCodes.map((c) => {
                const k = kraMap.get(c);
                return (
                  <li key={c} className="text-sm">
                    <span className="t-mono mr-1.5 text-xs text-muted-foreground">{c}</span>
                    {k?.name ?? "Not in the catalogue"}
                    {k && k.catalogue_status !== "live" ? <Badge variant="muted" className="ml-1.5 text-[10px]">{kraStatusLabel(k.catalogue_status)}</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">The title and KRA links come from the KRA catalogue import, so they change only through a new catalogue.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ContentTab({ m, canManage, onSaved }: { m: LmsModule; canManage: boolean; onSaved: () => void }) {
  const [text, setText] = useState(m.content_md ?? "");
  const [notes, setNotes] = useState(m.trainer_notes ?? "");
  const [mode, setMode] = useState<"edit" | "preview">(canManage ? "edit" : "preview");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setText(m.content_md ?? "");
    setNotes(m.trainer_notes ?? "");
  }, [m.content_md, m.trainer_notes]);
  const dirty = text !== (m.content_md ?? "") || notes !== (m.trainer_notes ?? "");
  const save = async () => {
    setSaving(true);
    try {
      await updateModule(m.id, { content_md: text.trim() ? text : null, trainer_notes: notes.trim() ? notes : null });
      toast.success("Text saved");
      onSaved();
    } catch (e) {
      toast.error(`Couldn't save: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="t-card-title">Master text</CardTitle>
          {canManage ? (
            <SegmentedControl size="sm" value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")} options={[{ value: "edit", label: "Write" }, { value: "preview", label: "Preview" }]} />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {mode === "edit" && canManage ? (
            <>
              <Textarea rows={22} value={text} onChange={(e) => setText(e.target.value)} className="t-mono text-sm" placeholder={"# Heading\n\nSteps, rules and examples. Use - for lists, **bold** for warnings and ![caption](image link) for screenshots."} />
              <p className="text-xs text-muted-foreground">Markdown: # headings, - lists, **bold**, [link](url), ![screenshot](image link). This is the source for the booklet, slides and the video script.</p>
            </>
          ) : text.trim() ? (
            <LmsMarkdown text={text} />
          ) : (
            <p className="text-sm text-muted-foreground">No master text yet.</p>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader className="pb-3"><CardTitle className="t-card-title">Trainer notes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={10} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage} placeholder="What to demonstrate, common mistakes, questions to ask the class." />
          <p className="text-xs text-muted-foreground">Hidden on the class screen unless the trainer opens them.</p>
        </CardContent>
      </Card>
      {canManage ? (
        <div className="flex justify-end xl:col-span-2">
          <Button onClick={save} disabled={saving || !dirty}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save text</Button>
        </div>
      ) : null}
    </div>
  );
}

function FilesTab({ m, assets, canManage, onSaved }: { m: LmsModule; assets: LmsAsset[]; canManage: boolean; onSaved: () => void }) {
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; asset: LmsAsset } | null>(null);
  const groups: { lang: LmsAssetLanguage; label: string }[] = [
    { lang: "en", label: "English" }, { lang: "hinglish", label: "Hinglish" }, { lang: "both", label: "Both languages" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-secondary">Videos (HeyGen), slides and booklets (Gamma), desk checklists, screen recordings and trainer guides, in English and Hinglish.</p>
        {canManage ? <Button size="sm" onClick={() => setDialog({ mode: "add" })}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add file or link</Button> : null}
      </div>
      {assets.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No files yet.</CardContent></Card>
      ) : (
        groups.map((g) => {
          const list = assets.filter((a) => a.language === g.lang);
          if (!list.length) return null;
          return (
            <Card key={g.lang} className="overflow-hidden">
              <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-medium">{g.label}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead className="hidden sm:table-cell">Kind</TableHead>
                    <TableHead className="hidden md:table-cell">Version</TableHead>
                    <TableHead className="hidden md:table-cell">Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="text-sm">{a.title}</p>
                        <p className="t-secondary flex items-center gap-1">
                          {a.storage_path ? <><FileUp className="h-3 w-3 shrink-0" aria-hidden /> Uploaded{a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ""}</> : <><Link2 className="h-3 w-3 shrink-0" aria-hidden /> Link</>}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{ASSET_KIND_LABEL[a.kind]}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{a.version ?? "—"}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{fmtDate(a.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openAsset(a)}><ExternalLink className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Open</span></Button>
                          {canManage ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit" onClick={() => setDialog({ mode: "edit", asset: a })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <ConfirmAction
                                title="Delete this file?"
                                description={a.storage_path ? "The uploaded file is deleted from storage." : "The link is removed from the module."}
                                confirmLabel="Delete"
                                destructive
                                onConfirm={async () => {
                                  try {
                                    await deleteAsset(a);
                                    toast.success("File deleted");
                                    onSaved();
                                  } catch (e) {
                                    toast.error(errorText(e));
                                  }
                                }}
                              >
                                {(open) => <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete" onClick={open}><Trash2 className="h-3.5 w-3.5" /></Button>}
                              </ConfirmAction>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          );
        })
      )}
      <AssetDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        module={m}
        asset={dialog?.mode === "edit" ? dialog.asset : null}
        nextSort={assets.reduce((x, a) => Math.max(x, a.sort_order ?? 0), 0) + 10}
        onSaved={onSaved}
      />
    </div>
  );
}

function AssetDialog({ open, onOpenChange, module, asset, nextSort, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; module: LmsModule; asset: LmsAsset | null; nextSort: number; onSaved: () => void;
}) {
  const [source, setSource] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<LmsAssetKind>("video");
  const [language, setLanguage] = useState<LmsAssetLanguage>("en");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setSource("upload");
    setFile(null);
    setUrl(asset?.external_url ?? "");
    setKind(asset?.kind ?? "video");
    setLanguage(asset?.language ?? "en");
    setTitle(asset?.title ?? "");
    setVersion(asset?.version ?? module.version);
  }, [open, asset, module.version]);
  const editing = Boolean(asset);
  const invalid = editing ? !title.trim() || (asset?.external_url ? !isHttpUrl(url) : false) : source === "upload" ? !file : !isHttpUrl(url);
  const save = async () => {
    setSaving(true);
    try {
      const meta = { kind, language, title: title.trim(), version: version.trim() || null };
      if (asset) {
        await updateAsset(asset.id, { ...meta, ...(asset.external_url ? { external_url: url.trim() } : {}) });
      } else if (source === "upload" && file) {
        setProgress(0);
        await addAssetFile(module, file, { ...meta, title: meta.title || file.name.replace(/\.[^.]+$/, "") }, nextSort, setProgress);
      } else {
        await addAssetLink(module, url, meta, nextSort);
      }
      toast.success(asset ? "File updated" : "File added");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={editing ? "Edit file details" : "Add a file or link"}
      description={editing ? "Kind, language, title and version." : "Upload a file (kept private to LMS users) or paste a share link. Large videos upload in parts."}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || invalid}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{editing ? "Save" : source === "upload" ? "Upload" : "Add link"}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!editing ? (
          <SegmentedControl value={source} onValueChange={(v) => setSource(v as "upload" | "link")} options={[{ value: "upload", label: "Upload a file" }, { value: "link", label: "Paste a link" }]} />
        ) : null}
        {!editing && source === "upload" ? (
          <FileDropzone
            onFiles={(f) => {
              const x = f[0] ?? null;
              setFile(x);
              if (x && !title.trim()) setTitle(x.name.replace(/\.[^.]+$/, ""));
              if (x?.type.startsWith("video/")) setKind("video");
              else if (x?.type === "application/pdf") setKind("booklet");
              else if (x?.type.startsWith("image/")) setKind("image");
              else if (x && /\.(pptx?|key)$/i.test(x.name)) setKind("slides");
            }}
            label={file ? file.name : "Drag a file here or click to choose"}
            hint={file ? formatBytes(file.size) : "Video, PDF, slides, images or documents"}
            disabled={saving}
          />
        ) : null}
        {progress !== null ? (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" aria-label="Upload progress" />
            <p className="text-xs text-muted-foreground">Uploading… {progress}%. Keep this window open; large videos are sent in parts.</p>
          </div>
        ) : null}
        {(!editing && source === "link") || (editing && asset?.external_url) ? (
          <div className="space-y-1.5">
            <Label htmlFor="lms-aurl">Link</Label>
            <Input id="lms-aurl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">YouTube (unlisted), Vimeo, Google Drive and Google Slides links play inside the class screen. HeyGen and Gamma links open in place when the site allows it, or in a new tab.</p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LmsAssetKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ASSET_KIND_LABEL) as LmsAssetKind[]).map((k) => <SelectItem key={k} value={k}>{ASSET_KIND_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as LmsAssetLanguage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LANGUAGE_LABEL) as LmsAssetLanguage[]).map((l) => <SelectItem key={l} value={l}>{LANGUAGE_LABEL[l]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-atitle">Title</Label>
            <Input id="lms-atitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-aver">For module version</Label>
            <Input id="lms-aver" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function ChecklistTab({ m, items, canManage, onSaved }: { m: LmsModule; items: { id: string; item: string; is_critical: boolean; sort_order: number }[]; canManage: boolean; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [critical, setCritical] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const swap = (i: number, j: number) =>
    run(async () => {
      const a = sorted[i];
      const b = sorted[j];
      const aSort = a.sort_order === b.sort_order ? b.sort_order + (j > i ? 1 : -1) : b.sort_order;
      await updateChecklistItem(a.id, { sort_order: aSort });
      await updateChecklistItem(b.id, { sort_order: a.sort_order });
    });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="t-card-title">Practical checklist</CardTitle>
        <p className="t-secondary">The steps a trainee must do correctly on the live screen or a mock case before sign-off. A critical step that isn't done right fails the practical.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No steps yet.</p> : (
          <ol className="space-y-1.5">
            {sorted.map((c, i) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center">
                <span className="t-mono w-6 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                {editing?.id === c.id ? (
                  <Input value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} className="flex-1" autoFocus />
                ) : (
                  <span className="flex-1 text-sm">{c.item}</span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {canManage ? (
                    <>
                      <label className="mr-2 flex items-center gap-1.5 text-xs">
                        <Checkbox checked={c.is_critical} disabled={busy} onCheckedChange={(v) => run(() => updateChecklistItem(c.id, { is_critical: v === true }))} /> Critical
                      </label>
                      {editing?.id === c.id ? (
                        <Button size="sm" disabled={busy || !editing.text.trim()} onClick={() => run(async () => { await updateChecklistItem(c.id, { item: editing.text.trim() }); setEditing(null); })}>Save</Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit step" onClick={() => setEditing({ id: c.id, text: c.item })}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={busy || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={busy || i === sorted.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete step" disabled={busy} onClick={() => run(() => deleteChecklistItem(c.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : c.is_critical ? <Badge variant="destructive-soft" className="text-[10px]">Critical</Badge> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        {canManage ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Checks the payer name matches the KYC name before release" className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim() && !busy) {
                  e.preventDefault();
                  run(async () => { await addChecklistItem(m.id, text, critical, (sorted[sorted.length - 1]?.sort_order ?? 0) + 10); setText(""); setCritical(false); });
                }
              }}
            />
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={critical} onCheckedChange={(v) => setCritical(v === true)} /> Critical</label>
            <Button disabled={busy || !text.trim()} onClick={() => run(async () => { await addChecklistItem(m.id, text, critical, (sorted[sorted.length - 1]?.sort_order ?? 0) + 10); setText(""); setCritical(false); })}>
              <Plus className="mr-1.5 h-4 w-4" /> Add step
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VersionTab({ m, canManage, affected, refresherCodes, onSaved }: {
  m: LmsModule; canManage: boolean; affected: number; refresherCodes: string[]; onSaved: () => void;
}) {
  const [version, setVersion] = useState(bumpVersion(m.version));
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setVersion(bumpVersion(m.version));
    setNotes("");
  }, [m.version]);
  const publish = async () => {
    setSaving(true);
    try {
      const n = await publishModuleVersion(m, version, notes, flag ? refresherCodes : []);
      toast.success(`Version ${version.trim()} published${n ? `; ${n} certification${n === 1 ? "" : "s"} flagged for a refresher` : ""}`);
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="t-card-title">Current version</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="t-mono">v{m.version}</span>{m.version_published_at ? ` · published ${fmtDate(m.version_published_at)}` : " · not published yet"}</p>
          {m.version_notes ? <p className="whitespace-pre-wrap text-muted-foreground">{m.version_notes}</p> : null}
          <p className="text-xs text-muted-foreground">Each plan records the version it taught and each certificate stores the versions behind it.</p>
        </CardContent>
      </Card>
      {canManage ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="t-card-title">Publish a new version</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lms-ver">Version</Label>
              <Input id="lms-ver" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lms-vnotes">What changed</Label>
              <Textarea id="lms-vnotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. New Binance appeal screen; updated release steps" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={flag} onCheckedChange={(v) => setFlag(v === true)} disabled={!refresherCodes.length} />
              <span>
                Flag people already certified for a refresher
                <span className="block text-xs text-muted-foreground">
                  {refresherCodes.length ? `${affected} certification${affected === 1 ? "" : "s"} across ${refresherCodes.length} KRA${refresherCodes.length === 1 ? "" : "s"} would be flagged.` : "This module isn't tied to specific KRAs, so nobody is flagged."}
                </span>
              </span>
            </label>
            <div className="flex justify-end">
              <Button onClick={publish} disabled={saving || !version.trim() || version.trim() === m.version}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Publish v{version.trim() || "?"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
