import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Minus, Plus, RefreshCw, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { fileExt, fileKindLabel, signAtsFile } from "@/lib/ats/files";
import { fmtDate } from "@/lib/ats/format";
import type { AtsFile } from "@/lib/ats/candidates";

let pdfjsPromise: Promise<any> | null = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default ?? workerMod;
      return pdfjs;
    })().catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

/** Pick the file to auto-open: primary resume, else newest resume, else null. */
export function pickDefaultFile(files: AtsFile[]): AtsFile | null {
  const resumes = files.filter((f) => f.kind === "resume");
  return resumes.find((f) => f.is_primary) ?? resumes[0] ?? null;
}

type Kind = "pdf" | "docx" | "image" | "doc" | "other";
const kindOf = (f: AtsFile): Kind => {
  const e = fileExt(f.file_name);
  if (e === "pdf") return "pdf";
  if (e === "docx") return "docx";
  if (["jpg", "jpeg", "png", "webp"].includes(e)) return "image";
  if (e === "doc") return "doc";
  return "other";
};

function PdfView({ url, zoom, onError }: { url: string; zoom: number; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const docRef = useRef<any>(null);
  const [doc, setDoc] = useState<any>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    let task: any = null;
    (async () => {
      try {
        const pdfjs = await getPdfjs();
        task = pdfjs.getDocument({ url });
        const d = await task.promise;
        if (!alive) { d.destroy(); return; }
        docRef.current = d;
        setDoc(d);
      } catch { if (alive) onError(); }
    })();
    return () => {
      alive = false;
      setDoc(null);
      try { task?.destroy(); } catch { /* ignore */ }
      try { docRef.current?.destroy(); } catch { /* ignore */ }
      docRef.current = null;
    };
  }, [url, onError]);

  useEffect(() => {
    const el = host.current;
    if (!doc || !el || !width) return;
    let cancelled = false;
    const renders: any[] = [];
    (async () => {
      el.innerHTML = "";
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = ((width - 16) / base.width) * zoom;
        const vp = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        canvas.className = "mx-auto mb-3 block rounded-sm bg-white shadow-sm";
        el.appendChild(canvas);
        const t = page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp });
        renders.push(t);
        try { await t.promise; } catch { /* cancelled */ }
      }
    })().catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; renders.forEach((r) => { try { r.cancel(); } catch { /* ignore */ } }); };
  }, [doc, width, zoom, onError]);

  return (
    <div className="relative min-h-[200px]">
      {!doc && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      <div ref={host} className="p-2" />
    </div>
  );
}

function DocxView({ url, onError }: { url: string; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error("fetch");
        const blob = await res.blob();
        const { renderAsync } = await import("docx-preview");
        if (!alive || !host.current) return;
        host.current.innerHTML = "";
        await renderAsync(blob, host.current, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true });
        if (alive) setLoading(false);
      } catch { if (alive) onError(); }
    })();
    return () => { alive = false; ctl.abort(); if (host.current) host.current.innerHTML = ""; };
  }, [url, onError]);
  return (
    <div className="relative min-h-[200px] overflow-x-auto">
      {loading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      <div ref={host} className="[&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-2" />
    </div>
  );
}

export function ResumeViewer({
  files, selectedId, onSelect, onUpload, className,
}: { files: AtsFile[]; selectedId: string | null; onSelect: (id: string) => void; onUpload: () => void; className?: string }) {
  const file = files.find((f) => f.id === selectedId) ?? null;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [nonce, setNonce] = useState(0);
  const onError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    let alive = true;
    setUrl(null); setFailed(false);
    let timer: number | undefined;
    const sign = async () => {
      try {
        const u = await signAtsFile(file.storage_path, 600);
        if (!alive) return;
        setUrl(u);
        // Rendered content is already loaded; Download / Open re-sign on demand,
        // so an expired link is never handed out.

      } catch { if (alive) setFailed(true); }
    };
    sign();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, [file?.id, file?.storage_path, nonce]);

  useEffect(() => setZoom(1), [file?.id]);

  const freshUrl = async () => {
    if (!file) return null;
    try { return await signAtsFile(file.storage_path, 600); } catch { return null; }
  };
  const download = async () => {
    const u = await freshUrl();
    if (!u || !file) return;
    const a = document.createElement("a");
    a.href = `${u}&download=${encodeURIComponent(file.file_name)}`;
    a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const openTab = async () => { const u = await freshUrl(); if (u) window.open(u, "_blank", "noopener"); };

  const hasResume = files.some((f) => f.kind === "resume");
  if (!files.length || (!file && !hasResume)) {
    return (
      <div className={cn("flex h-full flex-col", className)}>
        {files.length > 0 && <FileChips files={files} selectedId={selectedId} onSelect={onSelect} />}
        <EmptyState icon={FileText} title="No resume yet" description="Upload a resume to review it here."
          action={<Button size="sm" onClick={onUpload} className="gap-1.5"><Upload className="h-4 w-4" /> Upload resume</Button>} />
      </div>
    );
  }

  const k = file ? kindOf(file) : "other";
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <FileChips files={files} selectedId={selectedId} onSelect={onSelect} />
      {file && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="truncate text-xs text-muted-foreground" title={file.file_name}>{file.file_name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {k === "pdf" && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><Minus className="h-4 w-4" /></Button>
                <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}><Plus className="h-4 w-4" /></Button>
              </>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Download" onClick={download}><Download className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Open in new tab" onClick={openTab}><ExternalLink className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
        {!file ? null : failed ? (
          <EmptyState icon={AlertTriangle} title="Couldn't show this file" description="The preview failed to load."
            action={<div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setFailed(false); setNonce((n) => n + 1); }}><RefreshCw className="h-4 w-4" /> Try again</Button>
              <Button size="sm" className="gap-1.5" onClick={download}><Download className="h-4 w-4" /> Download</Button>
            </div>} />
        ) : k === "doc" || k === "other" ? (
          <EmptyState icon={FileText} title="Preview isn't available for .doc files" description="Download the file to open it in Word."
            action={<Button size="sm" className="gap-1.5" onClick={download}><Download className="h-4 w-4" /> Download</Button>} />
        ) : !url ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : k === "pdf" ? (
          <PdfView key={`${file.id}-${nonce}`} url={url} zoom={zoom} onError={onError} />
        ) : k === "docx" ? (
          <DocxView key={`${file.id}-${nonce}`} url={url} onError={onError} />
        ) : (
          <div className="p-2"><img src={url} alt={file.file_name} onError={onError} className="mx-auto h-auto max-w-full rounded-sm" /></div>
        )}
      </div>
    </div>
  );
}

function FileChips({ files, selectedId, onSelect }: { files: AtsFile[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (files.length <= 1 && files[0]?.id === selectedId) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
      {files.map((f) => (
        <button key={f.id} type="button" onClick={() => onSelect(f.id)}
          className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            f.id === selectedId ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          {fileKindLabel(f.kind)}{f.is_primary ? " ★" : ""} · {fmtDate(f.created_at)}
        </button>
      ))}
    </div>
  );
}
