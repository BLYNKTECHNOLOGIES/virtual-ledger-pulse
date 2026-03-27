import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get non-completed tasks with due dates
    const { data: tasks, error } = await supabase
      .from('erp_tasks')
      .select('id, title, assignee_id, due_date, status, escalation_hours, escalation_user_id, reminder_hours_before')
      .neq('status', 'completed')
      .not('due_date', 'is', null)
      .not('assignee_id', 'is', null);

    if (error) throw error;

    const notifications: any[] = [];

    for (const task of (tasks || [])) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < now;
      const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      const reminderH = task.reminder_hours_before || 24;
      const isDueSoon = !isOverdue && hoursUntilDue <= reminderH;

      if (!isOverdue && !isDueSoon) continue;

      // Check if we already sent this notification today
      const notifType = isOverdue ? 'task_overdue' : 'task_due_soon';
      const today = now.toISOString().split('T')[0];

      const { data: existing } = await supabase
        .from('terminal_notifications')
        .select('id')
        .eq('user_id', task.assignee_id)
        .eq('notification_type', notifType)
        .gte('created_at', `${today}T00:00:00`)
        .ilike('message', `%${task.id.substring(0, 8)}%`)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Standard due soon / overdue notification
      notifications.push({
        user_id: task.assignee_id,
        title: isOverdue ? '⚠️ Task Overdue' : '⏰ Task Due Soon',
        message: `${isOverdue ? 'Overdue' : 'Due soon'}: "${task.title}" [${task.id.substring(0, 8)}]`,
        notification_type: notifType,
      });

      // Escalation: if overdue and escalation configured
      if (isOverdue && task.escalation_hours && task.escalation_user_id) {
        const overdueHours = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
        if (overdueHours >= task.escalation_hours) {
          // Check if escalation already sent
          const { data: escExisting } = await supabase
            .from('terminal_notifications')
            .select('id')
            .eq('user_id', task.escalation_user_id)
            .eq('notification_type', 'task_escalated')
            .gte('created_at', `${today}T00:00:00`)
            .ilike('message', `%${task.id.substring(0, 8)}%`)
            .limit(1);

          if (!escExisting || escExisting.length === 0) {
            notifications.push({
              user_id: task.escalation_user_id,
              title: '🚨 Task Escalation',
              message: `Task "${task.title}" has been overdue for ${Math.floor(overdueHours)}h and requires attention [${task.id.substring(0, 8)}]`,
              notification_type: 'task_escalated',
            });

            // Log escalation activity
            await supabase.from('erp_task_activity_log').insert({
              task_id: task.id,
              user_id: null,
              action: 'task_escalated',
              details: { escalated_to: task.escalation_user_id, overdue_hours: Math.floor(overdueHours) },
            });
          }
        }
      }
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from('terminal_notifications')
        .insert(notifications);
      if (insertError) throw insertError;
    }

    // Send email notifications for due-soon and overdue tasks via transactional email
    if (notifications.length > 0) {
      try {
        const emailTasks = (tasks || []).filter(t => {
          const dueDate = new Date(t.due_date);
          const isOverdue = dueDate < now;
          const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          const reminderH = t.reminder_hours_before || 24;
          return isOverdue || (!isOverdue && hoursUntilDue <= reminderH);
        });

        for (const task of emailTasks) {
          const dueDate = new Date(task.due_date);
          const isOverdue = dueDate < now;
          const eventType = isOverdue ? 'task_overdue' : 'task_due_soon';

          // Fetch assignee email
          const { data: assigneeData } = await supabase
            .from('users')
            .select('email, first_name, last_name, username')
            .eq('id', task.assignee_id)
            .single();

          if (assigneeData?.email) {
            await supabase.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'task-notification',
                recipientEmail: assigneeData.email,
                idempotencyKey: `task-${eventType}-${task.id}-${new Date().toISOString().split('T')[0]}`,
                templateData: {
                  eventType,
                  taskTitle: task.title,
                  dueDate: task.due_date,
                  status: task.status,
                  recipientName: [assigneeData.first_name, assigneeData.last_name].filter(Boolean).join(' ') || assigneeData.username,
                },
              },
            });
          }
        }
      } catch (emailErr) {
        console.error('Email notification error:', emailErr);
      }
    }

    return new Response(
      JSON.stringify({ sent: notifications.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
