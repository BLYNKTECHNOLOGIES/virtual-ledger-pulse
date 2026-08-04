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
  one_time_recovery: number
  earning_breakdown: { label: string; amount: number; one_time?: boolean }[]
  deduction_breakdown: { label: string; amount: number }[]

  pdf_path: string | null
  already_sent_at: string | null
  not_processed: boolean
  not_processed_reason: string | null
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

  // Summary-only email — the attached payslip PDF carries the full break-up.
  // One-time payouts are added to gross by RazorpayX and then recovered in the
  // same run because the money was already paid outside payroll. Show that as
  // its own line in the net-pay arithmetic, never as a statutory deduction.
  const oneTimeRow = row.one_time_recovery > 0 ? `
      <tr>
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">Less: one-time payments already paid to you<br/><span style="font-size:12px;color:#94a3b8;">Paid outside this payroll run &mdash; recovered here so it is not paid twice</span></td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${inr(row.one_time_recovery)}</td>
      </tr>` : ''

  const paidDaysRow = row.paid_days !== null ? `
      <tr>
        <td style="padding:12px 16px;color:#64748b;">Paid days</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;">${row.paid_days.toFixed(1)} of ${row.month_days.toFixed(1)}</td>
      </tr>` : ''


  return (`<!DOCTYPE html>
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
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">Total deductions</td>
        <td align="right" style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${inr(row.deductions)}</td>
      </tr>${oneTimeRow}${paidDaysRow}
    </table>


${lopBlock}${bonusBlock}
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

</table></td></tr></table></body></html>`).replace(/[ \t]+$/gm, '')
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
    const processedOn = (meta as any)?.processed_on ?? null

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
        ? Math.max(num(p.reg_pf_er), num(p.reg_employer_pf_contr)) +
          Math.max(num(p.reg_esi_er), num(p.reg_employer_esi_contr)) +
          num(p.reg_lwf_er)
        : 0
      const gross = hasReg
        ? Number(p.reg_gross_salary) - employer_contrib
        : Number(p.gross_earnings) || 0
      const net = Number(hasReg ? p.reg_net_pay : p.net_pay) || 0
      // One-time payouts are added to gross and reversed in the same run because
      // they were already paid outside payroll. They belong in the net-pay
      // arithmetic, NOT in the deduction list.
      const one_time_recovery = hasReg ? Math.max(-(Number(p.reg_one_time_payments) || 0), 0) : 0
      const deductions = hasReg ? gross - net - one_time_recovery : Number(p.total_deductions) || 0

      const oneTimeLabels = new Set(
        (lineByRecord.get(p.id) ?? [])
          .filter((l: any) => l.classification === 'one_time')
          .map((l: any) => l.normalized_label),
      )
      const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')

      const earning_breakdown: { label: string; amount: number; one_time?: boolean }[] = []
      if (hasReg) {
        const pushE = (label: string, v: any) => { const a = Number(v) || 0; if (a > 0) earning_breakdown.push({ label, amount: a }) }
        pushE('Basic', p.reg_basic)
        pushE('Dearness Allowance', p.reg_da)
        pushE('HRA', p.reg_hra)
        pushE('Special Allowance', p.reg_sa)
        pushE('LTA', p.reg_lta)
        pushE('Overtime', p.reg_overtime)
        pushE('Performance incentive', p.reg_performance_incentive)
        pushE('Refund of security deposit', p.reg_refund_security_deposit)
        for (const e of (Array.isArray(p.reg_extra_earnings) ? p.reg_extra_earnings : [])) {
          const a = Number((e as any)?.amount) || 0
          const label = String((e as any).label)
          if (a > 0) earning_breakdown.push({ label, amount: a, one_time: oneTimeLabels.has(norm(label)) })
        }
      }

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

      // --- "Was this person's salary actually processed this month?" -------
      // A payslip email is a statement that money was credited. It must NEVER
      // go out for someone who was not part of the disbursed run, and such a
      // person must not clutter the dispatch roster at all.
      // Authoritative signals, in priority order:
      //   1. do-not-pay flag verified against RazorpayX
      //   2. employee is inactive / has left / relieved
      //   3. Salary Register imported but this person has no row in it
      //   4. zero or negative net pay
      //   5. register not yet imported and RazorpayX issued no payslip PDF for
      //      this person in the disbursed run (the PDF pack is generated only
      //      for employees actually paid in that month's run)
      let not_processed_reason: string | null = null
      if (p.do_not_pay) not_processed_reason = 'Marked do-not-pay in RazorpayX'
      else if (p.reg_has_left) not_processed_reason = 'Employee has left / relieved'
      else if (emp && emp.is_active === false) not_processed_reason = 'Employee inactive'
      else if (registerPresent && !hasReg) not_processed_reason = 'Not in this month\u2019s Salary Register'
      else if (hasReg && !(Number(p.reg_net_pay) > 0)) not_processed_reason = 'Zero net pay in the Salary Register'
      else if (!hasReg && !(Number(p.net_pay) > 0)) not_processed_reason = 'Zero net pay in the RazorpayX run'
      else if (!hasReg && !p.pdf_storage_path) not_processed_reason = 'No payslip issued by RazorpayX for this month'
      const not_processed = not_processed_reason !== null

      const blockers: string[] = []
      if (not_processed) {
        blockers.push(`Salary not processed this month — ${not_processed_reason}`)
      }

      if (!not_processed) {
        // Only surface actionable blockers for people who WERE paid this month.
        if (!registerPresent) blockers.push('Salary Register CSV not imported for this month')
        if (!email) blockers.push('No email address on record')
        if (!p.pdf_storage_path) blockers.push('Payslip PDF not uploaded')
        if (Math.abs(gross - deductions - one_time_recovery - net) > TIE_OUT_TOLERANCE) {
          blockers.push(`Tie-out failed: gross ${gross} - deductions ${deductions} - one-time ${one_time_recovery} != net ${net}`)
        }

        if (deductions < -TIE_OUT_TOLERANCE) blockers.push('Register deductions are negative — check the Salary Register row')
        if (!processedOn) blockers.push('Salary credit date not set for this month')
      }



      return {
        employee_id: p.hr_employee_id,
        razorpay_employee_id: p.razorpay_employee_id,
        name,
        email,
        gross,
        deductions,
        net,
        basis: (hasReg ? 'register_csv' : 'razorpay') as Row['basis'],
        lop_days,
        lop_amount,
        bonuses,
        bonus_total,
        paid_days,
        month_days: mDays,
        bank_last4: p.reg_bank_acc_no ? String(p.reg_bank_acc_no).slice(-4) : null,
        employer_contrib,
        one_time_recovery,
        earning_breakdown,

        deduction_breakdown,
        pdf_path: p.pdf_storage_path ?? null,
        already_sent_at: p.hr_employee_id ? sentByEmp.get(p.hr_employee_id) ?? null : null,
        not_processed,
        not_processed_reason,
        blockers,
        sendable: blockers.length === 0 && !not_processed,

      }
    }).sort((a: Row, b: Row) => a.name.localeCompare(b.name))

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

    // Hard stop: never email a payslip to somebody whose salary was not
    // processed this month (do-not-pay, absent from the register, zero net).
    // This is enforced even when force_resend is set.
    const unprocessed = rows.filter((r) => ids.includes(r.employee_id) && r.not_processed)
    if (unprocessed.length > 0) {
      return json({
        error: `Salary was not processed this month for: ${unprocessed.map((r) => r.name).join(', ')}. Payslip emails cannot be sent to them.`,
        not_processed: unprocessed.map((r) => ({ employee_id: r.employee_id, name: r.name })),
      }, 400)
    }

    let targets = rows.filter((r) => ids.includes(r.employee_id) && r.sendable && !r.not_processed)
    if (!force) targets = targets.filter((r) => !r.already_sent_at)
    if (mode === 'preview') targets = targets.slice(0, 1)
    if (targets.length === 0) return json({ error: 'No sendable recipients in the selection' }, 400)

    // Chunked dispatch: attaching + base64-encoding PDFs is CPU heavy and a large
    // batch trips the edge CPU limit mid-run, which used to leave sends unlogged
    // (and therefore re-sendable). Process a small slice per invocation and let the
    // client loop until `remaining` is 0.
    const CHUNK = Math.max(1, Math.min(Number(body.chunk_size) || 4, 10))
    const totalTargets = targets.length
    if (mode === 'send') targets = targets.slice(0, CHUNK)


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
      remaining: mode === 'send' ? Math.max(0, totalTargets - targets.length) : 0,
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('hr-send-payslip-emails error', msg)
    return json({ error: msg }, 500)
  }
})
