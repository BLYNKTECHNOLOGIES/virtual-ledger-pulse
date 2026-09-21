import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { getJdSignedUrl } from "@/hooks/useJobDescriptions";

interface JobDescriptionViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  storagePath: string | null;
}

/** Read-only viewer for a role's Job Description PDF (private bucket, signed URL). */
export function JobDescriptionViewer({
  open,
  onOpenChange,
  title,
  subtitle,
  storagePath,
}: JobDescriptionViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !storagePath) return;
    let active = true;
    setUrl(null);
    setError(null);
    getJdSignedUrl(storagePath)
      .then((u) => active && setUrl(u))
      .catch((e) => active && setError(e?.message || "Could not open the document"));
    return () => {
      active = false;
    };
  }, [open, storagePath]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {title}
        </span>
      }
      description={subtitle}
      contentClassName="max-w-4xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          {url && (
            <>
              <Button variant="outline" className="h-9" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Open in new tab
                </a>
              </Button>
              <Button className="h-9" asChild>
                <a href={url} download>
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </Button>
            </>
          )}
        </div>
      }
    >
      {!storagePath ? (
        <p className="text-sm text-muted-foreground">
          No job description document is linked to this role yet.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !url ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <iframe
          src={url}
          title={title}
          className="h-[65vh] w-full rounded-lg border border-border bg-muted/20"
        />
      )}
    </ResponsiveDialog>
  );
}
