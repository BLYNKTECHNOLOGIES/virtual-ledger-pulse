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
  recipientEmail: string;
  recipientName?: string;
  recipientUserId?: string;
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
  recipientUserId,
}: SendTaskEmailParams) {
  try {
    let userId = recipientUserId;

    // If no userId provided, look it up from email
    if (!userId && recipientEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', recipientEmail)
        .single();
      userId = userData?.id;
    }

    if (!userId) {
      console.warn('Task email: recipient user not found', recipientEmail);
      return;
    }

    await supabase.functions.invoke('send-task-email', {
      body: {
        eventType,
        taskId,
        taskTitle,
        taskDescription,
        assignedByName,
        dueDate,
        status,
        recipientUserIds: [userId],
      },
    });
  } catch (err) {
    // Fire-and-forget — never block task operations
    console.warn('Task email send failed (non-blocking):', err);
  }
}
