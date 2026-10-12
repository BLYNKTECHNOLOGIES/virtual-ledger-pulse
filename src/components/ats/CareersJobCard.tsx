import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { jobKeys, updateJob, useAtsMutation, useAtsSettings, type AtsJob } from "@/lib/ats/api";
import { SectionCard } from "./AtsBits";

export function CareersJobCard({ job }: { job: AtsJob }) {
  const settings = useAtsSettings();
  const base = String((settings.data as any)?.careers_base_url ?? "").replace(/\/+$/, "");
  const link = base && job.slug ? `${base}/${job.slug}` : "";
  const isOpen = job.status === "open";
  const toggle = useAtsMutation((v: boolean) => updateJob({ id: job.id, patch: { is_published: v } }), {
    invalidate: () => jobKeys(job.id),
    success: (v) => (v ? "Shown on careers page" : "Removed from careers page"),
  });
  return (
    <SectionCard title="Careers page">
      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
        <span>
          Show on careers page
          {!isOpen && <span className="block text-xs text-muted-foreground">Open the job first</span>}
        </span>
        <Switch checked={!!job.is_published} disabled={(!isOpen && !job.is_published) || toggle.isPending}
          onCheckedChange={(v) => toggle.mutate(v)} aria-label="Show on careers page" />
      </label>
      {job.is_published && link && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <span className="t-mono min-w-0 flex-1 truncate text-xs text-foreground" title={link}>{link}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copy link"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"))}><Copy className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Open link" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Changes show on the website within about 5 minutes.</p>
        </div>
      )}
    </SectionCard>
  );
}
