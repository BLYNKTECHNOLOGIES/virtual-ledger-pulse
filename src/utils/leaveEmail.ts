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

  await Promise.all(
    recipients.map((r) =>
      supabase.functions
        .invoke('send-transactional-email', {
          body: {
            templateName: 'leave-approval',
            recipientEmail: r.email,
            idempotencyKey: `leave-${eventType}-${requestId}-${r.email}-${today}`,
            templateData: {
              eventType,
              requestId,
              recipientRole: r.role,
              recipientName: r.name,
              ...rest,
            },
          },
        })
        .catch((err) => console.warn('Leave email failed (non-blocking):', err)),
    ),
  );
}
