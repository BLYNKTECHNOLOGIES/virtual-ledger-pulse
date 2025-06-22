
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useUserActivity() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Update activity immediately on mount
    const updateActivity = async () => {
      try {
        await supabase.rpc('update_user_activity', {
          user_uuid: user.id
        });
      } catch (error) {
        console.error('Failed to update user activity:', error);
      }
    };

    updateActivity();

    // Set up interval to update activity every 2 minutes
    const interval = setInterval(updateActivity, 2 * 60 * 1000);

    // Update activity on user interactions
    const handleUserActivity = () => {
      updateActivity();
    };

    // Listen for various user interaction events
    document.addEventListener('click', handleUserActivity);
    document.addEventListener('keypress', handleUserActivity);
    document.addEventListener('scroll', handleUserActivity);
    document.addEventListener('mousemove', handleUserActivity);

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', handleUserActivity);
      document.removeEventListener('keypress', handleUserActivity);
      document.removeEventListener('scroll', handleUserActivity);
      document.removeEventListener('mousemove', handleUserActivity);
    };
  }, [user]);
}
