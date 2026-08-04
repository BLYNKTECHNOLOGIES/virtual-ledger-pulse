import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE = 'payslip_monthly'
const TIE_OUT_TOLERANCE = 1 // rupee

type Row = {
  employee_id: string
  razorpay_employee_id: string | null
  name: string
  email: string | null
  gross: number
  deductions: number
  net: number
  basis: 'register_csv' | 'razorpay'
  lop_days: number
  lop_amount: number
  bonuses: { label: string; amount: number }[]
  bonus_total: number
  paid_days: number | null
  month_days: number
  bank_last4: string | null
  employer_contrib: number
  deduction_breakdown: { label: string; amount: number }[]
  pdf_path: string | null
  already_sent_at: string | null
  blockers: string[]
  sendable: boolean
}

const inr = (n: number) =>
  'INR ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function monthLabel(m: string) {
  const d = new Date(m + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}
function daysInMonth(m: string) {
  const d = new Date(m + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

function buildHtml(row: Row, month: string, processedOn: string | null) {
  const label = monthLabel(month)
  const first = fmtDate(month)
  const last = fmtDate(
    new Date(Date.UTC(new Date(month + 'T00:00:00Z').getUTCFullYear(), new Date(month + 'T00:00:00Z').getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10),
  )
  const credited = fmtDate(processedOn)
  const bankBit = row.bank_last4 ? ` <strong style="color:#0f172a;">XXXXXX${esc(row.bank_last4)}</strong>` : ''
  const creditedBit = credited ? ` on <strong style="color:#0f172a;">${credited}</strong>` : ''

  const lopBlock = row.lop_days > 0 ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="width:4px;background:#f59e0b;border-radius:4px 0 0 4px;"></td>
        <td style="background:#fffbeb;padding:16px 18px;border:1px solid #fde68a;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#b45309;">Loss of pay</div>
          <div style="font-size:15px;font-weight:700;color:#78350f;margin-top:6px;">${row.lop_days.toFixed(1)} day(s) &middot; ${inr(row.lop_amount)}</div>
          <div style="font-size:13.5px;color:#92400e;line-height:1.6;margin-top:6px;">
            Recorded for ${esc(label)} as per biometric attendance and approved leave records for the pay period.
          </div>
        </td>
      </tr>
    </table>` : ''

  const bonusRows = row.bonuses.map((b) => `
            <tr><td style="padding:6px 0;">${esc(b.label)}</td><td align="right" style="padding:6px 0;font-weight:600;">${inr(b.amount)}</td></tr>`).join('')

  const bonusBlock = row.bonuses.length > 0 ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="width:4px;background:#16a34a;border-radius:4px 0 0 4px;"></td>
        <td style="background:#f0fdf4;padding:18px;border:1px solid #bbf7d0;border-left:0;border-radius:0 8px 8px 0;">
          <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:#15803d;">Congratulations</div>
          <div style="font-size:15px;font-weight:700;color:#14532d;margin-top:6px;">A bonus has been added to your ${esc(label.split(' ')[0])} salary</div>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#166534;margin-top:12px;">${bonusRows}
            <tr>
              <td style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">Total bonus</td>
              <td align="right" style="padding:10px 0 0;border-top:1px solid #bbf7d0;font-weight:700;color:#14532d;">${inr(row.bonus_total)}</td>
            </tr>
          </table>
          <div style="font-size:13.5px;color:#166534;line-height:1.6;margin-top:12px;">
            Thank you for the effort and ownership you have shown this month. Your contribution is genuinely valued by the team.
          </div>
        </td>
      </tr>
    </table>` : ''

  const paidDaysRow = row.paid_days !== null ? `
      <tr>
        <td style="padding:12px 16px;color:#64748b;">Paid days</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;">${row.paid_days.toFixed(1)} of ${row.month_days.toFixed(1)}</td>
      </tr>` : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#eef1f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 12px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(15,23,42,.08);">

  <tr><td style="background:#0f172a;padding:28px 32px;">
    <div style="font-size:11px;letter-spacing:2.4px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Blynk Virtual Technologies Pvt. Ltd.</div>
    <div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:8px;letter-spacing:-.3px;">Payslip &mdash; ${esc(label)}</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:6px;">Pay period ${first} &ndash; ${last}</div>
  </td></tr>

  <tr><td style="padding:30px 32px 0;">
    <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">Dear <strong>${esc(row.name)}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.65;">
      Your salary for <strong style="color:#0f172a;">${esc(label)}</strong> has been processed and credited to your registered
      bank account${bankBit}${creditedBit}. A detailed payslip is attached to this email.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:#0f172a;border-radius:10px;margin:0 0 22px;">
      <tr><td style="padding:20px 24px;">
        <div style="font-size:11px;letter-spacing:1.6px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Net pay credited</div>
        <div style="font-size:30px;font-weight:700;color:#ffffff;margin-top:6px;letter-spacing:-.5px;">${inr(row.net)}</div>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 24px;">
      <tr>
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">Gross earnings</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${inr(row.gross)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;${row.paid_days !== null ? 'border-bottom:1px solid #e2e8f0;' : ''}">Total deductions</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;${row.paid_days !== null ? 'border-bottom:1px solid #e2e8f0;' : ''}">${inr(row.deductions)}</td>
      </tr>${paidDaysRow}
    </table>

    ${lopBlock}
    ${bonusBlock}

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

</table></td></tr></table></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ---- auth: caller must be a payroll-authorised user -------------------
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (!token) return json({ error: 'Missing authorization' }, 401)
    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes?.user) return json({ error: 'Invalid session' }, 401)
    const { data: authorized } = await admin.rpc('hr_payroll_cockpit_authorized', { _user_id: userRes.user.id })
    if (!authorized) return json({ error: 'Not authorized for payroll actions' }, 403)

    const body = await req.json().catch(() => ({}))
    const mode: 'roster' | 'send' | 'preview' = body.mode ?? 'roster'
    const rawMonth: string = body.period_month
    if (!rawMonth) return json({ error: 'period_month is required' }, 400)
    const month = rawMonth.slice(0, 8) + '01'

    // ---- authoritative data -----------------------------------------------
    const [{ data: records, error: recErr }, { data: employees }, { data: dedRows }, { data: addRows }, { data: sentLog }, { data: meta }] =
      await Promise.all([
        admin.from('hr_razorpay_payslip_records').select('*').eq('period_month', month),
        admin.from('hr_employees').select('id, first_name, last_name, email, is_active, badge_id'),
        admin.from('hr_payroll_input_deductions').select('hr_employee_id, label, amount, lop_days, source, readback_verified_at, pushed_at').eq('period_month', month),
        admin.from('hr_payroll_input_additions').select('hr_employee_id, label, amount, readback_verified_at, pushed_at').eq('period_month', month),
        admin.from('hr_email_send_log').select('metadata, created_at, status').eq('template_name', TEMPLATE).filter('metadata->>period_month', 'eq', month),
        admin.from('hr_payroll_month_meta').select('processed_on').eq('period_month', month).maybeSingle(),
      ])
    if (recErr) return json({ error: recErr.message }, 500)

    const registerPresent = (records ?? []).some((r: any) => r.reg_source_filename)
    const empById = new Map((employees ?? []).map((e: any) => [e.id, e]))
    const sentByEmp = new Map<string, string>()
    for (const l of sentLog ?? []) {
      const m = (l as any).metadata || {}
      if (m.period_month !== month) continue
      if (['failed', 'error'].includes(String((l as any).status || ''))) continue
      if (m.employee_id) sentByEmp.set(m.employee_id, (l as any).created_at)
    }

    const mDays = daysInMonth(month)

    const rows: Row[] = (records ?? []).map((p: any) => {
      const emp = p.hr_employee_id ? empById.get(p.hr_employee_id) : null
      const name = [emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || p.employee_name_snapshot || 'Employee'
      const email = emp?.email || p.reg_personal_email || null

      const hasReg = p.reg_gross_salary !== null && p.reg_gross_salary !== undefined
      const num = (v: any) => Math.abs(Number(v) || 0)

      // The RazorpayX Salary Register is CTC-inclusive: reg_gross_salary carries the
      // employer-side statutory cost, and reg_net_pay is net of BOTH employee and
      // employer contributions. An employee-facing payslip must never show employer
      // contributions as a deduction, so carve them out of gross first.
      const employer_contrib = hasReg
        ? num(p.reg_pf_er) + num(p.reg_esi_er) + num(p.reg_lwf_er) + num(p.reg_employer_pf_contr) * 0 + num(p.reg_employer_esi_contr) * 0
        : 0
      const gross = hasReg
        ? Number(p.reg_gross_salary) - employer_contrib
        : Number(p.gross_earnings) || 0
      const net = Number(hasReg ? p.reg_net_pay : p.net_pay) || 0
      const deductions = hasReg ? gross - net : Number(p.total_deductions) || 0

      const deduction_breakdown: { label: string; amount: number }[] = []
      if (hasReg) {
        const push = (label: string, v: any) => { const a = num(v); if (a > 0) deduction_breakdown.push({ label, amount: a }) }
        push('Provident Fund (employee)', p.reg_pf_ee)
        push('ESIC (employee)', p.reg_esi_ee)
        push('Professional Tax', p.reg_pt)
        push('Labour Welfare Fund', p.reg_lwf_ee)
        push('TDS / Income Tax', p.reg_tds)
        push('Salary advance recovery', p.reg_advance_salary)
        push('Loan / EMI recovery', p.reg_loan_emi)
        const listed = deduction_breakdown.reduce((s2, d) => s2 + d.amount, 0)
        const residual = Math.round((deductions - listed) * 100) / 100
        if (Math.abs(residual) > TIE_OUT_TOLERANCE) {
          deduction_breakdown.push({ label: 'Other deductions', amount: residual })
        }
      }

      const empDeds = (dedRows ?? []).filter((d: any) => d.hr_employee_id === p.hr_employee_id)
      const lopRows = empDeds.filter((d: any) => String(d.label || '').toLowerCase().includes('lop') && d.readback_verified_at)
      const lop_days = lopRows.reduce((s: number, d: any) => s + (Number(d.lop_days) || 0), 0)
      const lop_amount = lopRows.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0)

      const bonuses = (addRows ?? [])
        .filter((a: any) => a.hr_employee_id === p.hr_employee_id && a.readback_verified_at)
        .map((a: any) => ({ label: String(a.label || 'Bonus'), amount: Number(a.amount) || 0 }))
      const bonus_total = bonuses.reduce((s, b) => s + b.amount, 0)

      const paid_days = p.reg_working_days !== null && p.reg_working_days !== undefined
        ? Number(p.reg_working_days)
        : (lop_days > 0 ? mDays - lop_days : null)

      const blockers: string[] = []
      if (!registerPresent) blockers.push('Salary Register CSV not imported for this month')
      if (!hasReg) blockers.push('No Salary Register row for this employee')
      if (p.do_not_pay) blockers.push('Marked do-not-pay')
      if (p.reg_has_left) blockers.push('Employee has left / relieved')
      if (emp && emp.is_active === false) blockers.push('Employee inactive')
      if (!email) blockers.push('No email address on record')
      if (!p.pdf_storage_path) blockers.push('Payslip PDF not uploaded')
      if (Math.abs(gross - deductions - net) > TIE_OUT_TOLERANCE) {
        blockers.push(`Tie-out failed: gross ${gross} - deductions ${deductions} != net ${net}`)
      }
      if (net <= 0) blockers.push('Net pay is zero or negative')
      if (deductions < -TIE_OUT_TOLERANCE) blockers.push('Register deductions are negative — check the Salary Register row')
      if (!processedOn) blockers.push('Salary credit date not set for this month')

      return {
        employee_id: p.hr_employee_id,
        razorpay_employee_id: p.razorpay_employee_id,
        name,
        email,
        gross,
        deductions,
        net,
        basis: hasReg ? 'register_csv' : 'razorpay',
        lop_days,
        lop_amount,
        bonuses,
        bonus_total,
        paid_days,
        month_days: mDays,
        bank_last4: p.reg_bank_acc_no ? String(p.reg_bank_acc_no).slice(-4) : null,
        employer_contrib,
        deduction_breakdown,
        pdf_path: p.pdf_storage_path ?? null,
        already_sent_at: p.hr_employee_id ? sentByEmp.get(p.hr_employee_id) ?? null : null,
        blockers,
        sendable: blockers.length === 0,
      }
    }).sort((a: Row, b: Row) => a.name.localeCompare(b.name))

    const processedOn = (meta as any)?.processed_on ?? null

    if (mode === 'roster') {
      return json({ month, register_present: registerPresent, processed_on: processedOn, rows })
    }

    // ---- SMTP -------------------------------------------------------------
    const smtpHost = Deno.env.get('HR_SMTP_HOST')
    const smtpUser = Deno.env.get('HR_SMTP_USER')
    const smtpPass = Deno.env.get('HR_SMTP_PASS')
    if (!smtpHost || !smtpUser || !smtpPass) return json({ error: 'HR SMTP is not configured' }, 500)

    if (!registerPresent) {
      return json({ error: 'Salary Register CSV must be imported before payslip emails can be sent.' }, 400)
    }

    const ids: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : []
    const force = !!body.force_resend
    let targets = rows.filter((r) => ids.includes(r.employee_id) && r.sendable)
    if (!force) targets = targets.filter((r) => !r.already_sent_at)
    if (mode === 'preview') targets = targets.slice(0, 1)
    if (targets.length === 0) return json({ error: 'No sendable recipients in the selection' }, 400)

    const previewTo: string | null = mode === 'preview' ? (body.preview_to || userRes.user.email || null) : null
    if (mode === 'preview' && !previewTo) return json({ error: 'No preview recipient' }, 400)

    const client = new SMTPClient({
      connection: { hostname: smtpHost, port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
    })

    const results: { employee_id: string; name: string; ok: boolean; error?: string }[] = []
    for (const row of targets) {
      try {
        const dl = await admin.storage.from('payslips').download(row.pdf_path!)
        if (dl.error || !dl.data) throw new Error(`Could not read payslip PDF: ${dl.error?.message || 'missing'}`)
        const buf = new Uint8Array(await dl.data.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192))
        const b64 = btoa(bin)

        const label = monthLabel(month)
        const subject = `${mode === 'preview' ? '[PREVIEW] ' : ''}Your Payslip — ${label} | Blynk Virtual Technologies`
        const to = mode === 'preview' ? previewTo! : row.email!

        await client.send({
          from: `HR - Blynk Virtual Technologies <${smtpUser}>`,
          to,
          subject,
          content: 'Please view this email in an HTML-compatible client.',
          html: buildHtml(row, month, processedOn),
          attachments: [{
            filename: `Payslip_${label.replace(/ /g, '_')}_${row.name.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`,
            content: b64,
            encoding: 'base64',
            contentType: 'application/pdf',
          }] as any,
        })

        if (mode === 'send') {
          await admin.from('hr_email_send_log').insert({
            template_name: TEMPLATE,
            recipient_email: to,
            subject,
            status: 'sent',
            metadata: {
              employee_id: row.employee_id,
              period_month: month,
              net: row.net,
              gross: row.gross,
              deductions: row.deductions,
              lop_days: row.lop_days,
              bonus_total: row.bonus_total,
              basis: row.basis,
              sent_by: userRes.user.id,
            },
          })
        }
        results.push({ employee_id: row.employee_id, name: row.name, ok: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('payslip email failed', row.employee_id, msg)
        if (mode === 'send') {
          await admin.from('hr_email_send_log').insert({
            template_name: TEMPLATE,
            recipient_email: row.email,
            subject: `Your Payslip — ${monthLabel(month)}`,
            status: 'failed',
            error_message: msg,
            metadata: { employee_id: row.employee_id, period_month: month, failed: true },
          })
        }
        results.push({ employee_id: row.employee_id, name: row.name, ok: false, error: msg })
      }
    }
    await client.close()

    return json({
      month,
      mode,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('hr-send-payslip-emails error', msg)
    return json({ error: msg }, 500)
  }
})
