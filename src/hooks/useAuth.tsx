import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ValidationUser, UserWithRoles, User, AuthContextType } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const authenticateUser = async (email: string, password: string): Promise<User | null> => {
    try {

      // For other users, try database authentication
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_user_credentials', {
          input_username: email.trim(),
          input_password: password
        });

      if (validationError || !validationResult || !Array.isArray(validationResult) || validationResult.length === 0) {
        return null;
      }

      const validationData = validationResult[0] as ValidationUser;
      
      if (!validationData?.is_valid) {
        return null;
      }

      // Get user with roles using the RPC function
      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      let roles: string[] = [];
      if (!userRolesError && userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0] as UserWithRoles;
        if (userRoleData.roles && Array.isArray(userRoleData.roles)) {
          roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
        }
      }

      // If no roles found, try to get from users table role_id
      if (roles.length === 0) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select(`
            *,
            roles!role_id(id, name, description)
          `)
          .eq('id', validationData.user_id)
          .single();

        if (!userError && userData?.roles) {
          roles = [userData.roles.name];
        }
      }

      if (roles.length === 0) {
        roles = ['user']; // Default role
      }

      // Fetch user data including avatar_url
      const { data: userData } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', validationData.user_id)
        .single();

      const authenticatedUser: User = {
        id: validationData.user_id,
        username: validationData.username || email,
        email: validationData.email || email,
        firstName: validationData.first_name || undefined,
        lastName: validationData.last_name || undefined,
        avatar_url: userData?.avatar_url || undefined,
        roles
      };

      return authenticatedUser;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  };

  const checkForceLogout = async (userId: string, sessionTimestamp: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('force_logout_at, status')
        .eq('id', userId)
        .single();
      
      // If user not found (deleted), force logout
      if (error || !data) return true;
      
      // If user is suspended/inactive, force logout
      if (data.status === 'SUSPENDED' || data.status === 'INACTIVE') return true;
      
      // If force_logout_at is set and session is older, force logout
      if (data.force_logout_at) {
        const forceLogoutTime = new Date(data.force_logout_at).getTime();
        if (sessionTimestamp < forceLogoutTime) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  const restoreSessionFromStorage = async () => {
    try {
      const savedSession = localStorage.getItem('userSession');
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userEmail = localStorage.getItem('userEmail');
      
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const now = Date.now();
        
        if (sessionData.timestamp && (now - sessionData.timestamp) < sessionData.expiresIn) {
          // Check if a password reset happened after this session was created
          const shouldLogout = await checkForceLogout(sessionData.user?.id, sessionData.timestamp);
          if (shouldLogout) {
            localStorage.removeItem('userSession');
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userPermissions');
            toast({
              title: "Session Expired",
              description: "Your account has been updated or removed. Please log in again.",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
          setUser(sessionData.user);
          setIsLoading(false);
          return;
        }
      }
      
      // No fallback — if session is invalid, user must re-login
    } catch (error) {
      console.error('Session restoration error:', error);
      localStorage.removeItem('userSession');
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: { email: string; password: string }): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const authenticatedUser = await authenticateUser(credentials.email, credentials.password);
      
      if (authenticatedUser) {
        setUser(authenticatedUser);
        
        // Store in new format
        const sessionData = {
          user: authenticatedUser,
          timestamp: Date.now(),
          expiresIn: 7 * 24 * 60 * 60 * 1000
        };
        localStorage.setItem('userSession', JSON.stringify(sessionData));
        
        // Also store in old format for compatibility
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', authenticatedUser.email);
        localStorage.setItem('userRole', authenticatedUser.roles?.includes('admin') ? 'admin' : 'user');
        
        // Log login activity with IP
        try {
          // Fetch IP address
          let ipAddress: string | null = null;
          try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            ipAddress = ipData.ip || null;
          } catch { /* IP fetch is best-effort */ }

          await supabase.rpc('log_user_activity', {
            _user_id: authenticatedUser.id,
            _action: 'login',
            _description: `User logged in as ${authenticatedUser.roles?.join(', ') || 'User'}`,
            _ip_address: ipAddress,
            _user_agent: navigator.userAgent,
            _metadata: { roles: authenticatedUser.roles || [] }
          });

          // Update last_login timestamp
          await supabase.rpc('update_last_login', { _user_id: authenticatedUser.id });
        } catch (logErr) {
          console.warn('[useAuth] Failed to log login activity:', logErr);
        }

        toast({
          title: "Success",
          description: `Logged in successfully as ${authenticatedUser.roles?.join(', ') || 'User'}`,
        });
        
        // Navigate using history API to avoid full page reload blink
        // The AuthProvider will detect the user state change and render children
        setTimeout(() => {
          window.history.pushState({}, '', '/dashboard');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, 300);
        
        return true;
      } else {
        toast({
          title: "Error",
          description: "Invalid email/username or password. Please check your credentials and try again.",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: "Login failed. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    // Log logout activity before clearing session
    try {
      const sessionStr = localStorage.getItem('userSession');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        const userId = session?.user?.id;
        if (userId) {
          await supabase.rpc('log_user_activity', {
            _user_id: userId,
            _action: 'logout',
            _description: 'User logged out',
            _ip_address: null,
            _user_agent: navigator.userAgent,
            _metadata: {}
          });
        }
      }
    } catch (logErr) {
      console.warn('[useAuth] Failed to log logout activity:', logErr);
    }

    setUser(null);
    localStorage.removeItem('userSession');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userPermissions');
    
    toast({
      title: "Success",
      description: "Logged out successfully",
    });
  };

  const hasRole = (role: string): boolean => {
    if (!user?.roles) {
      return false;
    }
    
    return user.roles.some(userRole => 
      userRole.toLowerCase() === role.toLowerCase()
    );
  };

  const isAdmin = hasRole('admin') || hasRole('super admin');

  const refreshUser = async () => {
    try {
      if (!user?.id) return;

      // Fetch updated user data including avatar_url
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, username, email, first_name, last_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Get user roles
      const { data: userWithRoles } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: user.id
        });

      let roles: string[] = user.roles || [];
      if (userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0] as UserWithRoles;
        if (userRoleData.roles && Array.isArray(userRoleData.roles)) {
          roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
        }
      }

      // Update user state with fresh data
      const updatedUser: User = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        firstName: userData.first_name || undefined,
        lastName: userData.last_name || undefined,
        avatar_url: userData.avatar_url || undefined,
        roles
      };

      setUser(updatedUser);

      // Update localStorage
      const sessionData = {
        user: updatedUser,
        timestamp: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000
      };
      localStorage.setItem('userSession', JSON.stringify(sessionData));
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  // Restore session on mount
  useEffect(() => {
    restoreSessionFromStorage();
  }, []);

  // Periodic force-logout check (every 30 seconds)
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(async () => {
      const savedSession = localStorage.getItem('userSession');
      if (!savedSession) return;
      const sessionData = JSON.parse(savedSession);
      const shouldLogout = await checkForceLogout(user.id, sessionData.timestamp);
      if (shouldLogout) {
        setUser(null);
        localStorage.removeItem('userSession');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userPermissions');
        toast({
          title: "Session Expired",
          description: "Your account has been updated or removed. Please log in again.",
          variant: "destructive",
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  // Sync user to localStorage
  useEffect(() => {
    if (user) {
      const sessionData = {
        user,
        timestamp: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000
      };
      localStorage.setItem('userSession', JSON.stringify(sessionData));
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isLoading, 
      hasRole, 
      isAdmin,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}
