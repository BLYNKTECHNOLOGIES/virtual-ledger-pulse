import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  eventType: 'task_assigned' | 'task_reassigned' | 'task_overdue' | 'task_due_soon' | 'task_mention';
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  assignedByName?: string;
  dueDate?: string;
  status?: string;
  recipientUserIds: string[];
}

function getSubject(eventType: string, taskTitle: string): string {
  const subjects: Record<string, string> = {
    task_assigned: `📋 New Task Assigned: ${taskTitle}`,
    task_reassigned: `🔄 Task Reassigned: ${taskTitle}`,
    task_overdue: `⚠️ Task Overdue: ${taskTitle}`,
    task_due_soon: `⏰ Task Due Soon: ${taskTitle}`,
    task_mention: `💬 You were mentioned: ${taskTitle}`,
  };
  return subjects[eventType] || `Task Update: ${taskTitle}`;
}

function getEmailBody(eventType: string, data: EmailRequest): string {
  const { taskTitle, taskDescription, assignedByName, dueDate, status } = data;
  const descSnippet = taskDescription ? taskDescription.substring(0, 200) : 'No description';
  const dueLine = dueDate ? `<p style="margin:8px 0;color:#555;">📅 Due: <strong>${new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>` : '';
  const statusBadge = status ? `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;background:${status === 'open' ? '#e3f2fd' : status === 'in_progress' ? '#fff3e0' : '#e8f5e9'};color:${status === 'open' ? '#1565c0' : status === 'in_progress' ? '#e65100' : '#2e7d32'};">${status.replace('_', ' ').toUpperCase()}</span>` : '';

  const headers: Record<string, string> = {
    task_assigned: '📋 A new task has been assigned to you',
    task_reassigned: '🔄 A task has been reassigned to you',
    task_overdue: '⚠️ This task is overdue and needs attention',
    task_due_soon: '⏰ This task is approaching its deadline',
    task_mention: '💬 You were mentioned in a task comment',
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a2e;padding:24px 30px;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">ERP Task Management</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="margin:0 0 16px;font-size:16px;color:#333;font-weight:600;">${headers[eventType] || 'Task Update'}</p>
          <div style="background:#f8f9fa;border-left:4px solid #1a1a2e;padding:16px;border-radius:0 6px 6px 0;margin:16px 0;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a2e;">${taskTitle}</h2>
            <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">${descSnippet}</p>
          </div>
          ${dueLine}
          ${assignedByName ? `<p style="margin:8px 0;color:#555;">👤 ${eventType === 'task_reassigned' ? 'Reassigned' : 'Assigned'} by: <strong>${assignedByName}</strong></p>` : ''}
          ${statusBadge ? `<p style="margin:8px 0;color:#555;">Status: ${statusBadge}</p>` : ''}
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#999;">This is an automated notification from your ERP system. Please log in to view full details and take action.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest = await req.json();
    const { eventType, taskId, recipientUserIds } = body;

    if (!eventType || !taskId || !recipientUserIds?.length) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');

    if (!smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ error: 'SMTP credentials not configured' }), { status: 500, headers: corsHeaders });
    }

    // Fetch recipient emails from users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username')
      .in('id', recipientUserIds);

    if (usersError || !users?.length) {
      return new Response(
        JSON.stringify({ error: usersError?.message || 'No valid recipients found' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    let sentCount = 0;
    const errors: string[] = [];

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: 587,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    for (const recipient of users) {
      if (!recipient.email) continue;

      // Dedup check
      const { data: existing } = await supabase
        .from('email_notification_log')
        .select('id')
        .eq('task_id', taskId)
        .eq('recipient_user_id', recipient.id)
        .eq('event_type', eventType)
        .gte('created_at', `${today}T00:00:00`)
        .limit(1);

      if (existing && existing.length > 0) continue;

      try {
        await client.send({
          from: smtpUser,
          to: recipient.email,
          subject: getSubject(eventType, body.taskTitle),
          content: "Please view this email in an HTML-compatible client.",
          html: getEmailBody(eventType, body),
        });

        await supabase.from('email_notification_log').insert({
          task_id: taskId,
          recipient_user_id: recipient.id,
          recipient_email: recipient.email,
          event_type: eventType,
          status: 'sent',
        });
        sentCount++;
      } catch (sendErr: any) {
        errors.push(`${recipient.email}: ${sendErr.message}`);
        await supabase.from('email_notification_log').insert({
          task_id: taskId,
          recipient_user_id: recipient.id,
          recipient_email: recipient.email,
          event_type: eventType,
          status: 'failed',
          error_message: sendErr.message,
        });
      }
    }

    await client.close();

    return new Response(
      JSON.stringify({ sent: sentCount, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
