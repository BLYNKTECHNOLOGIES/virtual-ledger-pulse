type TextEdit = { value: string; start: number; end: number };
const marker = /^([ \t]*)(?:[•◦○*-]|\d+[.)])\s+/;

/** Read clipboard markup as an inert document; store only readable plain text. */
export function jobClipboardText(html: string): string | null {
  if (!html || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body.querySelector("p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,br,blockquote,pre")) return null;
  doc.body.querySelectorAll("script,style,template,noscript,iframe,object,[hidden],[aria-hidden='true']").forEach((el) => el.remove());
  const render = (node: Node, depth = 0): string => {
    if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "ul" || tag === "ol") {
      let number = Number(el.getAttribute("start")) || 1;
      const items = Array.from(el.children).filter((child) => child.tagName.toLowerCase() === "li");
      const list = items.map((item) => {
        const explicit = item.getAttribute("value");
        if (tag === "ol" && explicit && Number.isFinite(Number(explicit))) number = Number(explicit);
        const bullet = tag === "ol" ? `${number++}.` : depth ? "◦" : "•";
        let body = "";
        for (const child of Array.from(item.childNodes)) {
          const nested = child.nodeType === 1 && /^(UL|OL)$/.test((child as Element).tagName);
          body += render(child, nested ? depth + 1 : depth);
        }
        body = body.trim().replace(/\n{3,}/g, "\n\n");
        // Lists copied from some editors already contain their visible marker.
        body = body.replace(marker, "");
        return `${"  ".repeat(depth)}${bullet} ${body}`;
      }).join("\n");
      return depth ? `\n${list}\n` : `\n\n${list}\n\n`;
    }
    const content = Array.from(el.childNodes).map((child) => render(child, depth)).join("");
    if (tag === "pre") return `\n\n${el.textContent ?? ""}\n\n`;
    if (/^(p|div|h[1-6]|blockquote|section|article|header|tr)$/.test(tag)) return `\n\n${content.trim()}\n\n`;
    if (tag === "td" || tag === "th") return `${content}\t`;
    return content;
  };
  const text = Array.from(doc.body.childNodes).map((node) => render(node)).join("")
    .replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

/** Convert pasted points, not single paragraphs; never duplicate existing list markers. */
export function pasteJobList(value: string, start: number, end: number, pasted: string, html = ""): TextEdit | null {
  const richText = jobClipboardText(html);
  const normalized = (richText ?? pasted).replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const points = lines.map((line) => line.trim()).filter(Boolean);
  if (!richText && points.length < 2) return null;
  // Existing lists signal mixed structured copy: leave its headings and spacing alone.
  // Long paragraphs are prose, not a set of short unformatted responsibilities.
  const structured = richText !== null || points.some((line) => marker.test(line) || line.length > 180);
  let insertion = structured ? normalized : points.map((line) => `• ${line}`).join("\n");
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const prefix = value.slice(from, start);
  // An empty current list item already supplies the first pasted point's marker.
  if (/^[ \t]*(?:[•◦○*-]|\d+[.)])\s+$/.test(prefix)) insertion = insertion.replace(marker, "");
  const caret = start + insertion.length;
  return { value: value.slice(0, start) + insertion + value.slice(end), start: caret, end: caret };
}

/** Keep job copy plain text so the careers feed and existing consumers need no new contract. */
export function formatJobList(value: string, start: number, end: number, ordered: boolean): TextEdit {
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", last);
  const to = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(from, to).split("\n");
  const active = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[•◦○*-]\s+/;
  const remove = lines.every((line) => active.test(line));
  const replacement = lines.map((line, index) => {
    const plain = line.replace(marker, "$1");
    if (remove) return plain;
    const indent = plain.match(/^\s*/)?.[0] ?? "";
    return `${indent}${ordered ? `${index + 1}.` : "•"} ${plain.slice(indent.length)}`;
  }).join("\n");
  return { value: value.slice(0, from) + replacement + value.slice(to), start: from, end: from + replacement.length };
}

export function continueJobList(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const line = value.slice(from, start);
  const match = line.match(/^(\s*)([•◦○*-]|(\d+)[.)])\s+(.*)$/);
  if (!match) return null;
  if (!match[4].trim()) {
    return { value: value.slice(0, from) + match[1] + value.slice(start), start: from + match[1].length, end: from + match[1].length };
  }
  const insertion = `\n${match[1]}${match[3] ? `${Number(match[3]) + 1}.` : match[2]} `;
  const caret = start + insertion.length;
  return { value: value.slice(0, start) + insertion + value.slice(end), start: caret, end: caret };
}