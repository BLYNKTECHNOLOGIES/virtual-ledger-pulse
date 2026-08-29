import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { MoreHorizontal } from "lucide-react";

const BODY_CLASSES = `mail-html-body max-w-full overflow-x-auto text-sm leading-relaxed text-foreground
  [&_a]:text-primary [&_a]:underline [&_a]:break-words
  [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded
  [&_table]:max-w-full [&_table]:border-collapse
  [&_td]:align-top [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
  [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
  [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold
  [&_*]:!bg-transparent [&_*]:!text-inherit [&_*]:!font-[inherit]`;

function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "meta"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "srcdoc"],
  });
}

/** Splits an HTML body into the new content and the quoted reply history. */
function splitQuotedHtml(html: string): { main: string; quoted: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const marker =
    doc.querySelector(".gmail_quote, blockquote[type=cite], div.gmail_quote_container, #appendonsend") ||
    Array.from(doc.body.querySelectorAll("blockquote")).find((b) => (b.textContent || "").length > 120) ||
    null;

  if (!marker) return { main: html, quoted: "" };

  const quotedParts: string[] = [];
  let node: ChildNode | null = marker;
  // Take the marker and everything after it in its parent chain.
  while (node) {
    quotedParts.push((node as HTMLElement).outerHTML || node.textContent || "");
    const next: ChildNode | null = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }

  const main = doc.body.innerHTML;
  if (!main.replace(/<[^>]+>/g, "").trim() && !quotedParts.length) return { main: html, quoted: "" };
  return { main, quoted: quotedParts.join("") };
}

/** Splits plain text on the classic "On … wrote:" attribution line. */
function splitQuotedText(text: string): { main: string; quoted: string } {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => /^\s*On .+wrote:\s*$/i.test(l) || /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l));
  const quoteStart = idx >= 0 ? idx : lines.findIndex((l) => /^\s*>/.test(l));
  if (quoteStart <= 0) return { main: text, quoted: "" };
  return { main: lines.slice(0, quoteStart).join("\n").trimEnd(), quoted: lines.slice(quoteStart).join("\n") };
}

function Html({ html }: { html: string }) {
  return (
    <div
      className={BODY_CLASSES}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
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

function PlainText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+)/g);
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

/**
 * Renders an email body the way Gmail does:
 * - sanitized HTML (scripts/styles/iframes stripped, links forced to open safely)
 * - quoted reply history collapsed behind a "…" chip
 * - graceful fallback to plain text with auto-linked URLs
 */
export function MailBodyView({
  html,
  text,
  collapseQuotes = true,
}: {
  html?: string | null;
  text?: string | null;
  collapseQuotes?: boolean;
}) {
  const [showQuoted, setShowQuoted] = useState(false);

  const parsed = useMemo(() => {
    if (html && html.trim()) {
      const clean = sanitize(html);
      if (!collapseQuotes) return { kind: "html" as const, main: clean, quoted: "" };
      try {
        const { main, quoted } = splitQuotedHtml(clean);
        return { kind: "html" as const, main, quoted };
      } catch {
        return { kind: "html" as const, main: clean, quoted: "" };
      }
    }
    const plain = (text || "").trim();
    if (!plain) return { kind: "empty" as const, main: "", quoted: "" };
    if (!collapseQuotes) return { kind: "text" as const, main: plain, quoted: "" };
    const { main, quoted } = splitQuotedText(plain);
    return { kind: "text" as const, main, quoted };
  }, [html, text, collapseQuotes]);

  if (parsed.kind === "empty") return <span className="text-muted-foreground">(empty message)</span>;

  return (
    <div className="space-y-2">
      {parsed.kind === "html" ? <Html html={parsed.main} /> : <PlainText text={parsed.main} />}

      {parsed.quoted && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            title={showQuoted ? "Hide quoted text" : "Show quoted text"}
            aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-muted-foreground hover:bg-muted/70"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {showQuoted && (
            <div className="border-l-2 border-border pl-3 opacity-80">
              {parsed.kind === "html" ? <Html html={parsed.quoted} /> : <PlainText text={parsed.quoted} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
