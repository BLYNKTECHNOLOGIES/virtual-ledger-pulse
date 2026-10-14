import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileJson, HardDrive, Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { useLmsAccess, useLmsInvalidate, useLmsKras, useLmsModules, useLmsSettings } from "@/hooks/lms/useLmsData";
import { importCatalogue, saveSettings, type ImportResult } from "@/lib/lms/actions";
import { LANGUAGE_LABEL } from "@/lib/lms/constants";
import { fmtDate } from "@/lib/lms/format";
import type { LmsLanguage } from "@/lib/lms/types";
import { ErrorBlock, LoadingBlock, ReadOnlyNote, errorText } from "./LmsShared";

type RawRow = Record<string, unknown> | null;

export function LmsSettings() {
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const settingsQ = useLmsSettings();
  const krasQ = useLmsKras();
  const modulesQ = useLmsModules();
  const s = settingsQ.data;

  const [programmeDays, setProgrammeDays] = useState(30);
  const [moduleDays, setModuleDays] = useState(15);
  const [testDays, setTestDays] = useState("8, 15");
  const [passMark, setPassMark] = useState(80);
  const [extensionDays, setExtensionDays] = useState(5);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [language, setLanguage] = useState<LmsLanguage>("en");
  const [saving, setSaving] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ version: string; kras: number; modules: number; payload: unknown } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!s) return;
    setProgrammeDays(s.programme_days);
    setModuleDays(s.module_days);
    setTestDays((s.test_days ?? []).join(", "));
    setPassMark(s.pass_mark);
    setExtensionDays(s.extension_days);
    setMaxAttempts(s.max_attempts);
    setLanguage(s.default_language);
  }, [s]);

  const parsedTests = Array.from(new Set(testDays.split(/[^0-9]+/).filter(Boolean).map(Number))).sort((a, b) => a - b);
  const problems: string[] = [];
  if (!(programmeDays >= 1 && programmeDays <= 180)) problems.push("Programme days: 1 to 180.");
  if (!(moduleDays >= 1 && moduleDays <= programmeDays)) problems.push("Module days: at least 1 and no more than the programme days.");
  if (parsedTests.some((d) => d < 1 || d > moduleDays)) problems.push("Test days must fall within the module days.");
  if (!(passMark >= 1 && passMark <= 100)) problems.push("Pass mark: 1 to 100.");
  if (!(extensionDays >= 0 && extensionDays <= 60)) problems.push("Extension days: 0 to 60.");
  if (!(maxAttempts >= 1 && maxAttempts <= 5)) problems.push("Attempts: 1 to 5.");

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        programme_days: Math.round(programmeDays), module_days: Math.round(moduleDays), test_days: parsedTests.length ? parsedTests : [Math.round(moduleDays)],
        pass_mark: Math.round(passMark), extension_days: Math.round(extensionDays), max_attempts: Math.round(maxAttempts), default_language: language,
      });
      toast.success("Programme settings saved");
      await invalidate();
    } catch (e) {
      toast.error(`Couldn't save: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const readFile = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setFileError(null);
    setResult(null);
    if (!f) return;
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("The file is larger than 20 MB; this isn't a catalogue file.");
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.kras) || !Array.isArray(data.modules)) throw new Error('Not a KRA catalogue file: it needs "kras" and "modules" lists.');
      if (data.format && data.format !== "blynkex-lms-catalogue") throw new Error(`Unknown file format "${data.format}".`);
      const badKra = (data.kras as RawRow[]).find((k) => !k?.code || !k?.name || !k?.department_code || !k?.subdepartment_code || !k?.layer_code);
      if (badKra) throw new Error(`A KRA is missing its code, name or department fields (${badKra?.code ?? "no code"}).`);
      const badMod = (data.modules as RawRow[]).find((m) => !m?.code || !m?.title || !m?.module_type);
      if (badMod) throw new Error(`A module is missing its code, title or type (${badMod?.code ?? "no code"}).`);
      setPreview({ version: String(data.version ?? "unknown"), kras: data.kras.length, modules: data.modules.length, payload: data });
    } catch (e) {
      setFileError(e instanceof SyntaxError ? "This isn't valid JSON." : errorText(e));
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const r = await importCatalogue(preview.payload);
      setResult(r);
      toast.success(`Catalogue ${preview.version} imported`);
      await invalidate();
    } catch (e) {
      toast.error(`Import failed: ${errorText(e)}`);
    } finally {
      setImporting(false);
    }
  };

  if (settingsQ.error && !settingsQ.data) return <ErrorBlock error={settingsQ.error} onRetry={() => settingsQ.refetch()} />;
  if (settingsQ.isLoading) return <LoadingBlock rows={6} />;

  return (
    <div className="space-y-4">
      {!canManage ? <ReadOnlyNote /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="t-card-title">Programme defaults</CardTitle>
            <p className="t-secondary">Used for every new joiner induction. Each plan keeps its own copy, so changes here don't move plans already made.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-prog">Programme days</Label>
                <Input id="lms-s-prog" type="number" min={1} max={180} value={programmeDays} onChange={(e) => setProgrammeDays(Number(e.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-mod">Module days</Label>
                <Input id="lms-s-mod" type="number" min={1} max={180} value={moduleDays} onChange={(e) => setModuleDays(Number(e.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-tests">Test days</Label>
                <Input id="lms-s-tests" value={testDays} onChange={(e) => setTestDays(e.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-pass">Pass mark (%)</Label>
                <Input id="lms-s-pass" type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-ext">Extra days after a fail</Label>
                <Input id="lms-s-ext" type="number" min={0} max={60} value={extensionDays} onChange={(e) => setExtensionDays(Number(e.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-s-att">Attempts before exit</Label>
                <Input id="lms-s-att" type="number" min={1} max={5} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} disabled={!canManage} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Default language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as LmsLanguage)} disabled={!canManage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{LANGUAGE_LABEL.en}</SelectItem>
                    <SelectItem value="hinglish">{LANGUAGE_LABEL.hinglish}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Days after the module days are supervised live work. A failed final test gives the extra days and a retest; failing again after the last attempt closes the plan with "exit recommended".
            </p>
            {problems.length ? <ul className="space-y-0.5 text-xs text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
            {canManage ? (
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving || problems.length > 0}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="t-card-title flex items-center gap-2"><FileJson className="h-4 w-4 text-muted-foreground" aria-hidden /> KRA catalogue</CardTitle>
            <p className="t-secondary">
              Loaded: {s?.catalogue_version ?? "none"}{s?.catalogue_imported_at ? `, ${fmtDate(s.catalogue_imported_at, "dd MMM yyyy, HH:mm")}` : ""} ·{" "}
              {(krasQ.data ?? []).filter((k) => k.is_active).length} KRAs · {(modulesQ.data ?? []).filter((m) => m.is_active).length} modules
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Importing a new catalogue version updates KRA names, descriptions and module links. It never deletes: KRAs and modules no longer in the file are marked
              "removed from catalogue", and module text, files, checklists, status and versions are never overwritten.
            </p>
            {canManage ? (
              <>
                <FileDropzone
                  accept=".json,application/json"
                  onFiles={(f) => readFile(f[0] ?? null)}
                  label={file ? file.name : "Drop the catalogue .json file or click to choose"}
                  hint="lms-catalogue-<version>.json"
                />
                {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}
                {preview ? (
                  <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">Version <span className="t-mono">{preview.version}</span>: {preview.kras} KRAs, {preview.modules} modules.</p>
                    <Button onClick={runImport} disabled={importing}>{importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Import</Button>
                  </div>
                ) : null}
                {result ? (
                  <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                    Imported: {result.kras} KRAs, {result.modules} modules, {result.links} module–KRA links.
                    {result.kras_deactivated || result.modules_deactivated ? ` Marked removed: ${result.kras_deactivated} KRAs, ${result.modules_deactivated} modules.` : ""}
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="t-card-title flex items-center gap-2"><HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden /> Files and videos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Uploaded files go to a private storage area that only LMS users can open; links expire after a few hours.</p>
            <p>Large videos upload in parts (the same way vKYC videos do) and are joined again when played, so the first play of a long video takes a moment to load.</p>
            <p>A link works too: YouTube (unlisted), Vimeo, Google Drive or a HeyGen or Gamma share link.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="t-card-title flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden /> Who can use the LMS</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Everyone with HRMS View gets LMS View, and everyone with HRMS Manage gets LMS Manage, automatically.</p>
            <p>A trainer who shouldn't see the rest of HRMS can be given only "HRMS LMS" View or Manage in User Management → Roles. They then see just the LMS in HRMS.</p>
            <p>Trainees don't log in: the trainer runs the class screen and records results here. Tests themselves run in the Quiz module.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
