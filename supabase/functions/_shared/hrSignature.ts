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
    <td class="gutter" style="padding:16px 24px;border-bottom:2px solid ${B.blue};">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:10px;"><img src="${B.icon}" alt="Blynk" width="26" style="display:block;width:26px;height:auto;border:0;" /></td>
        <td valign="middle" style="font-size:14px;font-weight:800;letter-spacing:.06em;color:${B.ink};line-height:1.3;">BLYNK <span style="font-weight:500;">VIRTUAL TECHNOLOGIES</span></td>
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
    <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="width:100%;margin-top:10px;border-collapse:collapse;"><tr>
      <td valign="top" width="48" style="width:48px;padding:2px 12px 0 0;"><img src="${B.icon}" alt="Blynk" width="34" style="display:block;width:34px;height:auto;border:0;" /></td>
      <td valign="top"><table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="width:100%;border-collapse:collapse;font-size:11px;color:#334155;line-height:1.45;">
        <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${B.ink};">M:</td><td valign="top" style="padding:0 0 2px 0;white-space:nowrap;">${B.hrPhone}</td></tr>
        <tr><td valign="top" style="padding:0 6px 2px 0;font-weight:700;color:${B.ink};">E:</td><td valign="top" style="padding:0 0 2px 0;"><a href="mailto:${B.hrEmail}" style="color:#334155;word-break:break-word;">${B.hrEmail}</a></td></tr>
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

/** Marker injected by wrapHrEmail so we never double-wrap a body. */
const WRAP_MARKER = "<!--hr-branded-shell-->";

function innerBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

/**
 * Canonical branded shell for EVERY mail sent from the HR mailbox.
 * Wraps arbitrary content HTML with the Blynk header strip, a white card,
 * the HR signature block and the legal footer. Idempotent.
 */
export function wrapHrEmail(
  contentHtml: string,
  opts: { title?: string; preheader?: string; refNote?: string; showSignature?: boolean } = {},
): string {
  if (!contentHtml) return contentHtml;
  if (contentHtml.includes(WRAP_MARKER)) return contentHtml;

  const content = innerBody(contentHtml);
  const sig = opts.showSignature === false ? "" : hrSignatureHtml(opts.refNote);
  const title = opts.title ? `<h1 class="h1" style="margin:0 0 16px;padding:0;font-size:19px;line-height:1.35;font-weight:800;color:${B.ink};text-align:left;">${opts.title}</h1>` : "";
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>`
    : "";

  return `${WRAP_MARKER}<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light only"/>
<style>
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  a{word-break:break-word;}
  @media only screen and (max-width:620px){
    .shell{width:100% !important;max-width:100% !important;border-radius:0 !important;border-left:0 !important;border-right:0 !important;}
    .outer{padding:0 !important;}
    .gutter{padding-left:16px !important;padding-right:16px !important;}
    .body-pad{padding:18px 16px 10px !important;}
    .foot-pad{padding:12px 16px !important;}
    .h1{font-size:17px !important;line-height:1.3 !important;}
    .fact-k{display:block !important;width:100% !important;padding:0 0 1px 0 !important;white-space:normal !important;}
    .fact-v{display:block !important;width:100% !important;padding:0 0 8px 0 !important;}
    .fact-row{display:block !important;width:100% !important;}
    .fact-tbl,.fact-tbl tbody{display:block !important;width:100% !important;}
  }
</style></head>
<body style="margin:0;padding:0;background:#f3f5f9;-webkit-text-size-adjust:100%;">
${pre}
<table width="100%" cellpadding="0" cellspacing="0" border="0" class="outer" style="background:#f3f5f9;padding:22px 0;">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" border="0" class="shell" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e6ebf2;border-radius:10px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1524;">
      <tr><td>${hrHeaderHtml()}</td></tr>
      <tr><td align="left" class="body-pad" style="padding:24px 24px 12px;font-size:14px;line-height:1.65;color:#1f2937;text-align:left;">${title}${content}${sig}</td></tr>
      <tr><td align="left" class="foot-pad" style="background:#f8fafc;border-top:1px solid #e6ebf2;padding:14px 24px;font-size:10.5px;line-height:1.55;color:#8a94a6;text-align:left;">This message was sent by the HR desk of ${B.company}, ${B.address}. It may contain confidential information intended only for the addressee - if you received it in error, please delete it and notify <a href="mailto:${B.hrEmail}" style="color:#8a94a6;">${B.hrEmail}</a>.</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
