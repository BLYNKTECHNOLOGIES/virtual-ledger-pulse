import { FileText, ImageIcon, Paperclip } from "lucide-react";
import { useStorageUrl } from "@/lib/storage-url";

const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg|heic)(\?|$)/i.test(url);
const fileName = (url: string) => decodeURIComponent(url.split("?")[0].split("/").pop() || "document");

function Thumb({ url }: { url: string }) {
  const signed = useStorageUrl(url);
  const image = isImageUrl(url);
  const name = fileName(url);

  return (
    <a
      href={signed || url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={name}
      className="group/att flex items-center gap-2 rounded-md border border-border bg-muted/30 p-1 pr-2 hover:border-primary/50 hover:bg-muted/60 transition-colors max-w-[190px]"
    >
      {image ? (
        <img
          src={signed}
          alt={name}
          loading="lazy"
          className="h-9 w-9 rounded object-cover bg-muted shrink-0"
        />
      ) : (
        <span className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
          {/\.pdf(\?|$)/i.test(url) ? (
            <FileText className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground group-hover/att:text-foreground truncate">{name}</span>
    </a>
  );
}

/**
 * Inline "documents at a glance" row — same review-in-line pattern used on the
 * client pages: image attachments render as thumbnails, files as chips.
 */
export function InlineAttachmentStrip({ urls, max = 4 }: { urls?: string[] | null; max?: number }) {
  const list = (urls ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Paperclip className="h-3 w-3" /> {list.length} doc{list.length === 1 ? "" : "s"}
      </span>
      {shown.map((u) => (
        <Thumb key={u} url={u} />
      ))}
      {rest > 0 && <span className="text-[11px] text-muted-foreground">+{rest} more</span>}
    </div>
  );
}
