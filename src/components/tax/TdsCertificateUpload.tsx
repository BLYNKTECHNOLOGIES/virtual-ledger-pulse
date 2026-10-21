import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { importTdsZip, type ImportResult } from "@/lib/tdsCertificateImport";

/** Upload a TDS certificates ZIP. Only Tax Management managers see this. */
export function TdsCertificateUpload({ size = "sm" }: { size?: "sm" | "default" }) {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<(ImportResult & { matched: number; unmatched: string[] }) | null>(null);

  if (!hasPermission("tax_management_manage")) return null;

  const run = async (file: File) => {
    setBusy(true); setResult(null); setProgress([0, 0]);
    try {
      const r = await importTdsZip(file, user?.id, (d, t) => setProgress([d, t]));
      const pans = [...new Set(r.pans)];
      const found = new Set<string>();
      for (let i = 0; i < pans.length; i += 150) {
        const { data } = await supabase.from("clients").select("pan_card_number").in("pan_card_number", pans.slice(i, i + 150));
        (data || []).forEach((c: any) => found.add(String(c.pan_card_number).trim().toUpperCase()));
      }
      setResult({ ...r, matched: pans.filter((p) => found.has(p)).length, unmatched: pans.filter((p) => !found.has(p)) });
      qc.invalidateQueries({ queryKey: ["client-tds-certificates"] });
    } catch (e: any) {
      setResult({ saved: 0, skipped: [{ file: file.name, reason: e?.message || "Could not read ZIP" }], pans: [], matched: 0, unmatched: [] });
    } finally { setBusy(false); }
  };

  return (
    <>
      <input ref={input} type="file" accept=".zip,application/zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(f); }} />
      <Button size={size} variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Upload TDS certificates (ZIP)
      </Button>
      <Dialog open={busy || !!result} onOpenChange={(o) => { if (!o && !busy) setResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>TDS certificates upload</DialogTitle>
            <DialogDescription>Each certificate is filed under the client with the same PAN, by quarter.</DialogDescription>
          </DialogHeader>
          {busy && (
            <div className="space-y-2">
              <Progress value={progress[1] ? (progress[0] / progress[1]) * 100 : 0} />
              <p className="text-sm text-muted-foreground">{progress[0]} of {progress[1] || "…"} certificates</p>
            </div>
          )}
          {result && !busy && (
            <div className="space-y-2 text-sm text-foreground">
              <p>Saved: <b>{result.saved}</b> · Matched to clients: <b>{result.matched}</b> · No client with that PAN: <b>{result.unmatched.length}</b> · Failed: <b>{result.skipped.length}</b></p>
              {result.unmatched.length > 0 && (
                <p className="text-muted-foreground">Unmatched certificates are kept and will appear automatically once a client's PAN is saved.</p>
              )}
              {result.unmatched.length > 0 && (
                <div className="max-h-28 overflow-auto rounded bg-muted p-2 font-mono text-xs">{result.unmatched.join(", ")}</div>
              )}
              {result.skipped.length > 0 && (
                <div className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                  {result.skipped.map((s) => <div key={s.file}>{s.file}: {s.reason}</div>)}
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button disabled={busy} onClick={() => setResult(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
