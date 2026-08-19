import { unzipSync, strFromU8 } from "fflate";

/**
 * High-fidelity .docx -> HTML importer for the HR Document Studio.
 *
 * mammoth deliberately drops direct formatting (alignment, fonts, sizes,
 * tab stops), which is exactly what letter templates depend on — a Ref No.
 * on the left and the date on the right must survive the import. This
 * converter walks the raw WordprocessingML instead and preserves:
 *   - paragraph alignment, indents, spacing
 *   - tab stops (rendered as a borderless layout row so left/right text holds)
 *   - run formatting: bold / italic / underline / strike / size / colour / font
 *   - headings, bullet & numbered lists, tables, inline images
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) ?? el.getAttribute("w:" + name) ?? el.getAttribute(name);
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (localName(c) === name) return c;
  return null;
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => localName(c) === name);
}

function localName(el: Element): string {
  return el.localName || el.nodeName.replace(/^.*:/, "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const twipsToPt = (v: string | null) => (v ? Number(v) / 20 : 0);

interface Ctx {
  images: Record<string, string>; // rId -> data URI
}

function runStyle(rPr: Element | null): string {
  if (!rPr) return "";
  const css: string[] = [];
  const has = (n: string) => {
    const e = child(rPr, n);
    if (!e) return false;
    const v = attr(e, "val");
    return v !== "0" && v !== "false" && v !== "none";
  };
  if (has("b")) css.push("font-weight:bold");
  if (has("i")) css.push("font-style:italic");
  const decos: string[] = [];
  if (has("u")) decos.push("underline");
  if (has("strike")) decos.push("line-through");
  if (decos.length) css.push(`text-decoration:${decos.join(" ")}`);
  const sz = attr(child(rPr, "sz"), "val");
  if (sz) css.push(`font-size:${Number(sz) / 2}pt`);
  const color = attr(child(rPr, "color"), "val");
  if (color && /^[0-9a-f]{6}$/i.test(color)) css.push(`color:#${color}`);
  const fonts = child(rPr, "rFonts");
  const face = attr(fonts, "ascii") || attr(fonts, "hAnsi");
  if (face) css.push(`font-family:'${face}', serif`);
  const hl = attr(child(rPr, "highlight"), "val");
  if (hl && hl !== "none") css.push(`background-color:${hl}`);
  const va = attr(child(rPr, "vertAlign"), "val");
  if (va === "superscript") css.push("vertical-align:super;font-size:smaller");
  if (va === "subscript") css.push("vertical-align:sub;font-size:smaller");
  return css.join(";");
}

/** Render one run; returns HTML, or the marker "\u0001" for a tab. */
function renderRun(run: Element, ctx: Ctx): string {
  const rPr = child(run, "rPr");
  let inner = "";
  for (const node of Array.from(run.children)) {
    const n = localName(node);
    if (n === "t") inner += esc(node.textContent || "").replace(/ {2,}/g, (m) => "&nbsp;".repeat(m.length));
    else if (n === "tab") inner += "\u0001";
    else if (n === "br") inner += "<br />";
    else if (n === "noBreakHyphen") inner += "-";
    else if (n === "drawing" || n === "pict") inner += renderImage(node, ctx);
  }
  if (!inner) return "";
  const style = runStyle(rPr);
  return style ? `<span style="${style}">${inner}</span>` : inner;
}

function renderImage(node: Element, ctx: Ctx): string {
  const blips = node.getElementsByTagName("*");
  for (const el of Array.from(blips)) {
    if (localName(el) === "blip") {
      const rid =
        el.getAttribute("r:embed") ||
        el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
      const src = rid ? ctx.images[rid] : null;
      if (!src) continue;
      let width = "";
      for (const ext of Array.from(node.getElementsByTagName("*"))) {
        if (localName(ext) === "extent") {
          const cx = ext.getAttribute("cx");
          if (cx) width = `width:${(Number(cx) / 914400) * 96}px;`;
          break;
        }
      }
      return `<img src="${src}" style="${width}max-width:100%" alt="" />`;
    }
  }
  return "";
}

