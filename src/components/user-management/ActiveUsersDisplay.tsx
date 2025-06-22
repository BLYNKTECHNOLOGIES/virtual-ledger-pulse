
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Monitor, Eye, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScreenShareManager } from './ScreenShareManager';
import { useToast } from '@/hooks/use-toast';

interface ActiveUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  last_activity: string;
  status: string;
}

export function ActiveUsersDisplay() {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [monitoringUsers, setMonitoringUsers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchActiveUsers = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.rpc('get_active_users');
      
      if (error) {
        console.error('Error fetching active users:', error);
        toast({
          title: "Error",
          description: "Failed to fetch active users",
          variant: "destructive",
        });
        return;
      }

      setActiveUsers(data || []);
    } catch (error) {
      console.error('Error fetching active users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveUsers();
    
    // Refresh active users every 30 seconds
    const interval = setInterval(fetchActiveUsers, 30 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const formatLastActivity = (timestamp: string) => {
    const now = new Date();
    const activity = new Date(timestamp);
    const diffMs = now.getTime() - activity.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    return `${diffMins} minutes ago`;
  };

  const toggleUserMonitoring = (userId: string) => {
    setMonitoringUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-2">Loading active users...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold">Active Users ({activeUsers.length})</h3>
        </div>
        <Button variant="outline" size="sm" onClick={fetchActiveUsers}>
          🔄 Refresh
        </Button>
      </div>

      {activeUsers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-600">No Active Users</h3>
            <p className="text-sm text-gray-500">No users are currently active on the system.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}`
                        : user.username
                      }
                    </CardTitle>
                    <p className="text-sm text-gray-600">@{user.username}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                      Online
                    </Badge>
                    <p className="text-xs text-gray-500">
                      {formatLastActivity(user.last_activity)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={monitoringUsers.has(user.id) ? "destructive" : "outline"}
                    onClick={() => toggleUserMonitoring(user.id)}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    {monitoringUsers.has(user.id) ? "Stop Monitoring" : "Monitor User"}
                  </Button>
                </div>

                {monitoringUsers.has(user.id) && (
                  <ScreenShareManager
                    userId={user.id}
                    username={user.username}
                    onStreamStart={(stream) => {
                      console.log('Screen share started for user:', user.username);
                    }}
                    onStreamEnd={() => {
                      console.log('Screen share ended for user:', user.username);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
