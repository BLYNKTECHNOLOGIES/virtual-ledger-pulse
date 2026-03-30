
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface AuthCheckProps {
  children: React.ReactNode;
}

export function AuthCheck({ children }: AuthCheckProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      // Primary: Check Supabase Auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsAuthenticated(true);
        return;
      }

      // Fallback: Check legacy localStorage session
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userSession = localStorage.getItem('userSession');
      
      if (isLoggedIn === 'true' && userSession) {
        try {
          const parsed = JSON.parse(userSession);
          if (parsed?.user?.id) {
            setIsAuthenticated(true);
            return;
          }
        } catch { /* invalid session */ }
      }
      
      navigate('/');
    };

    checkAuth();
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
