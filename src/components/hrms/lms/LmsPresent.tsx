import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FileText, Image as ImageIcon, ListChecks, Loader2, Maximize2,
  Minimize2, NotebookPen, PanelLeftClose, PanelLeftOpen, PlayCircle, Presentation,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLmsAccess, useLmsInvalidate, useLmsModule, useLmsPlan } from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { setItemDone } from "@/lib/lms/actions";
import { ASSET_KIND_LABEL } from "@/lib/lms/constants";
import { lmsFileUrl } from "@/lib/lms/db";
import { classifyMedia } from "@/lib/lms/format";
import type { LmsAsset, LmsAssetKind, LmsLanguage } from "@/lib/lms/types";
import { cn } from "@/lib/utils";
import { ErrorBlock, LoadingBlock, errorText } from "./LmsShared";
import { LmsMarkdown } from "./LmsMarkdown";

const KIND_ORDER: Record<LmsAssetKind, number> = {
  video: 0, screen_recording: 1, slides: 2, booklet: 3, job_aid: 4, image: 5, other: 6, trainer_guide: 7,
};

type Material = { key: string; label: string; sub: string; asset?: LmsAsset; kind: "text" | "checklist" | "asset" };

function MaterialIcon({ m }: { m: Material }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground";
  if (m.kind === "checklist") return <ListChecks className={cls} aria-hidden />;
  if (m.kind === "text") return <FileText className={cls} aria-hidden />;
  const k = m.asset?.kind;
  if (k === "video" || k === "screen_recording") return <PlayCircle className={cls} aria-hidden />;
  if (k === "slides") return <Presentation className={cls} aria-hidden />;
  if (k === "image") return <ImageIcon className={cls} aria-hidden />;
  return <FileText className={cls} aria-hidden />;
}

