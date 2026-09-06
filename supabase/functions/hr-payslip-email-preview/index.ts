import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"
import { tidyMailHtml, tidyMailText } from "../_shared/mailBody.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fixed recipient — this is a preview-only function, not a generic relay.
const RECIPIENT = 'shubham.singh@blynkex.com'

const PDF_B64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUiAvRjMgNCAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YxIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMyAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMiAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EtT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjMgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNTk1LjI3NTYgODQxLjg4OTggXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL1BhZ2VNb2RlIC9Vc2VOb25lIC9QYWdlcyA4IDAgUiAvVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKNyAwIG9iago8PAovQXV0aG9yIChhbm9ueW1vdXMpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA4MDMyMTA3NTQrMDAnMDAnKSAvQ3JlYXRvciAoYW5vbnltb3VzKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA4MDMyMTA3NTQrMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAodW5zcGVjaWZpZWQpIC9UaXRsZSAodW50aXRsZWQpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOCAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDUgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDIxMjkKPj4Kc3RyZWFtCkdhdTBEPyQjIWIoNEdYWUU/QlApKGxdZyxfczAvXjo7VWZLJ0tCQ1E8SSZTOjhBIyphQ0o7PDwyKlpQbkNiUmFSJzRyI0Q8KVJdZWgvaSM5XElvIiU/YGEjXz42LnVfbkc+J0ZgWlxSZScxPioxIz04LUE7IUlqXiEyNS0mVU9ZJEUxZl1XI0k3ZUlYcCZuZ1hpdWo9LD5ZPjZaQzguLFpPQkddYHE/YVhMMDc6QWNeayZLJUowQjtRITIkUzwoPEhqRFQmUUNQLSwqN2NfQS5JNF0pK0RgKE9SNXNfTUBQIktMLCdNMzReJ2IlIl1wZV5QMm1aX0VSYyFfWiltcmxZXHBXYCJaZyZSbHE7TDtwVEQqNTUtPF1wZmZnbDQoTjdBQlRNcjpwQmgkOnFcM3NoUyhUZlwoNW1FTF5WS2Vrb2ZcMG9FJCU1NT1nV0oiWmAhdFlBMCs1QElmZjZIX186TVBcWThacFE7YylLQD8yMXJBIy88IzxePz0tTzQ3SUQjOj5CViUsaiQqMVtdXl1oQDdJQCw+VFYqVGtuXUpBJVIqbEE+JWRfblZRJlNmY3FqRztoWSE0IlFrTS40NDw2NzBwZE5WLjQlWiY9VnFNNmEqNDpzNWxlZ2pJSU44YEJPUWdLUzxpVkg7U0dQOEg1RmxqSCtTX1kjJlkvXU5ZVWA5MFQodEtCL1NtW0xmN2xfXzxMNiNwYCFkcj9dTDFbZCNPMS9nIzE8aVZMdEBIMl1SZDIoWkpCSEMlLk8mIkBkMHI3PHRDTSlbTG9IZmYibXVDXlhDRSdJPydqY0JAKHAzc2tBLkA8aDtWJ0xkLzBvRkJBUzhBSFJHREFeMVEpWkNRX0w0ZUkwYEtST08kOSxNVjE9bipHJFtMQnRLcmttKl8uNTcyPCo6NmNlLzstV2FMVWpZP2xOcF8kUyJvVjVPNEthPD5XJ0dnWnNoPz4wJnQvI1hvNz5MQWtKK0tbMU11RWklYSdKKStsYihbTC8lZkMxamFGPikwKSVTI2ElKGhLY29WcV5FaTlnW1olKzhWcVEoSmhuLyxBbWRARjkqRWVaPVxwZmBpMiExO3NdTFkzS3FWJGo5R1ZmNUImYGMrdG5ANVp0OjRXK0dDcUNlZkxMdHJxMkBzZll0Yk4mM2InWi1PXyNWIT9lRHBqOERqJG0hUidYQEJ1SmlwdG9PZVBfJ1B0PVwxTDc6MGEsSG5uL1xWKjBNIidNTidMTEhXTWNmcGoiUWA0VDg2Jk89PTxEVVVfKWE7PDhMNmA2JlAkY0A2KCYkcEEtS1ooamFkX04vbGMmV0MubTBIP2UpSkxFVUguLjBhLTJKJkZMUnM1LmRCR2tCYi1jZEpPOkxlYmtsVEYkNFAqM2cpR3EiOVxRbTA4aWM+Qy9LPUlAX2RMW0syTnJlUWAqcjteSlkzRSRydWpVb19DX0JDYlIoT2F0XzMvJSJLXDMlQDoxalFAME5vWXQ7Im0ySnI1MSpLWTNmOj9cJ3JfTiZdNGxaKFteLnFzU2UmLUA9RVZoUE4hWFlNSlIkcmokJE1bW3BkSzgzZmNuQkloJCltaTl0JE9QXENNSl5OYmc5aWZKIy9URlpJT1ZmSVcoYkItT0ZcajtuKCRpVFpBL05zPFFHcF1jKCpwQzFRJi8lc2FgZj89MnQ7LjdlVSZnRSwnLTstOVdKayZyVi1WcFgiSEFYRUMhNnBkJEZNJ09YT2RGNktiVGMkXVQvLC5cU29Cc21yUUU/QjdpYTNlZ1E3QUNkIXQ4aTFYJDAhJk5GTkclblUia0JGX1tZKDdHP1VcbVVLJ29IZypANSg6MT5qcDQuUVhkQTpRWzEqPiJSZy5yVi47Tmg9M3JYaiFXSWVAKyU2UnFpY0cxaF9obUx0OFoxXSRrPVs/YitEQFM1YEVlLU1aZlphV0hKKFZyXmtpXHA5Kz0pU3BPMmJBWz1yY2cyJmJdImNgXWNPKFlIbl5nMVI0S25zLUJNQ15vamdNR0hSWHU2cDZROjEjIltKZkNTM0tvM2snRXBAKCtAaThlRCVMZFhyYmhGVzBWTllmNG00MFNVWkpmTDplLkVLNlQ/Om1JNCQ0UmpZZGlAdGxEcyxtLjQqTWEyUnNmQisoW09bWjNuaDVkby9XXWBPOEhrPlM6cEZUNy5ndSlpKStMWkIpOzlEW1lATlBLUi09RExPKkBUVlpqRzkmOyVOTGtZNlsuKzpSLD1NJUlYbFdrKyJnZG1fNm9kUWtCcSZcMmdoLW5RUnRuQT1bamUmI1pgJ3Fkbj88cDpCUitccHJjUmEhY3VpJlkzKlk7IUA7Mk0oPzhOclRiYWBjXzJnaT4wRC1cR287VFw7L1EuLWJlakUpRmxOUidMcDQ4YCZYXE0+dGxoPigmLnJVIm8uajE5K1lfIkM7JW0+ZTA3T2VuMydOSjJVQ2xvJ11sbCJrL0IxQCEoPy0xLk4/KzFaazs8QG0qJjwsUy88RSFbXW1jbz9KQCMra04hamlSTTNcQC42alpzQS1hQUZVWWlRQm1HaF0lRjViJUQhQ2lMMzUwRnNvQjt1ZEE4anJHOjhUVTc4SCtrWWZmXEQkJEI4aCxccjcpaShcISxdIUoha0FNMEUjMlUoK0ozbm1oLFtYcWV0UXU2ZGY1dDxgME5AXENvRXNGMV9QT05xUGNbSVhBQVddO1wxVjg3Sm9hZiowXU1DLFo9SmJsMmYqLEZmI3RuUF4oXmdXWjhZMm9ALS1kUFcrPDQ9TkMySipwSlNkdHAwOTRFQFNaKS1yV1doQmxPXmpfR1VYLFswLm9dLE0xRDdjO2JxIShqcygrb34+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAxMTIgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAowMDAwMDAwMzMxIDAwMDAwIG4gCjAwMDAwMDA0NDYgMDAwMDAgbiAKMDAwMDAwMDY0OSAwMDAwMCBuIAowMDAwMDAwNzE3IDAwMDAwIG4gCjAwMDAwMDA5NzggMDAwMDAgbiAKMDAwMDAwMTAzNyAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw2NjgzOGZjYmI4Y2FjMDk5NDU2NTEwNTQ0MTJhZmQzZD48NjY4MzhmY2JiOGNhYzA5OTQ1NjUxMDU0NDEyYWZkM2Q+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDcgMCBSCi9Sb290IDYgMCBSCi9TaXplIDEwCj4+CnN0YXJ0eHJlZgozMjU3CiUlRU9GCg=="

