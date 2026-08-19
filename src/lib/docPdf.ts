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
      slice.height = Math.max(sliceH, pageSliceH); // Always a full page height for letterhead consistency
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
        A4_H_MM
      );
      y += pageSliceH;
    }

    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

/**
 * Render the merged Word file itself, including its native header, footer,
 * artwork, page geometry and fonts. No separate ERP letterhead is overlaid.
 */
export async function docxToPdfBlob(data: ArrayBuffer, title = "Letter"): Promise<Blob> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;background:#fff;`;
  document.body.appendChild(host);
  try {
    const { renderAsync } = await import("docx-preview");
    await renderAsync(data, host, host, {
      inWrapper: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: false,
      renderChanges: true,
      useBase64URL: true,
    });
    const safeTitle = title.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] || c));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
      <style>html,body{margin:0;padding:0;background:#fff}body{width:${A4_W_PX}px}</style>
      </head><body>${host.innerHTML}</body></html>`;
    return htmlToPdfBlob(html);
  } finally {
    host.remove();
  }
}
