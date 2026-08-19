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
};

export type DocEmailTemplate = { subject: string; html: string };

const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;

/** Relieving cum Experience Letter */
function relievingCumExperience(c: DocEmailCtx): DocEmailTemplate {
  const subject = `Relieving cum Experience Letter - ${c.employeeName}`;
  const html = `
${p(`Dear ${c.employeeName},`)}
${p(
  `Please find attached your <strong>Relieving cum Experience Letter</strong> issued by
   Blynk Virtual Technologies Pvt. Ltd.${c.lastWorkingDate ? ` Your last working day with us was <strong>${c.lastWorkingDate}</strong>.` : ""}`,
)}
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e6ebf2;border-radius:8px;">
  <tr><td style="padding:12px 14px;font-size:12.5px;color:#334155;line-height:1.7;">
    <strong style="color:#0B1524;">Document:</strong> ${c.documentName}<br/>
    <strong style="color:#0B1524;">Reference No:</strong> ${c.referenceNo}<br/>
    <strong style="color:#0B1524;">Issued on:</strong> ${c.issuedDate}
    ${c.designation ? `<br/><strong style="color:#0B1524;">Designation:</strong> ${c.designation}` : ""}
  </td></tr>
</table>
${p(
  `This letter is an official record of your association with the organisation and may be shared with
   future employers or institutions for verification. Kindly retain a copy for your records.`,
)}
${p(
  `We thank you for your contribution during your tenure with us and wish you continued success in your
   career ahead. Should you need any clarification on this document, please write to
   <a href="mailto:${c.hrEmail || "hr.desk@blynkex.com"}" style="color:#00AEEF;">${c.hrEmail || "hr.desk@blynkex.com"}</a>.`,
)}
${p(`Warm regards,`)}`;
  return { subject, html };
}

/** Generic fallback for any other letter type. */
function generic(c: DocEmailCtx): DocEmailTemplate {
  return {
    subject: `${c.documentName} - ${c.employeeName}`,
    html: `
${p(`Dear ${c.employeeName},`)}
${p(`Please find attached your <strong>${c.documentName}</strong> issued by Blynk Virtual Technologies Pvt. Ltd.`)}
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;background:#f8fafc;border:1px solid #e6ebf2;border-radius:8px;">
  <tr><td style="padding:12px 14px;font-size:12.5px;color:#334155;line-height:1.7;">
    <strong style="color:#0B1524;">Reference No:</strong> ${c.referenceNo}<br/>
    <strong style="color:#0B1524;">Issued on:</strong> ${c.issuedDate}
  </td></tr>
</table>
${p(`Kindly retain a copy for your records. For any clarification, please write to
   <a href="mailto:${c.hrEmail || "hr.desk@blynkex.com"}" style="color:#00AEEF;">${c.hrEmail || "hr.desk@blynkex.com"}</a>.`)}
${p(`Warm regards,`)}`,
  };
}

/** Resolve a template by document/template name. */
export function buildDocEmail(c: DocEmailCtx): DocEmailTemplate {
  const n = (c.documentName || "").toLowerCase();
  if (n.includes("reliev") || n.includes("experience")) return relievingCumExperience(c);
  return generic(c);
}
