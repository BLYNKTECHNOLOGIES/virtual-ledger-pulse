import { supabase } from '@/integrations/supabase/client';

export type LeaveEmailEvent =
  | 'leave_requested'          // → reporting manager (action) + HR (FYI)
  | 'leave_manager_approved'   // → HR (action)
  | 'leave_approved'           // → employee
  | 'leave_rejected';          // → employee

const HR_INBOX = 'hr@blynkex.com';

interface LeaveEmailParams {
  eventType: LeaveEmailEvent;
  requestId: string;
  employeeName: string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  totalDays: number | string;
  reason?: string;
  contactDuringLeave?: string;
  balanceNote?: string;
  decidedBy?: string;
  managerEmail?: string | null;
  managerName?: string | null;
  employeeEmail?: string | null;
}

/**
 * Fire-and-forget leave notification emails.
 * Never blocks the underlying leave write — failures are logged only.
 */
export async function sendLeaveEmail(params: LeaveEmailParams) {
  const {
    eventType, requestId, managerEmail, managerName, employeeEmail, ...rest
  } = params;

  const recipients: Array<{ email: string; name?: string; role: 'manager' | 'hr' | 'employee' }> = [];

  if (eventType === 'leave_requested') {
    if (managerEmail) recipients.push({ email: managerEmail, name: managerName || undefined, role: 'manager' });
    recipients.push({ email: HR_INBOX, name: 'HR Team', role: 'hr' });
  } else if (eventType === 'leave_manager_approved') {
    recipients.push({ email: HR_INBOX, name: 'HR Team', role: 'hr' });
  } else if (employeeEmail) {
    recipients.push({ email: employeeEmail, role: 'employee' });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Sequential (not parallel) — concurrent invokes of the SMTP-bound function
  // were being dropped silently. Also surface `error` from invoke(), which does
  // NOT throw, so failures used to vanish without any log entry.
  const failures: string[] = [];
  for (const r of recipients) {
    try {
      const { data, error } = await supabase.functions.invoke('hr-workflow-notify', {
        body: {
          kind: 'leave',
          eventType,
          recipientEmail: r.email,
          idempotencyKey: `leave-${eventType}-${requestId}-${r.email}-${today}`,
          data: {
            eventType,
            requestId,
            recipientRole: r.role,
            recipientName: r.name,
            ...rest,
          },
        },
      });
      if (error || (data && (data as any).error)) {
        failures.push(`${r.email}: ${error?.message || (data as any)?.error}`);
      }
    } catch (err: any) {
      failures.push(`${r.email}: ${err?.message || String(err)}`);
    }
  }

  if (failures.length) {
    console.warn('Leave email failures:', failures);
  }
  return { sent: recipients.length - failures.length, failures };
}

