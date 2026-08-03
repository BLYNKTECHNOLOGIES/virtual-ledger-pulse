import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fixed recipient — this is a preview-only function, not a generic relay.
const RECIPIENT = 'shubham.singh@blynkex.com'

const PDF_B64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwODAzMjEwMzE3KzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwODAzMjEwMzE3KzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxOTIxCj4+CnN0cmVhbQpHYXUwRGhjJjhoJjpXZkdmWjFHPFdLSmY4PGhCa2JkKmVVOiIxY181JG5pcT5NNkRjLHE/TG06cWNoYVkvSF5oczNYNidJTmQoMGBcI1hGS0BSMElRUStzNElKRmEpW15MNGk6OUhKXWosJSxFcFVXRWg5MSdrQWk2OGA/LiNKdGteVyI4LmosWHRdWSkuPFBVK0xOSiI4S1RjOE0/WjhZQEdwLCMkK2UmbkkoTlg2IjdzXD4xdVswbW4yXTY0NiFvayc0cFJwNCwhQ2MiPHEsNyFcVlwpPVtqXUxaRSFbMTY/LFhpP1I3QVRWbGM1TzI8Ql9YR0BJYydGaEpONFZKXkFHLl1yTlBVLFpmSCpiJnQ1OVFJLVRsT3FeKHJiNy9GNXJOPW8vIVFJbmxIXC07LUZhUzBoKi91PjRCMzEqMi9UJSRJPVVFOisrJFQ4YUd1VSZoOCN1OzxmYmFmWVBEQE9ARi5BRlojTHEzZkZJPUVQYkYudVtnakkmcVssLmAsIVZaW3VKSjxdVGtyYC5kRCt0amY7Km5jMGwzL04pIyFgO1wvOSlQQS8iZloiMVhwanJNJTUzajc2TSxeQWQ5RWMjRFJWKCdyXDlqUnJENEldTEEzajY5IiVaNV49MyRYaWN0Yj5uMjJtJCcsXU1pQCI/XmheM2hMLU1YWGhaa1c8OmRFOFhCQW5cSmAqZiMkKmAhNnQ6Zz5BPllfSUVKVDJKTUQkS0ApPi4vYjgsUSo3JVwmaSZYUidRJjUqYmwjUCRRQCkidUVyaGhJVydxUio8Tz9DPkEsYDhAQUlQPks9Jik9VSNfVU5JQEVCSGdxNmR1UlQySkpFIiVPVDpUVnApLzguNWwuY25YJWlrcF5QcT5KUDQ/bmZxSz5tOztNZDBiZEhUJWQsVU83NF5CQDpCJShCMTNyaSUhPHNSIl9CTmVULCwkT1ExZzxDZGFRKl40O0szPDJScyI7JlNeX3BiLz03QnBLMGBeUDBHY0ckQ0oiO1NYNF47QDAzJEFPVWo+cFpfJGYpS0tOYERgNk45Uj9qaiM2IXNmW2FJbSNkO3MtNl43NGtsbTgpJHBHZyRmZyxBOl9mW2BvQm9mWjU+aDw5JVZobTJQbDFvVzB1KmloMzktcXMkKmNKXC04am5TISttSVFBO11LczZMOCphRmBhPmVAYC5iUnJdTCJnUGFWT05wQVxyQlpkblxpX0pWaihXa2NyWUVzLjYlVnJvWD1sQ0dYVj4nbGc2TF9HNSRYYFtULXMrSHFLOj9eXl1RX1MxVSlMY1MxclpeKiRbLS1CQVhnaXVnbiNrUUZhSWxPTyVxamw6a2pGZlZwPDdRQTBVN1kiS1RWb09oJjRxM01cSjhZN24pYU9BJzJaVE9rOi4pV2M3U1NjSGlRPUtCby0+cm9TY0Nna2w7U2ZASi1aak8mcEwmYDVrRCdBISRxbidfUSYoX0JbVCJIKkppUltqTiNpNG4yNFZxXj8yL25UL0V0PDYiMXVfLV1ELCRpKyRNKzhaYGlBLCwlQy1adG5sYDt0IWo3cVw2OzlrUG5ObjRcZ2ohXzJdUUhjKWQ6NUEpMiZRQGNRO1tbZCxicU4rUSpnL3JGbi45QFVsTGRyaCpDVUJANlRrXiRbQGdtOEpAWFo0bSVQJFchQV9KbD5nRkYtIy0hNS04LGFLXDZZQ2xcWVMkPVgrTTpDZUUmWStkKj4lam9JUl5cMT4/cm47cG1xU18hY0NXX141XU4pZlFIKFBaIWE/KjlYKTthZWJPTnVWSVBmbVJwM2tBRDFtP1A/aFksYmpyZTlQXUk4IXI5JWZpUjhVKFopLENIO0Q6OkwwIjhBKGdcTTs5Z0ZfbDlwLUpIVkgmQ1dFVk9kbyYlXmJFV3E9YW9wMEkqbi5TXmppR1tQOEJNXEEqXjtUVzNnNEFSVm0/NS5MaTxEbmBsNElYKFlmZnQhOSlQZ3Ncal5uXkIhciRrLTpMXXQwY0FIbW0uLCgoTE02U01kRmMzaGZXZiJKK1toJTU7Lyg4dU5qUz1bdGYzMEtVLFdGQmFIPGJkNEgkbDUra3QnL0E7W1QkJXI7YlJSXW1HQVhDKEd0KVZURVJZPT9bZVNBLU1eKVo4LV1fX2ViXyctRCRMXzhFXDlVbSNvLiYhJShMb1JWYCVobylQbFowZW0kJyk2QXVcP1tSQjohdFNLcGxVXzpJQ2BEMm1VQVZacSdtYTttISZyPSFudVtTTSglS2VGSF9xJmxOVUAwWWlvTmYoMXNDaytobltyKFksbSMwYEZnaFAvOWRTWjg3PTFpUGpkPDppWnVQVDJyWF9gNVNWKm1iU0ltSlcoL3RNPUdwaiVmdGE1YTouImZ0Z3IvbmUiNE9PMz81VkIyQjhPYVEsdWFFMUxpRS8kV2s0ZkcyPUBkSU8rYXJwIWFBIVtwczFJSFRqJSVRaWgjOiNVNlJxO0VqUm0lSVZiLCdEa0psX0ZTIlYmcVg9UDprWFQmWkNcS1gobTpVWSMrc2YlL0lLL29xXjIvNjEsZiw8QDpBdD4rVEdAJX4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDEwMiAwMDAwMCBuIAowMDAwMDAwMjA5IDAwMDAwIG4gCjAwMDAwMDAzMjEgMDAwMDAgbiAKMDAwMDAwMDUyNCAwMDAwMCBuIAowMDAwMDAwNTkyIDAwMDAwIG4gCjAwMDAwMDA4NTMgMDAwMDAgbiAKMDAwMDAwMDkxMiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzxlMzc5NGJhN2YyMDgyOTE2ZmU5Y2FhNDc2ZTczN2FmOD48ZTM3OTRiYTdmMjA4MjkxNmZlOWNhYTQ3NmU3MzdhZjg+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDYgMCBSCi9Sb290IDUgMCBSCi9TaXplIDkKPj4Kc3RhcnR4cmVmCjI5MjQKJSVFT0YK"

