import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { applyLetterheadToDocx, dataUriToImage, docxHasOwnLetterhead, letterheadImage, sniffImageMime } from "./docxLetterhead";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function makeDocx(opts: { sectPr?: string; header?: string; settings?: string; extraBody?: string } = {}) {
  const sectPr =
    opts.sectPr ??
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2400" w:right="1200" w:bottom="1320" w:left="1200" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        (opts.header ? `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` : "") +
        `</Types>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>` +
        `<w:p><w:r><w:t>Dear {{CANDIDATE_NAME}},</w:t></w:r></w:p>${opts.extraBody || ""}${sectPr}</w:body></w:document>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        (opts.header ? `<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` : "") +
        `</Relationships>`,
    ),
  };
  if (opts.header) files["word/header1.xml"] = strToU8(opts.header);
  if (opts.settings) files["word/settings.xml"] = strToU8(opts.settings);
  return zipSync(files);
}

const read = (docx: Uint8Array) => {
  const files = unzipSync(docx);
  return (name: string) => (files[name] ? strFromU8(files[name]) : undefined);
};

describe("letterhead on a Word letter", () => {
  it("adds a full-page, behind-text letterhead header to a plain template", () => {
    const out = read(applyLetterheadToDocx(makeDocx(), { bytes: JPEG, mime: "image/jpeg" }, { top: 35, bottom: 30, left: 19, right: 19 }));
    const doc = out("word/document.xml")!;
    const ref = /<w:headerReference w:type="default" r:id="([^"]+)"\/>/.exec(doc);
    expect(ref).not.toBeNull();
    // Header reference must be the first child of sectPr.
    expect(doc).toMatch(/<w:sectPr><w:headerReference w:type="default"/);

    const rels = out("word/_rels/document.xml.rels")!;
    expect(rels).toContain(`Id="${ref![1]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"`);

    const header = out("word/header1.xml")!;
    expect(header).toContain('behindDoc="1"');
    expect(header).toContain('relativeFrom="page"');
    expect(header).toContain('<wp:extent cx="7560310" cy="10692130"/>');
    expect(out("word/_rels/header1.xml.rels")).toContain('Target="media/blynk_letterhead.jpeg"');
    expect(out("word/media/blynk_letterhead.jpeg")).toBeDefined();

    const types = out("[Content_Types].xml")!;
    expect(types).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
    expect(types).toContain('<Override PartName="/word/header1.xml"');

    // Margins: top/left/right already clear the letterhead; bottom is raised to 30 mm.
    const pgMar = /<w:pgMar\b[^>]*\/>/.exec(doc)![0];
    expect(pgMar).toContain('w:top="2400"');
    expect(pgMar).toContain('w:left="1200"');
    expect(pgMar).toContain('w:right="1200"');
    expect(pgMar).toContain('w:bottom="1701"');
    // The letter text itself is untouched.
    expect(doc).toContain("Dear {{CANDIDATE_NAME}},");
  });

  it("decorates an existing header instead of replacing it", () => {
    const header =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Page header text</w:t></w:r></w:p></w:hdr>`;
    const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rId9"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2000" w:right="1200" w:bottom="2000" w:left="1200"/></w:sectPr>`;
    const out = read(applyLetterheadToDocx(makeDocx({ header, sectPr }), { bytes: PNG, mime: "image/png" }));
    const hdr = out("word/header1.xml")!;
    expect(hdr).toContain("Page header text");
    expect(hdr).toContain('behindDoc="1"');
    expect(hdr).toMatch(/<w:hdr [^>]*xmlns:wp="/);
    expect(hdr).toMatch(/<w:hdr [^>]*xmlns:r="/);
    expect(out("word/_rels/header1.xml.rels")).toContain('Target="media/blynk_letterhead.png"');
    expect(out("word/header2.xml")).toBeUndefined();
    expect((out("word/document.xml")!.match(/<w:headerReference/g) || []).length).toBe(1);
  });

  it("covers a distinct first page and even pages when the template uses them", () => {
    const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2400" w:right="1200" w:bottom="1320" w:left="1200"/><w:titlePg/></w:sectPr>`;
    const settings = `<w:settings xmlns:w="${W}"><w:evenAndOddHeaders/></w:settings>`;
    const doc = read(applyLetterheadToDocx(makeDocx({ sectPr, settings }), { bytes: JPEG, mime: "image/jpeg" }))("word/document.xml")!;
    for (const type of ["default", "first", "even"]) expect(doc).toContain(`<w:headerReference w:type="${type}"`);
  });

  it("only gives the first section a new header — later sections inherit it", () => {
    const first = `<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2400" w:right="1200" w:bottom="1320" w:left="1200"/></w:sectPr></w:pPr></w:p>`;
    const margins = { top: 35, bottom: 30, left: 19, right: 19 };
    const doc = read(applyLetterheadToDocx(makeDocx({ extraBody: first }), { bytes: JPEG, mime: "image/jpeg" }, margins))("word/document.xml")!;
    expect((doc.match(/<w:headerReference/g) || []).length).toBe(1);
    // The reference lands in the first section (the paragraph-level sectPr).
    expect(doc.indexOf("<w:headerReference")).toBeLessThan(doc.indexOf("</w:pPr>"));
    // Both sections get the safe-area bottom margin.
    expect((doc.match(/w:bottom="1701"/g) || []).length).toBe(2);
  });

  it("detects templates that already print their own letterhead or page furniture", () => {
    expect(docxHasOwnLetterhead(makeDocx())).toBe(false);
    const withArt = applyLetterheadToDocx(makeDocx(), { bytes: JPEG, mime: "image/jpeg" });
    expect(docxHasOwnLetterhead(withArt)).toBe(true);
    const textHeader = `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Page 1</w:t></w:r></w:p></w:hdr>`;
    expect(docxHasOwnLetterhead(makeDocx({ header: textHeader }))).toBe(true);
    const emptyHeader = `<?xml version="1.0"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p></w:hdr>`;
    expect(docxHasOwnLetterhead(makeDocx({ header: emptyHeader }))).toBe(false);
    const bodyArt = `<w:p><w:r><w:drawing><wp:anchor xmlns:wp="x" behindDoc="1" simplePos="0"></wp:anchor></w:drawing></w:r></w:p>`;
    expect(docxHasOwnLetterhead(makeDocx({ extraBody: bodyArt }))).toBe(true);
  });

  it("explains a missing letterhead before anything is issued", async () => {
    await expect(letterheadImage({ imageDataUri: null, marginTopMm: 35, marginBottomMm: 30, marginLeftMm: 19, marginRightMm: 19 }))
      .rejects.toThrow(/letterhead image is not available/);
    const ok = await letterheadImage({ imageDataUri: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`, marginTopMm: 35, marginBottomMm: 30, marginLeftMm: 19, marginRightMm: 19 });
    expect(ok.mime).toBe("image/jpeg");
  });

  it("reads the letterhead from a data URI by its bytes, not its label", () => {
    const b64 = Buffer.from(PNG).toString("base64");
    expect(dataUriToImage(`data:application/octet-stream;base64,${b64}`)?.mime).toBe("image/png");
    expect(dataUriToImage(`data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`)?.mime).toBe("image/jpeg");
    expect(dataUriToImage("data:text/plain;base64,aGVsbG8=")).toBeNull();
    expect(dataUriToImage(null)).toBeNull();
    expect(sniffImageMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("refuses a file that is not a Word document", () => {
    const notDocx = zipSync({ "hello.txt": strToU8("hi") });
    expect(() => applyLetterheadToDocx(notDocx, { bytes: JPEG, mime: "image/jpeg" })).toThrow(/Not a Word document/);
  });
});
