import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .select('id, title, assignee_id, due_date, status')
      .neq('status', 'completed')
      .not('due_date', 'is', null)
      .not('assignee_id', 'is', null)
      .lte('due_date', in24h.toISOString());

    if (error) throw error;

    const notifications: any[] = [];

    for (const task of (tasks || [])) {
      const dueDate = new Date(task.due_date);
      const isOverdue = dueDate < now;

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

      notifications.push({
        user_id: task.assignee_id,
        title: isOverdue ? '⚠️ Task Overdue' : '⏰ Task Due Soon',
        message: `${isOverdue ? 'Overdue' : 'Due soon'}: "${task.title}" [${task.id.substring(0, 8)}]`,
        notification_type: notifType,
      });
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from('terminal_notifications')
        .insert(notifications);
      if (insertError) throw insertError;
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
