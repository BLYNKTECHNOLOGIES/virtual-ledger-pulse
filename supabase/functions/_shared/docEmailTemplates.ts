// Per-document-type email templates for issued HR letters.
// Every template returns content HTML that is later wrapped by wrapHrEmail()
// (Blynk header strip + HR signature + legal footer).
//
// ALIGNMENT CONTRACT (keep this uniform across every template):
//  - all body copy is a single <p> built through p(): 14px / 1.65, left aligned,
//    12px bottom margin, no stray indentation or line breaks from the source file;
//  - facts are rendered as a 2-column label/value table (never <br/> lists), so
//    labels stay aligned regardless of value length or client font metrics;
//  - the sign-off line is always the last paragraph and never carries a trailing space.

export type DocEmailCtx = {
  employeeName: string;
  referenceNo: string;
  documentName: string;
  issuedDate: string; // already formatted, e.g. "19 Aug 2026"
  lastWorkingDate?: string | null;
  designation?: string | null;
  hrEmail?: string;
  category?: string | null;
};

export type DocEmailTemplate = { subject: string; html: string };

/** Collapse the indentation/newlines that template literals introduce. */
const squash = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();

const p = (s: string) =>
  `<p style="margin:0 0 12px;padding:0;font-size:14px;line-height:1.65;color:#1f2937;text-align:left;">${squash(s)}</p>`;

const HR = (c: DocEmailCtx) => c.hrEmail || "hr.desk@blynkex.com";

const mailLink = (c: DocEmailCtx) =>
  `<a href="mailto:${HR(c)}" style="color:#00AEEF;text-decoration:none;">${HR(c)}</a>`;

/** Shared fact table shown in every letter email — aligned label / value columns. */
function factTable(c: DocEmailCtx, extra: Array<[string, string | null | undefined]> = []) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Document", c.documentName],
    ["Reference No", c.referenceNo],
    ["Issued on", c.issuedDate],
    ...extra,
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  const body = rows
    .map(
      ([k, v], i) =>
        `<tr>` +
        `<td valign="top" style="padding:${i === 0 ? "0" : "6px"} 12px 0 0;font-size:12.5px;line-height:1.5;` +
        `font-weight:700;color:#0B1524;white-space:nowrap;">${k}</td>` +
        `<td valign="top" style="padding:${i === 0 ? "0" : "6px"} 0 0 0;font-size:12.5px;line-height:1.5;` +
        `color:#334155;">${v}</td>` +
        `</tr>`,
    )
    .join("");

  return (
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" ` +
    `style="width:100%;margin:0 0 16px;border-collapse:separate;background:#f8fafc;` +
    `border:1px solid #e6ebf2;border-radius:8px;">` +
    `<tr><td style="padding:14px 16px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${body}</table>` +
    `</td></tr></table>`
  );
}

/** Relieving cum Experience Letter */
function relievingCumExperience(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Relieving cum Experience Letter - ${c.employeeName}`,
    html: [
      p(`Dear ${c.employeeName},`),
      p(
        `Please find attached your <strong>Relieving cum Experience Letter</strong> issued by Blynk Virtual
         Technologies Pvt. Ltd.${c.lastWorkingDate ? ` Your last working day with us was <strong>${c.lastWorkingDate}</strong>.` : ""}`,
      ),
      factTable(c, [["Designation", c.designation]]),
      p(
        `This letter is an official record of your association with the organisation and may be shared with
         future employers or institutions for verification. Kindly retain a copy for your records.`,
      ),
      p(
        `We thank you for your contribution during your tenure with us and wish you continued success in your
         career ahead. Should you need any clarification on this document, please write to ${mailLink(c)}.`,
      ),
      p(`Warm regards,`),
    ].join(""),
  };
}

/** Appointment / Offer Letter */
function appointment(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Appointment Letter - ${c.employeeName}`,
    html: [
      p(`Dear ${c.employeeName},`),
      p(
        `Congratulations and welcome to <strong>Blynk Virtual Technologies Pvt. Ltd.</strong> Please find attached
         your <strong>Appointment Letter</strong>${c.designation ? ` for the position of <strong>${c.designation}</strong>` : ""}.`,
      ),
      factTable(c, [["Designation", c.designation]]),
      p(
        `Kindly review the terms of employment carefully. We request you to sign the acknowledgement copy and
         return it to the HR desk, along with any pending onboarding documents.`,
      ),
      p(`For any clarification on the terms mentioned in this letter, please write to ${mailLink(c)}.`),
      p(`We look forward to a long and rewarding association with you.`),
      p(`Warm regards,`),
    ].join(""),
  };
}

/** Appraisal / Increment Letter */
function appraisal(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Appraisal Letter - ${c.employeeName}`,
    html: [
      p(`Dear ${c.employeeName},`),
      p(
        `Please find attached your <strong>Appraisal Letter</strong>. This letter records the outcome of your
         performance review${c.designation ? ` in your role as <strong>${c.designation}</strong>` : ""}, including
         your revised compensation and effective date.`,
      ),
      factTable(c, [["Designation", c.designation]]),
      p(
        `The contents of this letter are strictly confidential and intended solely for you. Kindly retain a copy
         for your records and do not share it with colleagues or third parties.`,
      ),
      p(
        `We appreciate your contribution and the commitment you have shown. For any questions regarding this
         revision, please write to ${mailLink(c)}.`,
      ),
      p(`Warm regards,`),
    ].join(""),
  };
}

/** Warning / Disciplinary Letter */
function warning(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Important - Official Communication for ${c.employeeName}`,
    html: [
      p(`Dear ${c.employeeName},`),
      p(
        `Please find attached an official <strong>${c.documentName}</strong> issued by the HR department of
         Blynk Virtual Technologies Pvt. Ltd.`,
      ),
      factTable(c),
      p(
        `You are requested to read the attached letter carefully and respond within the timeline mentioned in it.
         A copy of this communication has been placed on your employment record.`,
      ),
      p(`If you wish to present your explanation or discuss this matter, please write to ${mailLink(c)} at the earliest.`),
      p(`Regards,`),
    ].join(""),
  };
}

/** Generic fallback for any other letter type. */
function generic(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `${c.documentName} - ${c.employeeName}`,
    html: [
      p(`Dear ${c.employeeName},`),
      p(`Please find attached your <strong>${c.documentName}</strong> issued by Blynk Virtual Technologies Pvt. Ltd.`),
      factTable(c),
      p(`Kindly retain a copy for your records. For any clarification, please write to ${mailLink(c)}.`),
      p(`Warm regards,`),
    ].join(""),
  };
}

/** Resolve a template by category first, then by document/template name. */
export function buildDocEmail(c: DocEmailCtx): DocEmailTemplate {
  const cat = (c.category || "").toLowerCase().trim();
  const n = (c.documentName || "").toLowerCase();

  if (cat === "relieving" || n.includes("reliev") || n.includes("experience")) return relievingCumExperience(c);
  if (cat === "appointment" || n.includes("appointment") || n.includes("offer letter")) return appointment(c);
  if (cat === "appraisal" || n.includes("appraisal") || n.includes("increment") || n.includes("promotion"))
    return appraisal(c);
  if (cat === "warning" || n.includes("warning") || n.includes("disciplinary") || n.includes("show cause"))
    return warning(c);
  return generic(c);
}
