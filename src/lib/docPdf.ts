/**
 * PDF rendering for HR Document Studio.
 *
 * Every issued letter is archived as a PDF so it can be read anywhere without
 * Word. The native (HTML) lane renders its print document directly; the locked
 * Word lane is converted to HTML with the high-fidelity DOCX reader first.
 */
import { buildPrintDocument, type PrintLetterhead } from "@/lib/docRender";

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
export async function htmlToPdfBlob(fullHtml: string): Promise<Blob> {
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

    let y = 0;
    let first = true;
    while (y < canvas.height - 2) {
      const sliceH = Math.min(pageSliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Could not render the PDF page");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.92),
        "JPEG",
        0,
        0,
        A4_W_MM,
        (sliceH * A4_W_MM) / canvas.width
      );
      y += pageSliceH;
    }

    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

/** Wrap a converted Word body in the universal letterhead's printable A4 safe area. */
export function wrapDocxHtml(
  body: string,
  title = "Letter",
  letterhead?: PrintLetterhead | null
): string {
  const wordBody = `<div style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.45;color:#000">${body}</div>`;
  return buildPrintDocument(wordBody, title, undefined, letterhead);
}

/** Convert merged Word bytes into a PDF blob (best-effort visual fidelity). */
export async function docxToPdfBlob(
  data: ArrayBuffer,
  title = "Letter",
  suppliedLetterhead?: PrintLetterhead | null
): Promise<Blob> {
  const { convertDocxToHtml } = await import("@/lib/docxImport");
  const letterhead = suppliedLetterhead ?? await (async () => {
    const { fetchCompanyIdentity, resolveLetterhead } = await import("@/lib/companyIdentity");
    return resolveLetterhead(await fetchCompanyIdentity());
  })();
  return htmlToPdfBlob(wrapDocxHtml(convertDocxToHtml(data), title, letterhead));
}
