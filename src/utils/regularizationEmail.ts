import { supabase } from '@/integrations/supabase/client';

export type RegEmailEvent =
  | 'reg_requested'          // → HR (action)
  | 'reg_pushed_to_manager'  // → reporting manager (action)
  | 'reg_manager_decided'    // → HR (final approval)
  | 'reg_approved'           // → employee
  | 'reg_rejected';          // → employee

const HR_INBOX = 'hr@blynkex.com';

interface RegEmailParams {
  eventType: RegEmailEvent;
  requestId: string;
  employeeName: string;
  attendanceDate: string;
  requestedIn?: string | null;
  requestedOut?: string | null;
  reasonCategory?: string | null;
  reason?: string | null;
  managerRecommendation?: string | null;
  managerRemarks?: string | null;
  decidedBy?: string | null;
  approverNotes?: string | null;
  managerEmail?: string | null;
  managerName?: string | null;
  employeeEmail?: string | null;
}

/**
 * Fire-and-forget attendance-regularization notification emails.
 * Never blocks the underlying write — failures are logged only.
 */
export async function sendRegularizationEmail(params: RegEmailParams) {
  const { eventType, requestId, managerEmail, managerName, employeeEmail, ...rest } = params;

  const recipients: Array<{ email: string; name?: string; role: 'manager' | 'hr' | 'employee' }> = [];

  if (eventType === 'reg_requested' || eventType === 'reg_manager_decided') {
    recipients.push({ email: HR_INBOX, name: 'HR Team', role: 'hr' });
  } else if (eventType === 'reg_pushed_to_manager') {
    if (managerEmail) recipients.push({ email: managerEmail, name: managerName || undefined, role: 'manager' });
  } else if (employeeEmail) {
    recipients.push({ email: employeeEmail, role: 'employee' });
  }

  const today = new Date().toISOString().slice(0, 10);

  const failures: string[] = [];
  for (const r of recipients) {
    try {
      const { data, error } = await supabase.functions.invoke('hr-workflow-notify', {
        body: {
          kind: 'regularization',
          eventType,
          recipientEmail: r.email,
          idempotencyKey: `reg-${eventType}-${requestId}-${r.email}-${today}`,
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
  if (failures.length) console.warn('Regularization email failures:', failures);
  return { sent: recipients.length - failures.length, failures };
}


export const REG_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'missed_punch', label: 'Missed punch' },
  { value: 'device_offline', label: 'Device offline' },
  { value: 'wrong_shift_mapped', label: 'Wrong shift mapped' },
  { value: 'approved_offsite', label: 'Approved off-site work' },
  { value: 'other_documented', label: 'Other (documented)' },
];

export const regCategoryLabel = (v?: string | null) =>
  REG_CATEGORIES.find((c) => c.value === v)?.label || v || '—';

export const regStageLabel = (r: { status: string; manager_status?: string | null }) => {
  switch (r.status) {
    case 'pending': return 'Awaiting HR';
    case 'manager_review': return 'With reporting manager';
    case 'manager_reviewed':
      return r.manager_status === 'rejected'
        ? 'Manager rejected · awaiting HR'
        : 'Manager approved · awaiting HR';
    default: return r.status;
  }
};
