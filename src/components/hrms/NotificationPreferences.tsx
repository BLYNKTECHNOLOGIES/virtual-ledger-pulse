import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Megaphone } from "lucide-react";

const NOTIFICATION_TYPES = [
  { type: "leave_request", label: "Leave Requests", icon: Bell, description: "When a leave request is submitted or updated" },
  { type: "attendance_alert", label: "Attendance Alerts", icon: Bell, description: "Late arrivals, early departures, absences" },
  { type: "payroll", label: "Payroll Updates", icon: Mail, description: "Payslip generation, salary revisions" },
  { type: "announcement", label: "Announcements", icon: Megaphone, description: "Company-wide announcements" },
  { type: "helpdesk", label: "Helpdesk Tickets", icon: MessageSquare, description: "Ticket assignments and updates" },
  { type: "performance", label: "Performance Reviews", icon: Bell, description: "Objective deadlines, feedback requests" },
  { type: "onboarding", label: "Onboarding Tasks", icon: Bell, description: "New task assignments during onboarding" },
];

const CHANNELS = ["in_app", "email"] as const;

interface Props {
  employeeId: string;
}

export default function NotificationPreferences({ employeeId }: Props) {
  const qc = useQueryClient();

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ["hr_notification_preferences", employeeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_notification_preferences")
        .select("*")
        .eq("employee_id", employeeId);
      return (data as any[]) || [];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ type, channel, enabled }: { type: string; channel: string; enabled: boolean }) => {
      const existing = prefs.find((p: any) => p.notification_type === type && p.channel === channel);
      if (existing) {
        const { error } = await (supabase as any)
          .from("hr_notification_preferences")
          .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("hr_notification_preferences")
          .insert({ employee_id: employeeId, notification_type: type, channel, is_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_notification_preferences", employeeId] });
    },
    onError: () => toast.error("Failed to update preference"),
  });

  const isEnabled = (type: string, channel: string) => {
    const pref = prefs.find((p: any) => p.notification_type === type && p.channel === channel);
    return pref ? pref.is_enabled : true; // default enabled
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading preferences...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" /> Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 pb-2 border-b text-xs font-semibold text-muted-foreground uppercase">
            <span>Notification</span>
            <span className="text-center">In-App</span>
            <span className="text-center">Email</span>
          </div>
          {NOTIFICATION_TYPES.map((nt) => (
            <div key={nt.type} className="grid grid-cols-[1fr_80px_80px] gap-2 py-3 border-b border-border/50 items-center">
              <div>
                <div className="text-sm font-medium">{nt.label}</div>
                <div className="text-xs text-muted-foreground">{nt.description}</div>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch} className="flex justify-center">
                  <Switch
                    checked={isEnabled(nt.type, ch)}
                    onCheckedChange={(checked) =>
                      upsert.mutate({ type: nt.type, channel: ch, enabled: checked })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
