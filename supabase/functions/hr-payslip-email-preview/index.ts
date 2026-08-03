import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fixed recipient — this is a preview-only function, not a generic relay.
const RECIPIENT = 'shubham.singh@blynkex.com'

const PDF_B64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUiAvRjMgNCAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YxIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKMyAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMiAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0Jhc2VGb250IC9IZWx2ZXRpY2EtT2JsaXF1ZSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjMgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNTk1LjI3NTYgODQxLjg4OTggXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL1BhZ2VNb2RlIC9Vc2VOb25lIC9QYWdlcyA4IDAgUiAvVHlwZSAvQ2F0YWxvZwo+PgplbmRvYmoKNyAwIG9iago8PAovQXV0aG9yIChhbm9ueW1vdXMpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA4MDMyMTA3NTQrMDAnMDAnKSAvQ3JlYXRvciAoYW5vbnltb3VzKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA4MDMyMTA3NTQrMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAodW5zcGVjaWZpZWQpIC9UaXRsZSAodW50aXRsZWQpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOCAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDUgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDIxMjkKPj4Kc3RyZWFtCkdhdTBEPyQjIWIoNEdYWUU/QlApKGxdZyxfczAvXjo7VWZLJ0tCQ1E8SSZTOjhBIyphQ0o7PDwyKlpQbkNiUmFSJzRyI0Q8KVJdZWgvaSM5XElvIiU/YGEjXz42LnVfbkc+J0ZgWlxSZScxPioxIz04LUE7IUlqXiEyNS0mVU9ZJEUxZl1XI0k3ZUlYcCZuZ1hpdWo9LD5ZPjZaQzguLFpPQkddYHE/YVhMMDc6QWNeayZLJUowQjtRITIkUzwoPEhqRFQmUUNQLSwqN2NfQS5JNF0pK0RgKE9SNXNfTUBQIktMLCdNMzReJ2IlIl1wZV5QMm1aX0VSYyFfWiltcmxZXHBXYCJaZyZSbHE7TDtwVEQqNTUtPF1wZmZnbDQoTjdBQlRNcjpwQmgkOnFcM3NoUyhUZlwoNW1FTF5WS2Vrb2ZcMG9FJCU1NT1nV0oiWmAhdFlBMCs1QElmZjZIX186TVBcWThacFE7YylLQD8yMXJBIy88IzxePz0tTzQ3SUQjOj5CViUsaiQqMVtdXl1oQDdJQCw+VFYqVGtuXUpBJVIqbEE+JWRfblZRJlNmY3FqRztoWSE0IlFrTS40NDw2NzBwZE5WLjQlWiY9VnFNNmEqNDpzNWxlZ2pJSU44YEJPUWdLUzxpVkg7U0dQOEg1RmxqSCtTX1kjJlkvXU5ZVWA5MFQodEtCL1NtW0xmN2xfXzxMNiNwYCFkcj9dTDFbZCNPMS9nIzE8aVZMdEBIMl1SZDIoWkpCSEMlLk8mIkBkMHI3PHRDTSlbTG9IZmYibXVDXlhDRSdJPydqY0JAKHAzc2tBLkA8aDtWJ0xkLzBvRkJBUzhBSFJHREFeMVEpWkNRX0w0ZUkwYEtST08kOSxNVjE9bipHJFtMQnRLcmttKl8uNTcyPCo6NmNlLzstV2FMVWpZP2xOcF8kUyJvVjVPNEthPD5XJ0dnWnNoPz4wJnQvI1hvNz5MQWtKK0tbMU11RWklYSdKKStsYihbTC8lZkMxamFGPikwKSVTI2ElKGhLY29WcV5FaTlnW1olKzhWcVEoSmhuLyxBbWRARjkqRWVaPVxwZmBpMiExO3NdTFkzS3FWJGo5R1ZmNUImYGMrdG5ANVp0OjRXK0dDcUNlZkxMdHJxMkBzZll0Yk4mM2InWi1PXyNWIT9lRHBqOERqJG0hUidYQEJ1SmlwdG9PZVBfJ1B0PVwxTDc6MGEsSG5uL1xWKjBNIidNTidMTEhXTWNmcGoiUWA0VDg2Jk89PTxEVVVfKWE7PDhMNmA2JlAkY0A2KCYkcEEtS1ooamFkX04vbGMmV0MubTBIP2UpSkxFVUguLjBhLTJKJkZMUnM1LmRCR2tCYi1jZEpPOkxlYmtsVEYkNFAqM2cpR3EiOVxRbTA4aWM+Qy9LPUlAX2RMW0syTnJlUWAqcjteSlkzRSRydWpVb19DX0JDYlIoT2F0XzMvJSJLXDMlQDoxalFAME5vWXQ7Im0ySnI1MSpLWTNmOj9cJ3JfTiZdNGxaKFteLnFzU2UmLUA9RVZoUE4hWFlNSlIkcmokJE1bW3BkSzgzZmNuQkloJCltaTl0JE9QXENNSl5OYmc5aWZKIy9URlpJT1ZmSVcoYkItT0ZcajtuKCRpVFpBL05zPFFHcF1jKCpwQzFRJi8lc2FgZj89MnQ7LjdlVSZnRSwnLTstOVdKayZyVi1WcFgiSEFYRUMhNnBkJEZNJ09YT2RGNktiVGMkXVQvLC5cU29Cc21yUUU/QjdpYTNlZ1E3QUNkIXQ4aTFYJDAhJk5GTkclblUia0JGX1tZKDdHP1VcbVVLJ29IZypANSg6MT5qcDQuUVhkQTpRWzEqPiJSZy5yVi47Tmg9M3JYaiFXSWVAKyU2UnFpY0cxaF9obUx0OFoxXSRrPVs/YitEQFM1YEVlLU1aZlphV0hKKFZyXmtpXHA5Kz0pU3BPMmJBWz1yY2cyJmJdImNgXWNPKFlIbl5nMVI0S25zLUJNQ15vamdNR0hSWHU2cDZROjEjIltKZkNTM0tvM2snRXBAKCtAaThlRCVMZFhyYmhGVzBWTllmNG00MFNVWkpmTDplLkVLNlQ/Om1JNCQ0UmpZZGlAdGxEcyxtLjQqTWEyUnNmQisoW09bWjNuaDVkby9XXWBPOEhrPlM6cEZUNy5ndSlpKStMWkIpOzlEW1lATlBLUi09RExPKkBUVlpqRzkmOyVOTGtZNlsuKzpSLD1NJUlYbFdrKyJnZG1fNm9kUWtCcSZcMmdoLW5RUnRuQT1bamUmI1pgJ3Fkbj88cDpCUitccHJjUmEhY3VpJlkzKlk7IUA7Mk0oPzhOclRiYWBjXzJnaT4wRC1cR287VFw7L1EuLWJlakUpRmxOUidMcDQ4YCZYXE0+dGxoPigmLnJVIm8uajE5K1lfIkM7JW0+ZTA3T2VuMydOSjJVQ2xvJ11sbCJrL0IxQCEoPy0xLk4/KzFaazs8QG0qJjwsUy88RSFbXW1jbz9KQCMra04hamlSTTNcQC42alpzQS1hQUZVWWlRQm1HaF0lRjViJUQhQ2lMMzUwRnNvQjt1ZEE4anJHOjhUVTc4SCtrWWZmXEQkJEI4aCxccjcpaShcISxdIUoha0FNMEUjMlUoK0ozbm1oLFtYcWV0UXU2ZGY1dDxgME5AXENvRXNGMV9QT05xUGNbSVhBQVddO1wxVjg3Sm9hZiowXU1DLFo9SmJsMmYqLEZmI3RuUF4oXmdXWjhZMm9ALS1kUFcrPDQ9TkMySipwSlNkdHAwOTRFQFNaKS1yV1doQmxPXmpfR1VYLFswLm9dLE0xRDdjO2JxIShqcygrb34+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMTAKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAxMTIgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAowMDAwMDAwMzMxIDAwMDAwIG4gCjAwMDAwMDA0NDYgMDAwMDAgbiAKMDAwMDAwMDY0OSAwMDAwMCBuIAowMDAwMDAwNzE3IDAwMDAwIG4gCjAwMDAwMDA5NzggMDAwMDAgbiAKMDAwMDAwMTAzNyAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw2NjgzOGZjYmI4Y2FjMDk5NDU2NTEwNTQ0MTJhZmQzZD48NjY4MzhmY2JiOGNhYzA5OTQ1NjUxMDU0NDEyYWZkM2Q+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDcgMCBSCi9Sb290IDYgMCBSCi9TaXplIDEwCj4+CnN0YXJ0eHJlZgozMjU3CiUlRU9GCg=="

