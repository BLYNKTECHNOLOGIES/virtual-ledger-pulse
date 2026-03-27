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
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'task-notification',
        recipientEmail,
        idempotencyKey: `task-${eventType}-${taskId}-${new Date().toISOString().split('T')[0]}`,
        templateData: {
          eventType,
          taskTitle,
          taskDescription,
          assignedByName,
          dueDate,
          status,
          recipientName,
        },
      },
    });
  } catch (err) {
    // Fire-and-forget — never block task operations
    console.warn('Task email send failed (non-blocking):', err);
  }
}
