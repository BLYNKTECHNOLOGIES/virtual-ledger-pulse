// Shared HR email branding + signature block.
// Every mail sent from the HR mailbox (hr@blynkex.com) must carry this signature.

export const HR_BRAND = {
  icon: "https://erp.blynkex.com/__l5e/assets-v1/ae377ace-4faa-43a4-930f-e3a7ae48a885/blynk-icon-transparent.png",
  blue: "#00AEEF",
  ink: "#0B1524",
  hrName: "Honey Sewani",
  hrTitle: "Human Resources",
  hrPhone: "+91 74707 56539",
  hrEmail: "hr.desk@blynkex.com",
  site: "www.blynkex.com",
  company: "Blynk Virtual Technologies Pvt. Ltd.",
  address: "Bhopal, 462021, India",
};

const B = HR_BRAND;

/** Branded header strip used at the top of HR emails. */
export function hrHeaderHtml(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding:16px 22px;border-bottom:2px solid ${B.blue};">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:10px;"><img src="${B.icon}" alt="Blynk" width="26" style="display:block;width:26px;height:auto;border:0;" /></td>
        <td valign="middle" style="font-size:14px;font-weight:800;letter-spacing:.06em;color:${B.ink};">BLYNK <span style="font-weight:500;">VIRTUAL TECHNOLOGIES</span></td>
      </tr></table>
    </td></tr></table>`;
}

/**
 * The canonical HR signature block (HTML).
 * @param refNote optional small footer line (e.g. "Automated notice · Ref XYZ")
 */
export function hrSignatureHtml(refNote?: string): string {
  return `<div style="margin-top:22px;padding-top:16px;border-top:1px solid #eef2f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="font-size:15px;font-weight:800;color:#5b62d6;line-height:1.2;">${B.hrName}</div>
    <div style="font-size:11.5px;font-weight:700;color:${B.ink};padding-bottom:4px;border-bottom:1.5px solid #5b62d6;">${B.hrTitle} &nbsp;|&nbsp; <a href="https://${B.site}" style="color:${B.ink};text-decoration:underline;">${B.site}</a></div>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-collapse:collapse;"><tr>
      <td valign="top" width="48" style="width:48px;padding:2px 12px 0 0;"><img src="${B.icon}" alt="Blynk" width="34" style="display:block;width:34px;height:auto;border:0;" /></td>
      <td valign="top"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:11px;color:#334155;line-height:1.45;">
        <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${B.ink};">M:</td><td valign="top" style="padding:0 0 2px 0;white-space:nowrap;">${B.hrPhone}</td></tr>
        <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${B.ink};">E:</td><td valign="top" style="padding:0 0 2px 0;"><a href="mailto:${B.hrEmail}" style="color:#334155;">${B.hrEmail}</a></td></tr>
        <tr><td valign="top" style="padding:0 6px 0 0;font-weight:700;color:${B.ink};">A:</td><td valign="top" style="padding:0;">${B.company}, ${B.address}</td></tr>
      </table></td>
    </tr></table>
    ${refNote ? `<div style="margin-top:10px;font-size:10px;color:#94a3b8;">${refNote}</div>` : ""}
  </div>`;
}

/** Plain-text variant of the signature. */
export function hrSignatureText(refNote?: string): string {
  return `--
${B.hrName} | ${B.hrTitle}
M: ${B.hrPhone} | E: ${B.hrEmail}
${B.company}, ${B.address}
${B.site}${refNote ? `\n${refNote}` : ""}`;
}

/** True when a body already contains the signature (avoid duplicates). */
export function hasHrSignature(html: string): boolean {
  return !!html && html.includes(B.hrName) && html.includes(B.hrEmail);
}

/**
 * Appends the signature to arbitrary HTML (used for free-form HR campaigns).
 * Inserts before </body> when present, otherwise appends.
 */
export function appendHrSignatureHtml(html: string, refNote?: string): string {
  if (hasHrSignature(html)) return html;
  const sig = hrSignatureHtml(refNote);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${sig}</body>`);
  return `${html}${sig}`;
}
