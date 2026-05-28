import { ExternalLink, FileText, ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function MonoValue({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-foreground break-all">{children}</span>;
}

/**
 * Renders an attachment as an inline image preview (for image URLs) or a
 * download link (for PDFs / other files). Shows "—" when no URL.
 */
export function Attachment({ url, label }: { url?: string | null; label?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
  const isPdf = /\.pdf(\?|$)/i.test(url);

  return (
    <div className="space-y-2">
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={label || 'Attachment'}
            className="max-h-56 w-auto rounded-md border border-border object-contain bg-muted"
            loading="lazy"
          />
        </a>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
          {isPdf ? <FileText className="h-5 w-5 text-muted-foreground" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm text-foreground truncate flex-1">{label || url.split('/').pop()}</span>
        </div>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> Open / Download
      </a>
    </div>
  );
}
