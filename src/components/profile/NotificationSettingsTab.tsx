import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Bell, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationSettingsTabProps {
  employeeId: string;
}

const NOTIFICATION_TYPES: Record<string, { label: string; description: string; icon: typeof Bell }> = {
  leave_request_submitted: {
    label: 'Leave Request Submitted',
    description: 'Get notified when your leave request is submitted for approval',
    icon: Bell,
  },
  leave_request_approved: {
    label: 'Leave Request Approved',
    description: 'Get notified when your leave request is approved by the manager',
    icon: Bell,
  },
  leave_request_rejected: {
    label: 'Leave Request Rejected',
    description: 'Get notified when your leave request is rejected',
    icon: Bell,
  },
  leave_balance_low: {
    label: 'Low Leave Balance',
    description: 'Get notified when your leave balance falls below the threshold',
    icon: Bell,
  },
};

export default function NotificationSettingsTab({ employeeId }: NotificationSettingsTabProps) {
  const qc = useQueryClient();

  const { data: preferences = [], isLoading } = useQuery({
    queryKey: ['hr_notification_preferences', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_notification_preferences')
        .select('*')
        .eq('employee_id', employeeId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from('hr_notification_preferences')
        .update({ is_enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr_notification_preferences', employeeId] });
      toast.success('Notification preference updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const channelMutation = useMutation({
    mutationFn: async ({ id, channel }: { id: string; channel: string }) => {
      const { error } = await (supabase as any)
        .from('hr_notification_preferences')
        .update({ channel, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr_notification_preferences', employeeId] });
      toast.success('Channel updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-center py-8 text-muted-foreground">Loading notification settings...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">Manage how you receive leave-related notifications</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" /> Leave Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {preferences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No notification preferences configured. Please contact HR.</p>
          ) : (
            preferences.map((pref: any) => {
              const config = NOTIFICATION_TYPES[pref.notification_type];
              if (!config) return null;
              const Icon = config.icon;
              return (
                <div key={pref.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-muted rounded-md mt-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Select
                      value={pref.channel || 'email'}
                      onValueChange={(v) => channelMutation.mutate({ id: pref.id, channel: v })}
                      disabled={!pref.is_enabled}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="in_app">In-App</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={pref.is_enabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: pref.id, is_enabled: v })}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-6 text-center">
          <Smartphone className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Email notifications coming soon</p>
          <p className="text-xs text-muted-foreground">
            Email delivery for leave notifications will be activated once the notification system is fully configured. 
            Your preferences are being saved and will apply automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