function paragraphStyle(pPr: Element | null): { css: string; tag: string; listLevel: number | null; numbered: boolean } {
  const css: string[] = [];
  let tag = "p";
  let listLevel: number | null = null;
  let numbered = false;
  if (pPr) {
    const styleId = (attr(child(pPr, "pStyle"), "val") || "").toLowerCase();
    const h = styleId.match(/^heading(\d)$/);
    if (h) tag = `h${Math.min(6, Number(h[1]))}`;
    if (/listparagraph/.test(styleId)) listLevel = 0;

    const jc = attr(child(pPr, "jc"), "val");
    if (jc) css.push(`text-align:${jc === "both" ? "justify" : jc === "start" ? "left" : jc === "end" ? "right" : jc}`);

    const ind = child(pPr, "ind");
    if (ind) {
      const left = twipsToPt(attr(ind, "left") || attr(ind, "start"));
      const right = twipsToPt(attr(ind, "right") || attr(ind, "end"));
      const first = twipsToPt(attr(ind, "firstLine"));
      const hang = twipsToPt(attr(ind, "hanging"));
      if (left) css.push(`margin-left:${left}pt`);
      if (right) css.push(`margin-right:${right}pt`);
      if (first) css.push(`text-indent:${first}pt`);
      if (hang) css.push(`text-indent:-${hang}pt`);
    }

    const spacing = child(pPr, "spacing");
    if (spacing) {
      const before = twipsToPt(attr(spacing, "before"));
      const after = twipsToPt(attr(spacing, "after"));
      css.push(`margin-top:${before}pt`, `margin-bottom:${after}pt`);
      const line = attr(spacing, "line");
      if (line && attr(spacing, "lineRule") !== "exact") css.push(`line-height:${Number(line) / 240}`);
    }

    const numPr = child(pPr, "numPr");
    if (numPr) {
      listLevel = Number(attr(child(numPr, "ilvl"), "val") || 0);
      numbered = false; // resolved by caller against numbering.xml when available
    }
  }
  return { css: css.join(";"), tag, listLevel, numbered };
}

