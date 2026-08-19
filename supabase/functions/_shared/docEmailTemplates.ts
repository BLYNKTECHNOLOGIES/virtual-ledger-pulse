// Per-document-type email templates for issued HR letters.
// Every template returns content HTML that is later wrapped by wrapHrEmail()
// (Blynk header strip + HR signature + legal footer).

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

const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;

const HR = (c: DocEmailCtx) => c.hrEmail || "hr.desk@blynkex.com";

const mailLink = (c: DocEmailCtx) =>
  `<a href="mailto:${HR(c)}" style="color:#00AEEF;">${HR(c)}</a>`;

/** Shared fact table shown in every letter email. */
function factTable(c: DocEmailCtx, extra: Array<[string, string | null | undefined]> = []) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Document", c.documentName],
    ["Reference No", c.referenceNo],
    ["Issued on", c.issuedDate],
    ...extra,
  ];
  return `
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e6ebf2;border-radius:8px;">
  <tr><td style="padding:12px 14px;font-size:12.5px;color:#334155;line-height:1.7;">
    ${rows
      .filter(([, v]) => v)
      .map(([k, v]) => `<strong style="color:#0B1524;">${k}:</strong> ${v}`)
      .join("<br/>")}
  </td></tr>
</table>`;
}

/** Relieving cum Experience Letter */
function relievingCumExperience(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Relieving cum Experience Letter - ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(
  `Please find attached your <strong>Relieving cum Experience Letter</strong> issued by
   Blynk Virtual Technologies Pvt. Ltd.${c.lastWorkingDate ? ` Your last working day with us was <strong>${c.lastWorkingDate}</strong>.` : ""}`,
)}
${factTable(c, [["Designation", c.designation]])}
${p(
  `This letter is an official record of your association with the organisation and may be shared with
   future employers or institutions for verification. Kindly retain a copy for your records.`,
)}
${p(
  `We thank you for your contribution during your tenure with us and wish you continued success in your
   career ahead. Should you need any clarification on this document, please write to ${mailLink(c)}.`,
)}
${p(`Warm regards,`)}`,
  };
}

/** Appointment / Offer Letter */
function appointment(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Appointment Letter - ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(
  `Congratulations and welcome to <strong>Blynk Virtual Technologies Pvt. Ltd.</strong> Please find attached your
   <strong>Appointment Letter</strong>${c.designation ? ` for the position of <strong>${c.designation}</strong>` : ""}.`,
)}
${factTable(c, [["Designation", c.designation]])}
${p(
  `Kindly review the terms of employment carefully. We request you to sign the acknowledgement copy and
   return it to the HR desk, along with any pending onboarding documents.`,
)}
${p(`For any clarification on the terms mentioned in this letter, please write to ${mailLink(c)}.`)}
${p(`We look forward to a long and rewarding association with you.`)}
${p(`Warm regards,`)}`,
  };
}

/** Appraisal / Increment Letter */
function appraisal(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Appraisal Letter - ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(
  `Please find attached your <strong>Appraisal Letter</strong>. This letter records the outcome of your
   performance review${c.designation ? ` in your role as <strong>${c.designation}</strong>` : ""}, including your
   revised compensation and effective date.`,
)}
${factTable(c, [["Designation", c.designation]])}
${p(
  `The contents of this letter are strictly confidential and intended solely for you. Kindly retain a copy
   for your records and do not share it with colleagues or third parties.`,
)}
${p(
  `We appreciate your contribution and the commitment you have shown. For any questions regarding this
   revision, please write to ${mailLink(c)}.`,
)}
${p(`Warm regards,`)}`,
  };
}

/** Warning / Disciplinary Letter */
function warning(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `Important - Official Communication for ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(
  `Please find attached an official <strong>${c.documentName}</strong> issued by the HR department of
   Blynk Virtual Technologies Pvt. Ltd.`,
)}
${factTable(c)}
${p(
  `You are requested to read the attached letter carefully and respond within the timeline mentioned in it.
   A copy of this communication has been placed on your employment record.`,
)}
${p(
  `If you wish to present your explanation or discuss this matter, please write to ${mailLink(c)} at the earliest.`,
)}
${p(`Regards,`)}`,
  };
}

/** Generic fallback for any other letter type. */
function generic(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `${c.documentName} - ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(`Please find attached your <strong>${c.documentName}</strong> issued by Blynk Virtual Technologies Pvt. Ltd.`)}
${factTable(c)}
${p(`Kindly retain a copy for your records. For any clarification, please write to ${mailLink(c)}.`)}
${p(`Warm regards,`)}`,
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