const HTML = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#eef1f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 12px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(15,23,42,.08);">

  <tr><td style="background:#0f172a;padding:28px 32px;">
    <div style="font-size:11px;letter-spacing:2.4px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Blynk Virtual Technologies Pvt. Ltd.</div>
    <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:8px;letter-spacing:-.3px;">Payslip &mdash; July 2026</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:6px;">Pay period 01 Jul 2026 &ndash; 31 Jul 2026</div>
  </td></tr>

  <tr><td style="padding:30px 32px 0;">
    <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">Dear <strong>Rahul Sharma</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.65;">
      Your salary for <strong style="color:#0f172a;">July 2026</strong> has been processed and credited to your registered
      bank account <strong style="color:#0f172a;">XXXXXX4821 &middot; HDFC Bank</strong> on <strong style="color:#0f172a;">05 Aug 2026</strong>.
      A detailed payslip is attached to this email.
    </p>

    <!-- NET PAY HERO -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:#0f172a;border-radius:10px;margin:0 0 22px;">
      <tr><td style="padding:20px 24px;">
        <div style="font-size:11px;letter-spacing:1.6px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Net pay credited</div>
        <div style="font-size:30px;font-weight:700;color:#ffffff;margin-top:6px;letter-spacing:-.5px;">INR 57,501.61</div>
      </td></tr>
    </table>

    <!-- SUMMARY -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 24px;">
      <tr>
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">Gross earnings</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">INR 64,300.00</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">Total deductions</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">INR 6,798.39</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;">Paid days</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;">29.0 of 31.0</td>
      </tr>
    </table>

    <!-- LOP BLOCK: rendered only when LOP days > 0 -->
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="width:4px;background:#f59e0b;border-radius:4px 0 0 4px;"></td>
        <td style="background:#fffbeb;padding:16px 18px;border:1px solid #fde68a;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#b45309;">Loss of pay</div>
          <div style="font-size:15px;font-weight:700;color:#78350f;margin-top:6px;">2.0 day(s) &middot; INR 3,548.39</div>
          <div style="font-size:13.5px;color:#92400e;line-height:1.6;margin-top:6px;">
            Recorded for July 2026 as per biometric attendance and approved leave records for the pay period.
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
          <div style="font-size:15px;font-weight:700;color:#14532d;margin-top:6px;">A bonus has been added to your July salary</div>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#166534;margin-top:12px;">
            <tr><td style="padding:6px 0;">Performance bonus</td><td align="right" style="padding:6px 0;font-weight:600;">INR 7,500.00</td></tr>
            <tr><td style="padding:6px 0;">Overtime bonus</td><td align="right" style="padding:6px 0;font-weight:600;">INR 2,000.00</td></tr>
            <tr>
              <td style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">Total bonus</td>
              <td align="right" style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">INR 9,500.00</td>
            </tr>
          </table>
          <div style="font-size:13.5px;color:#166534;line-height:1.6;margin-top:12px;">
            Thank you for the effort and ownership you have shown this month. Your contribution is genuinely valued by the team.
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13.5px;color:#64748b;line-height:1.65;">
      Please retain the attached payslip for your records. It contains the complete break-up of your earnings,
      deductions and statutory contributions (PF / ESIC / PT / TDS).
    </p>

    <p style="margin:26px 0 30px;font-size:14px;color:#0f172a;line-height:1.6;">
      Warm regards,<br/>
      <strong>HR &amp; Payroll Team</strong><br/>
      <span style="color:#64748b;">Blynk Virtual Technologies Pvt. Ltd.</span>
    </p>
  </td></tr>

  <tr><td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;">
    <div style="font-size:11.5px;color:#94a3b8;line-height:1.6;">
      This email and the attached payslip are confidential and intended solely for the named employee.
      Automated message from Blynk HRMS &mdash; please do not forward or share with third parties.
    </div>
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
