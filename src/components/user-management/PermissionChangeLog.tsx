import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { History, Plus, Minus } from "lucide-react";

interface ChangeLogEntry {
  id: string;
  role_name: string;
  change_type: string;
  permission: string | null;
  function_key: string | null;
  changed_by: string | null;
  changed_at: string;
}

export function PermissionChangeLog() {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [changerNames, setChangerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('permission_change_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);

      // Fetch usernames for changed_by
      const userIds = [...new Set((data || []).map(l => l.changed_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, username, first_name, last_name')
          .in('id', userIds);

        const names: Record<string, string> = {};
        (users || []).forEach((u: any) => {
          names[u.id] = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
        });
        setChangerNames(names);
      }
    } catch (error) {
      console.error('Error fetching permission change logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isGrant = (type: string) => type.includes('granted');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Recent Permission Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No permission changes recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent Permission Changes
          <Badge variant="secondary" className="text-xs">{logs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-3 p-2 rounded-md border bg-muted/20 text-sm">
              {isGrant(log.change_type) ? (
                <Plus className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Minus className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{log.role_name}</span>
                {' — '}
                <span className={isGrant(log.change_type) ? 'text-emerald-600' : 'text-red-600'}>
                  {isGrant(log.change_type) ? 'granted' : 'revoked'}
                </span>
                {' '}
                <Badge variant="outline" className="text-xs">
                  {log.permission || log.function_key || 'unknown'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground shrink-0 text-right">
                <div>{changerNames[log.changed_by || ''] || 'System'}</div>
                <div>{formatDistanceToNow(new Date(log.changed_at), { addSuffix: true })}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