import { wrapHrEmail } from "../_shared/hrSignature.ts"

const CONTENT = `
    <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#f1f5f9;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:10px;line-height:1.2;text-transform:uppercase;font-weight:700;color:#64748b;">Pay period &nbsp;01 Jul 2026 &ndash; 31 Jul 2026</div>

    <p style="margin:24px 0 12px;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:17px;line-height:1.45;font-weight:600;color:#0f172a;">Dear <strong style="color:#0284c7;">Aarav Mehta</strong>,</p>
    <p style="margin:0 0 26px;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:14px;color:#526176;line-height:1.75;">
      Your salary for <strong style="color:#0f172a;font-weight:700;">July 2026</strong> has been credited to your bank account <strong style="color:#0f172a;font-weight:700;">XXXXXX7734 &middot; ICICI Bank</strong> on <strong style="color:#0f172a;font-weight:700;">05 Aug 2026</strong>. Payslip attached.
    </p>

    <!-- NET PAY HERO -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:separate;background:#0B1524;border-radius:12px;margin:0 0 26px;">
      <tr><td style="padding:24px;">
        <div style="font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:10px;line-height:1.3;color:#7dd3fc;text-transform:uppercase;font-weight:700;">Net pay credited</div>
        <div style="margin-top:9px;font-family:Aptos,'Segoe UI',Arial,sans-serif;color:#ffffff;white-space:nowrap;"><span style="font-size:17px;font-weight:500;color:#94a3b8;vertical-align:baseline;">INR</span>&nbsp;&nbsp;<span style="font-size:30px;line-height:1.15;font-weight:800;font-variant-numeric:tabular-nums;vertical-align:baseline;">61,248.00</span></div>
      </td></tr>
    </table>

    <!-- SUMMARY -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:14px;border:1px solid #e8edf3;border-radius:10px;overflow:hidden;margin:0 0 26px;">
      <tr>
        <td style="padding:15px 16px;color:#64748b;font-weight:500;border-bottom:1px solid #e8edf3;">Gross earnings</td>
        <td align="right" style="padding:15px 16px;color:#0f172a;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;border-bottom:1px solid #e8edf3;">INR 72,000.00</td>
      </tr>
      <tr>
        <td style="padding:15px 16px;color:#64748b;font-weight:500;border-bottom:1px solid #e8edf3;">Total deductions</td>
        <td align="right" style="padding:15px 16px;color:#be123c;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;border-bottom:1px solid #e8edf3;">&minus;&nbsp;INR 7,252.00</td>
      </tr>
      <tr>
        <td style="padding:15px 16px;color:#64748b;font-weight:500;">Paid days</td>
        <td align="right" style="padding:15px 16px;color:#0f172a;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">29.5 / 31.0</td>
      </tr>
    </table>

    <!-- LOP BLOCK: rendered only when LOP days > 0 -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="width:4px;background:#f59e0b;border-radius:4px 0 0 4px;"></td>
        <td style="background:#fffbeb;padding:16px 18px;border:1px solid #fde68a;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#b45309;">Loss of pay</div>
          <div style="font-size:15px;font-weight:700;color:#78350f;margin-top:6px;">1.5 day(s) &middot; INR 3,483.87</div>
          <div style="font-size:13.5px;color:#92400e;line-height:1.6;margin-top:6px;">
            As per attendance and approved leave for July 2026.
          </div>
        </td>
      </tr>
    </table>

    <!-- BONUS BLOCK: rendered only when one or more bonus components exist; omitted entirely otherwise -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="width:4px;background:#16a34a;border-radius:4px 0 0 4px;"></td>
        <td style="background:#f0fdf4;padding:18px;border:1px solid #bbf7d0;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#15803d;">Congratulations</div>
          <div style="font-size:15px;font-weight:700;color:#14532d;margin-top:6px;">Bonus added to your July salary</div>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#166534;margin-top:12px;">
            <tr><td style="padding:6px 0;">Performance bonus</td><td align="right" style="padding:6px 0;font-weight:600;">INR 6,000.00</td></tr>
            <tr><td style="padding:6px 0;">Overtime bonus</td><td align="right" style="padding:6px 0;font-weight:600;">INR 2,500.00</td></tr>
            <tr>
              <td style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">Total bonus</td>
              <td align="right" style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">INR 8,500.00</td>
            </tr>
          </table>
          <div style="font-size:13.5px;color:#166534;line-height:1.6;margin-top:12px;">
            Thank you for your contribution this month.
          </div>
        </td>
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="width:4px;background:#0284c7;border-radius:4px 0 0 4px;"></td>
        <td style="background:#f0f9ff;padding:18px;border:1px solid #bae6fd;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#0369a1;">Other additions</div>
          <div style="font-size:15px;font-weight:700;color:#0c4a6e;margin-top:6px;">Included in this month&#39;s pay</div>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#075985;margin-top:12px;">
            <tr><td style="padding:6px 0;">Comp-off encashment (2 days)</td><td align="right" style="padding:6px 0;font-weight:600;">INR 4,645.16</td></tr>
            <tr><td style="padding:6px 0;">Travel reimbursement</td><td align="right" style="padding:6px 0;font-weight:600;">INR 1,850.00</td></tr>
            <tr>
              <td style="padding:10px 0 0;border-top:1px solid #bae6fd;font-weight:700;color:#0c4a6e;">Total other additions</td>
              <td align="right" style="padding:10px 0 0;border-top:1px solid #bae6fd;font-weight:700;color:#0c4a6e;">INR 6,495.16</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13.5px;color:#64748b;line-height:1.65;">
      The attached payslip carries the full break-up, including PF / ESIC / PT / TDS.
    </p>

    `

const HTML = wrapHrEmail(CONTENT, { title: "Payslip &mdash; July 2026", preheader: "Your July 2026 payslip and net pay summary", refNote: "Payslip notice &middot; 2026-07 (sample)" })


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const smtpHost = (Deno.env.get('HR_GMAIL_HOST') || Deno.env.get('HR_SMTP_HOST') || '').trim()
  const smtpUser = (Deno.env.get('HR_GMAIL_USER') || Deno.env.get('HR_SMTP_USER') || '').trim()
  const smtpPass = (Deno.env.get('HR_GMAIL_APP_PASSWORD') || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '')
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
      html: tidyMailHtml(HTML),
      attachments: [{
        filename: 'Payslip_July_2026_Aarav_Mehta_SAMPLE.pdf',
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
