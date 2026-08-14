import { useMemo } from "react";
import DOMPurify from "dompurify";

/**
 * Renders an email body the way a mail client does:
 * - sanitized HTML (scripts/styles/iframes stripped, links forced to open safely)
 * - graceful fallback to plain text with auto-linked URLs
 */
export function MailBodyView({
  html,
  text,
}: {
  html?: string | null;
  text?: string | null;
}) {
  const clean = useMemo(() => {
    if (!html || !html.trim()) return null;
    const sanitized = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "meta"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "srcdoc"],
    });
    return sanitized;
  }, [html]);

  if (clean) {
    return (
      <div
        className="mail-html-body max-w-full overflow-x-auto text-sm leading-relaxed text-foreground
          [&_a]:text-primary [&_a]:underline [&_a]:break-words
          [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded
          [&_table]:max-w-full [&_table]:border-collapse
          [&_td]:align-top [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
          [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
          [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold
          [&_*]:!bg-transparent [&_*]:!text-inherit [&_*]:!font-[inherit]"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: clean }}
        ref={(node) => {
          if (!node) return;
          node.querySelectorAll("a").forEach((a) => {
            a.setAttribute("target", "_blank");
            a.setAttribute("rel", "noopener noreferrer nofollow");
          });
        }}
      />
    );
  }

  const plain = (text || "").trim();
  if (!plain) return <span className="text-muted-foreground">(empty message)</span>;

  const parts = plain.split(/(https?:\/\/[^\s<>()]+)/g);
  return (
    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}
