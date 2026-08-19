import type { PrintLetterhead } from "@/lib/docRender";

/**
 * PDF rendering for HR Document Studio.
 *
 * Every issued letter is archived as a PDF so it can be read anywhere without
 * Word. The native (HTML) lane renders its print document directly; the locked
 * Word lane is converted to HTML with the high-fidelity DOCX reader first.
 */

const A4_W_PX = 794; // 210mm @ 96dpi
const A4_W_MM = 210;
const A4_H_MM = 297;

async function waitForImages(doc: Document) {
  const imgs = Array.from(doc.images);
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          })
    )
  );
}

/** Rasterise a complete HTML document into a paginated A4 PDF blob. */
export async function htmlToPdfBlob(fullHtml: string, letterhead?: PrintLetterhead | null): Promise<Blob> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;height:1123px;border:0;background:#fff;`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Could not prepare the PDF canvas");
    doc.open();
    doc.write(fullHtml);
    doc.close();

    await new Promise((r) => setTimeout(r, 250));
    await waitForImages(doc);
    try {
      await (doc as any).fonts?.ready;
    } catch {
      /* fonts API unavailable — proceed */
    }

    const body = doc.body;
    body.style.margin = "0";
    body.style.background = "#ffffff";
    const height = Math.max(body.scrollHeight, 1123);
    frame.style.height = `${height}px`;

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: A4_W_PX,
      windowWidth: A4_W_PX,
      height,
      windowHeight: height,
    });

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageSliceH = Math.floor((canvas.width * A4_H_MM) / A4_W_MM);

    // Pre-load letterhead image if present
    let lhImg: HTMLImageElement | null = null;
    if (letterhead?.imageDataUri) {
      lhImg = new Image();
      lhImg.src = letterhead.imageDataUri;
      await new Promise((res) => {
        if (!lhImg) return res(null);
        lhImg.onload = () => res(null);
        lhImg.onerror = () => res(null);
      });
    }

    let y = 0;
    let first = true;
    while (y < canvas.height - 2) {
      const sliceH = Math.min(pageSliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.max(sliceH, pageSliceH); // Always a full page height for letterhead consistency
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Could not render the PDF page");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);

      // Draw letterhead first if available
      if (lhImg) {
        ctx.drawImage(lhImg, 0, 0, slice.width, slice.height);
      }

      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.92),
        "JPEG",
        0,
        0,
        A4_W_MM,
        A4_H_MM
      );
      y += pageSliceH;
    }

    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

/** Wrap a converted Word body in a printable A4 sheet. */
export function wrapDocxHtml(body: string, title = "Letter"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  body { width:${A4_W_PX}px; padding:28px 60px 40px; box-sizing:border-box;
         font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size:11pt; color:#000; line-height:1.45; }
  p { margin:0 0 8px; }
  table { border-collapse: collapse; }
  img { max-width:100%; }
</style></head><body>${body}</body></html>`;
}

/** Convert merged Word bytes into a PDF blob (best-effort visual fidelity). */
export async function docxToPdfBlob(data: ArrayBuffer, title = "Letter", letterhead?: PrintLetterhead | null): Promise<Blob> {
  const { convertDocxToHtml } = await import("@/lib/docxImport");
  const { buildPrintDocument } = await import("@/lib/docRender");
  
  // When letterhead is present, use the high-fidelity print wrapper with Calibri font
  const html = letterhead 
    ? buildPrintDocument(convertDocxToHtml(data), title, undefined, letterhead, "Calibri, Carlito, 'Segoe UI', Arial, sans-serif")
    : wrapDocxHtml(convertDocxToHtml(data), title);

  return htmlToPdfBlob(html, letterhead);
}