const HTML = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="background:#0f172a;padding:22px 26px;color:#ffffff;">
    <div style="font-size:19px;font-weight:700;">Your Payslip — July 2026</div>
    <div style="font-size:13px;opacity:.85;margin-top:4px;">Blynk Virtual Technologies Pvt. Ltd. · Payroll &amp; HR</div>
  </td></tr>
  <tr><td style="padding:26px;">
    <p style="margin:0 0 14px;font-size:15px;color:#111827;">Dear <strong>Rahul Sharma</strong>,</p>
    <p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">
      Your salary for <strong>July 2026</strong> has been processed and credited to your registered bank account
      (<strong>XXXXXX4821 · HDFC Bank</strong>) on <strong>05 Aug 2026</strong>. Your detailed payslip is attached to this email as a PDF.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;">
      <tr><td style="padding:9px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:600;width:52%;">Pay Period</td>
          <td style="padding:9px 12px;border:1px solid #e5e7eb;">01 Jul 2026 – 31 Jul 2026</td></tr>
      <tr><td style="padding:9px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:600;">Gross Earnings</td>
          <td style="padding:9px 12px;border:1px solid #e5e7eb;">INR 64,300.00</td></tr>
      <tr><td style="padding:9px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:600;">Total Deductions</td>
          <td style="padding:9px 12px;border:1px solid #e5e7eb;">INR 6,798.39</td></tr>
      <tr><td style="padding:9px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:700;color:#0f172a;">Net Pay Credited</td>
          <td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:700;color:#0f172a;">INR 57,501.61</td></tr>
    </table>

    <!-- LOP BLOCK: rendered only when LOP days > 0 -->
    <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:14px 16px;margin:0 0 18px;">
      <div style="font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;">Loss of Pay applied this month</div>
      <div style="font-size:14px;color:#78350f;line-height:1.6;">
        <strong>2.0 day(s)</strong> of Loss of Pay were recorded for July 2026, amounting to a deduction of
        <strong>INR 3,548.39</strong>. This is derived from your biometric attendance and approved leave records.
        If you believe this is incorrect, please write to HR within 7 days of receiving this payslip.
      </div>
    </div>

    <!-- BONUS BLOCK: rendered only when one or more bonus components exist; omitted entirely otherwise -->
    <div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:6px;padding:14px 16px;margin:0 0 18px;">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px;">🎉 Congratulations — a bonus has been added to your July salary!</div>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#14532d;">
        <tr><td style="padding:5px 0;">Performance Bonus</td><td align="right" style="padding:5px 0;font-weight:700;">INR 7,500.00</td></tr>
        <tr><td style="padding:5px 0;">Overtime Bonus</td><td align="right" style="padding:5px 0;font-weight:700;">INR 2,000.00</td></tr>
        <tr><td style="padding:7px 0;border-top:1px solid #bbf7d0;font-weight:700;">Total Bonus</td>
            <td align="right" style="padding:7px 0;border-top:1px solid #bbf7d0;font-weight:700;">INR 9,500.00</td></tr>
      </table>
      <div style="font-size:13px;color:#166534;margin-top:8px;line-height:1.6;">
        Thank you for the effort and ownership you have shown this month. Your contribution is genuinely valued by the team.
      </div>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
      Please keep the attached payslip for your records. For any clarification on earnings, deductions,
      statutory contributions (PF / ESIC / PT / TDS) or attendance, reply to this email or write to
      <a href="mailto:hr.desk@blynkex.com" style="color:#0f172a;">hr.desk@blynkex.com</a>.
    </p>
    <p style="margin:18px 0 0;font-size:14px;color:#111827;">Warm regards,<br/><strong>HR &amp; Payroll Team</strong><br/>Blynk Virtual Technologies Pvt. Ltd.</p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:14px 26px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
    This email and the attached payslip are confidential and intended solely for the named employee.
    Automated message from Blynk HRMS — please do not share with third parties.
  </td></tr>
</table></td></tr></table></body></html>
`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const smtpHost = Deno.env.get('HR_SMTP_HOST')
  const smtpUser = Deno.env.get('HR_SMTP_USER')
  const smtpPass = Deno.env.get('HR_SMTP_PASS')
  if (!smtpHost || !smtpUser || !smtpPass) {
    return new Response(JSON.stringify({ error: 'SMTP not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const client = new SMTPClient({
      connection: { hostname: smtpHost, port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
    })
    await client.send({
      from: `HR - Blynk Virtual Technologies <${smtpUser}>`,
      to: RECIPIENT,
      subject: '[SAMPLE] Your Payslip — July 2026 | Blynk Virtual Technologies',
      content: 'Please view this email in an HTML-compatible client.',
      html: HTML,
      attachments: [{
        filename: 'Payslip_July_2026_Rahul_Sharma_SAMPLE.pdf',
        content: PDF_B64,
        encoding: 'base64',
        contentType: 'application/pdf',
      }] as any,
    })
    await client.close()
    return new Response(JSON.stringify({ success: true, to: RECIPIENT }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('sample payslip send failed', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