/** Turn tab markers into a two/three column borderless row so alignment holds. */
function layoutTabs(inner: string, align: string): string {
  const parts = inner.split("\u0001").filter((p, i, a) => !(p === "" && i > 0 && i < a.length - 1));
  if (parts.length <= 1) return inner.replace(/\u0001/g, "");
  const aligns =
    parts.length === 2 ? ["left", "right"] : ["left", "center", ...Array(parts.length - 2).fill("right")];
  const cells = parts
    .map(
      (p, i) =>
        `<td style="border:0;padding:0;text-align:${aligns[i] || "left"};vertical-align:top">${p || "&nbsp;"}</td>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;border:0;table-layout:fixed"><tbody><tr>${cells}</tr></tbody></table>`;
}

function renderParagraph(p: Element, ctx: Ctx, numberedFallback = false): string {
  const pPr = child(p, "pPr");
  const { css, tag, listLevel } = paragraphStyle(pPr);
  let inner = "";
  for (const node of Array.from(p.children)) {
    const n = localName(node);
    if (n === "r") inner += renderRun(node, ctx);
    else if (n === "hyperlink") {
      const sub = children(node, "r").map((r) => renderRun(r, ctx)).join("");
      inner += sub;
    }
    else if (n === "ins") inner += children(node, "r").map((r) => renderRun(r, ctx)).join("");
  }
  const hasTab = inner.includes("\u0001");
  const body = hasTab ? layoutTabs(inner, "") : inner;
  const content = body || "<br />";

  if (listLevel !== null && child(pPr!, "numPr")) {
    const pad = 18 + listLevel * 18;
    return `<li style="${css};margin-left:${pad}pt" data-level="${listLevel}">${content}</li>`;
  }
  // A tab layout emits a table, which is not valid inside <p> — use a block div.
  const outerTag = hasTab && tag === "p" ? "div" : tag;
  return `<${outerTag} style="${css}">${content}</${outerTag}>`;
}

function renderTable(tbl: Element, ctx: Ctx): string {
  const rows = children(tbl, "tr")
    .map((tr) => {
      const cells = children(tr, "tc")
        .map((tc) => {
          const tcPr = child(tc, "tcPr");
          const w = attr(child(tcPr!, "tcW") || null, "w");
          const span = attr(child(tcPr!, "gridSpan") || null, "val");
          const shade = attr(child(tcPr!, "shd") || null, "fill");
          const style = [
            "border:1px solid #999",
            "padding:6px 8px",
            "vertical-align:top",
            w && Number(w) ? `width:${Number(w) / 20}pt` : "",
            shade && /^[0-9a-f]{6}$/i.test(shade) ? `background:#${shade}` : "",
          ]
            .filter(Boolean)
            .join(";");
          const inner = Array.from(tc.children)
            .map((c) =>
              localName(c) === "p" ? renderParagraph(c, ctx) : localName(c) === "tbl" ? renderTable(c, ctx) : ""
            )
            .join("");
          return `<td style="${style}"${span ? ` colspan="${span}"` : ""}>${inner || "<p></p>"}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0"><tbody>${rows}</tbody></table>`;
}

/** Group consecutive <li> siblings into real <ul> blocks. */
function wrapLists(html: string): string {
  return html.replace(/(?:<li[\s\S]*?<\/li>)+/g, (m) => `<ul style="margin:4px 0;padding-left:16pt">${m}</ul>`);
}

export function convertDocxToHtml(data: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(data));
  const docXml = files["word/document.xml"];
  if (!docXml) throw new Error("That file is not a valid .docx document.");

  // Map image relationships to inline data URIs so artwork survives the import.
  const ctx: Ctx = { images: {} };
  const relsRaw = files["word/_rels/document.xml.rels"];
  if (relsRaw) {
    const relsDoc = new DOMParser().parseFromString(strFromU8(relsRaw), "application/xml");
    for (const rel of Array.from(relsDoc.getElementsByTagName("Relationship"))) {
      const target = rel.getAttribute("Target") || "";
      if (!/image/i.test(rel.getAttribute("Type") || "")) continue;
      const path = "word/" + target.replace(/^\.\//, "").replace(/^\//, "");
      const bin = files[path];
      if (!bin) continue;
      const ext = (path.split(".").pop() || "png").toLowerCase();
      const mime = ext === "jpg" ? "image/jpeg" : ext === "emf" || ext === "wmf" ? "" : `image/${ext}`;
      if (!mime) continue;
      let binary = "";
      for (let i = 0; i < bin.length; i += 0x8000) {
        binary += String.fromCharCode(...bin.subarray(i, i + 0x8000));
      }
      ctx.images[rel.getAttribute("Id") || ""] = `data:${mime};base64,${btoa(binary)}`;
    }
  }

  const doc = new DOMParser().parseFromString(strFromU8(docXml), "application/xml");
  const bodyEl = doc.getElementsByTagName("*");
  let body: Element | null = null;
  for (const el of Array.from(bodyEl)) {
    if (localName(el) === "body") {
      body = el;
      break;
    }
  }
  if (!body) throw new Error("That document had no readable text.");

  let html = "";
  for (const node of Array.from(body.children)) {
    const n = localName(node);
    if (n === "p") html += renderParagraph(node, ctx);
    else if (n === "tbl") html += renderTable(node, ctx);
  }

  html = wrapLists(html);
  if (!html.replace(/<[^>]+>/g, "").trim() && !/<img/.test(html)) {
    throw new Error("That document had no readable text.");
  }
  return html;
}