/** Classroom screen: the module's material in one language, full screen on the projector. */
export function LmsPresent() {
  const { go, params } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const moduleId = params.get("module");
  const lang: LmsLanguage = params.get("lang") === "hinglish" ? "hinglish" : "en";
  const planId = params.get("plan");
  const itemId = params.get("item");
  const q = useLmsModule(moduleId);
  const planQ = useLmsPlan(planId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showList, setShowList] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const revokers = useRef<(() => void)[]>([]);
  const [marking, setMarking] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const m = q.data?.module ?? null;
  const item = planQ.data?.items.find((i) => i.id === itemId) ?? null;

  const materials = useMemo<Material[]>(() => {
    if (!q.data) return [];
    const out: Material[] = [];
    const assets = q.data.assets
      .filter((a) => a.language === lang || a.language === "both")
      .filter((a) => showNotes || a.kind !== "trainer_guide")
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.sort_order - b.sort_order);
    for (const a of assets) out.push({ key: a.id, label: a.title, sub: ASSET_KIND_LABEL[a.kind], asset: a, kind: "asset" });
    if (q.data.module.content_md?.trim()) out.push({ key: "text", label: "Master text", sub: "Reading", kind: "text" });
    if (q.data.checklist.length) out.push({ key: "checklist", label: "Practical checklist", sub: `${q.data.checklist.length} steps`, kind: "checklist" });
    return out;
  }, [q.data, lang, showNotes]);

  useEffect(() => {
    if (!materials.length) return;
    if (!selected || !materials.some((x) => x.key === selected)) setSelected(materials[0].key);
  }, [materials, selected]);

  const current = materials.find((x) => x.key === selected) ?? null;
  const idx = current ? materials.indexOf(current) : -1;

  // Uploaded files need a short-lived signed link; a file stored in parts is joined first.
  useEffect(() => {
    const a = current?.asset;
    setUrlError(null);
    setLoadPct(null);
    if (!a?.storage_path || urls[a.id]) return;
    let cancelled = false;
    lmsFileUrl(a.storage_path, (p) => !cancelled && setLoadPct(p))
      .then(({ url, revoke }) => {
        if (revoke) revokers.current.push(revoke);
        if (!cancelled) setUrls((s) => ({ ...s, [a.id]: url }));
      })
      .catch((e) => !cancelled && setUrlError(errorText(e)))
      .finally(() => !cancelled && setLoadPct(null));
    return () => {
      cancelled = true;
    };
  }, [current, urls]);

  useEffect(() => () => revokers.current.forEach((r) => r()), []);

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boxRef.current?.requestFullscreen();
    } catch {
      toast.error("This browser blocked full screen. Use the browser's own full-screen key (F11).");
    }
  };

  const step = useCallback((d: number) => {
    if (!materials.length || idx < 0) return;
    const next = materials[Math.min(materials.length - 1, Math.max(0, idx + d))];
    if (next) setSelected(next.key);
  }, [materials, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "PageDown" || (e.key === "ArrowRight" && e.altKey)) { e.preventDefault(); step(1); }
      if (e.key === "PageUp" || (e.key === "ArrowLeft" && e.altKey)) { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const back = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    if (planId) go("plans", { plan: planId });
    else if (moduleId) go("library", { module: moduleId });
    else go("library");
  };

  const markTaught = async () => {
    if (!item) return;
    setMarking(true);
    try {
      await setItemDone(item, true, { demo_done: item.demo_done });
      toast.success("Marked as taught");
      await invalidate();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setMarking(false);
    }
  };

  if (!moduleId) return <ErrorBlock error="No module chosen. Open a module from the library or a training plan." />;
  if (q.error && !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !m) return <LoadingBlock rows={6} />;

  const viewerHeight = isFull ? "h-[calc(100vh-64px)]" : "h-[calc(100vh-260px)] min-h-[420px]";

  const renderAsset = (a: LmsAsset) => {
    const url = a.storage_path ? urls[a.id] : a.external_url;
    if (a.storage_path && !url) {
      return urlError ? <ErrorBlock error={urlError} /> : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          {loadPct !== null ? <p className="text-sm text-muted-foreground">Preparing the video… {loadPct}%</p> : null}
        </div>
      );
    }
    if (!url) return <p className="p-6 text-sm text-muted-foreground">This file has no link.</p>;
    const media = classifyMedia(url, a.mime_type);
    if (media.kind === "unsafe") {
      return <p className="p-6 text-sm text-destructive">This link isn't a web address (http or https), so it can't be shown. Fix it in the module's Files tab.</p>;
    }
    const openBtn = (
      <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in a new tab
      </Button>
    );
    // Other sites run in a sandbox: they can play and run their own scripts but can't steer this page.
    const framed = (sandboxed: boolean, withBar: boolean) => (
      <div className="flex h-full flex-col">
        {withBar ? (
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>If this stays blank, the site doesn't allow embedding — open it in a new tab.</span>
            {openBtn}
          </div>
        ) : null}
        <iframe
          key={a.id}
          src={media.src}
          title={a.title}
          className="min-h-0 w-full flex-1 border-0 bg-background"
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
          {...(sandboxed ? { sandbox: "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms" } : {})}
        />
      </div>
    );
    switch (media.kind) {
      case "video":
        return <video key={a.id} src={media.src} controls className="h-full w-full bg-black object-contain" preload="metadata" />;
      case "image":
        return <div className="flex h-full items-center justify-center bg-muted/30"><img src={media.src} alt={a.title} className="max-h-full max-w-full object-contain" /></div>;
      case "pdf":
        // Only a file uploaded to this module (a signed link or a joined blob) is framed without the sandbox.
        return a.storage_path ? framed(false, false) : framed(true, true);
      case "youtube":
      case "vimeo":
      case "drive":
        return framed(true, false);
      case "office":
      case "file":
        return (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="max-w-md text-sm text-muted-foreground">
              {media.kind === "office"
                ? "PowerPoint and Word files can't play inside the browser. Open the file, or upload a PDF export of it for the class screen."
                : "This kind of file can't be shown here. Open it to download it."}
            </p>
            {openBtn}
          </div>
        );
      default:
        return framed(true, true);
    }
  };

  return (
    <div ref={boxRef} className={cn("space-y-3", isFull && "flex h-screen flex-col gap-2 space-y-0 bg-background p-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={back} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <p className="t-mono text-xs text-muted-foreground">{m.code} · v{m.version}</p>
            <p className="truncate font-semibold">{m.title}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<LmsLanguage>
            size="sm"
            aria-label="Language"
            value={lang}
            onValueChange={(v) => go("present", { module: moduleId, lang: v, plan: planId, item: itemId }, true)}
            options={[{ value: "en", label: "English" }, { value: "hinglish", label: "Hinglish" }]}
          />
          <Button size="sm" variant={showNotes ? "default" : "outline"} onClick={() => setShowNotes((s) => !s)}>
            <NotebookPen className="mr-1.5 h-3.5 w-3.5" /> Trainer notes
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowList((s) => !s)} aria-label={showList ? "Hide the list" : "Show the list"}>
            {showList ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFull}>
            {isFull ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}{isFull ? "Exit full screen" : "Full screen"}
          </Button>
          {item && canManage ? (
            item.status === "done" ? (
              <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Taught</Badge>
            ) : (
              <Button size="sm" onClick={markTaught} disabled={marking}>{marking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />} Mark taught</Button>
            )
          ) : null}
        </div>
      </div>

      {showNotes && m.trainer_notes?.trim() ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3">
            <p className="t-label mb-1">Trainer notes — not for the class screen</p>
            <LmsMarkdown text={m.trainer_notes} />
          </CardContent>
        </Card>
      ) : null}

      {materials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <PlayCircle className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No {lang === "hinglish" ? "Hinglish" : "English"} material for this module yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Add videos, slides or the master text in the module library{lang === "hinglish" ? ", or switch to English" : ""}.</p>
            {canManage ? <Button size="sm" variant="outline" onClick={() => go("library", { module: m.id })}>Open the module</Button> : null}
          </CardContent>
        </Card>
      ) : (
        <div className={cn("grid gap-3", showList ? "md:grid-cols-[230px_minmax(0,1fr)]" : "grid-cols-1", isFull && "min-h-0 flex-1")}>
          {showList ? (
            <Card className={cn("overflow-hidden", isFull && "min-h-0")}>
              <ul className={cn("divide-y divide-border overflow-y-auto", isFull ? "h-full" : "max-h-[calc(100vh-260px)]")}>
                {materials.map((x, i) => (
                  <li key={x.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(x.key)}
                      className={cn("flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50", x.key === selected && "bg-primary/10")}
                    >
                      <span className="t-mono mt-0.5 w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                      <MaterialIcon m={x} />
                      <span className="min-w-0">
                        <span className="block truncate">{x.label}</span>
                        <span className="block text-xs text-muted-foreground">{x.sub}{x.asset?.language === "both" ? " · both languages" : ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className={cn("flex flex-col overflow-hidden", isFull && "min-h-0")}>
            <div className={cn("min-h-0 flex-1 overflow-auto", current?.kind === "asset" ? viewerHeight : isFull ? "h-full" : "max-h-[calc(100vh-260px)]")}>
              {current?.kind === "asset" && current.asset ? renderAsset(current.asset) : null}
              {current?.kind === "text" ? <div className="mx-auto max-w-4xl p-6"><LmsMarkdown text={m.content_md} large /></div> : null}
              {current?.kind === "checklist" ? (
                <div className="mx-auto max-w-3xl p-6">
                  <h3 className="mb-4 text-xl font-semibold">Practical checklist</h3>
                  <ol className="space-y-3">
                    {[...(q.data?.checklist ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((c, i) => (
                      <li key={c.id} className="flex items-start gap-3 text-lg">
                        <span className="t-mono w-7 shrink-0 text-muted-foreground">{i + 1}.</span>
                        <span>{c.item}{c.is_critical ? <Badge variant="destructive-soft" className="ml-2 align-middle">Critical</Badge> : null}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
              <Button size="sm" variant="ghost" disabled={idx <= 0} onClick={() => step(-1)}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
              <span className="text-xs text-muted-foreground">{idx + 1} of {materials.length}</span>
              <Button size="sm" variant="ghost" disabled={idx >= materials.length - 1} onClick={() => step(1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
