import { supabase } from '@/integrations/supabase/client';

type TaskEmailEvent = 'task_assigned' | 'task_reassigned' | 'task_overdue' | 'task_due_soon' | 'task_mention';

interface SendTaskEmailParams {
  eventType: TaskEmailEvent;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  assignedByName?: string;
  dueDate?: string;
  status?: string;
  recipientEmail?: string;
  recipientName?: string;
  recipientUserId?: string;
  ccUserIds?: string[];
}

export async function sendTaskEmail({
  eventType,
  taskId,
  taskTitle,
  taskDescription,
  assignedByName,
  dueDate,
  status,
  recipientEmail,
  recipientName,
  recipientUserId,
  ccUserIds = [],
}: SendTaskEmailParams) {
  try {
    // Collect all user IDs that should receive this notification
    const allUserIds = Array.from(
      new Set([recipientUserId, ...ccUserIds].filter(Boolean) as string[])
    );

    // If we have a direct email but no userId, send to that email
    if (!allUserIds.length && recipientEmail) {
      await invokeSend({
        eventType, taskId, taskTitle, taskDescription,
        assignedByName, dueDate, status, recipientName,
        recipientEmail,
      });
      return;
    }

    if (!allUserIds.length) {
      console.warn('Task email: no recipients to notify');
      return;
    }

    // Look up emails for all user IDs
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .in('id', allUserIds);

    if (!users?.length) {
      console.warn('Task email: no users found for IDs', allUserIds);
      return;
    }

    // Deduplicate by email
    const seen = new Set<string>();
    for (const user of users) {
      if (!user.email) continue;
      const emailLower = user.email.toLowerCase();
      if (seen.has(emailLower)) continue;
      seen.add(emailLower);

      const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined;

      // Fire-and-forget per recipient — don't await sequentially
      invokeSend({
        eventType, taskId, taskTitle, taskDescription,
        assignedByName, dueDate, status,
        recipientEmail: user.email,
        recipientName: name,
      }).catch(() => {});
    }
  } catch (err) {
    // Fire-and-forget — never block task operations
    console.warn('Task email send failed (non-blocking):', err);
  }
}

async function invokeSend(params: {
  eventType: string;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  assignedByName?: string;
  dueDate?: string;
  status?: string;
  recipientEmail: string;
  recipientName?: string;
}) {
  const { eventType, taskId, recipientEmail, ...rest } = params;
  const today = new Date().toISOString().split('T')[0];

  await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'task-notification',
      recipientEmail,
      idempotencyKey: `task-${eventType}-${taskId}-${recipientEmail}-${today}`,
      templateData: {
        eventType,
        taskTitle: rest.taskTitle,
        taskDescription: rest.taskDescription,
        assignedByName: rest.assignedByName,
        dueDate: rest.dueDate,
        status: rest.status,
        recipientName: rest.recipientName,
      },
    },
  });
}
