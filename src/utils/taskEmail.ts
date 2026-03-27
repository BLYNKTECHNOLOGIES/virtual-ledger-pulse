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
}: SendTaskEmailParams) {
  try {
    // First, look up the user ID from the email to use the SMTP-based send-task-email function
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('email', recipientEmail)
      .single();

    if (!userData?.id) {
      console.warn('Task email: recipient user not found for email', recipientEmail);
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
        recipientUserIds: [userData.id],
      },
    });
  } catch (err) {
    // Fire-and-forget — never block task operations
    console.warn('Task email send failed (non-blocking):', err);
  }
}
