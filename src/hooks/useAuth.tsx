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

  const buildUserFromValidation = async (validationData: ValidationUser, emailFallback: string): Promise<User | null> => {
    // Get user with roles using the RPC function
    const { data: userWithRoles, error: userRolesError } = await supabase
      .rpc('get_user_with_roles', { user_uuid: validationData.user_id });

    let roles: string[] = [];
    if (!userRolesError && userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
      const userRoleData = userWithRoles[0] as UserWithRoles;
      if (userRoleData.roles && Array.isArray(userRoleData.roles)) {
        roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
      }
    }

    if (roles.length === 0) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`*, roles!role_id(id, name, description)`)
        .eq('id', validationData.user_id)
        .single();
      if (!userError && userData?.roles) {
        roles = [userData.roles.name];
      }
    }

    if (roles.length === 0) roles = ['user'];

    const { data: userData } = await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', validationData.user_id)
      .single();

    return {
      id: validationData.user_id,
      username: validationData.username || emailFallback,
      email: validationData.email || emailFallback,
      firstName: validationData.first_name || undefined,
      lastName: validationData.last_name || undefined,
      avatar_url: userData?.avatar_url || undefined,
      roles
    };
  };

  const authenticateUser = async (email: string, password: string): Promise<User | null> => {
    try {
      const inputIdentifier = email.trim();
      const normalizedInput = inputIdentifier.toLowerCase();
      const isEmailLogin = normalizedInput.includes('@');

      const pickValidatedUser = (rows: ValidationUser[]): ValidationUser | null => {
        const validRows = rows.filter((row) => row?.is_valid);
        if (validRows.length === 0) return null;

        if (isEmailLogin) {
          // Security: when login input is an email, ONLY accept exact email matches.
          return validRows.find((row) => row.email?.toLowerCase() === normalizedInput) ?? null;
        }

        return (
          validRows.find((row) => row.username?.toLowerCase() === normalizedInput) ??
          validRows.find((row) => row.email?.toLowerCase() === normalizedInput) ??
          null
        );
      };

      // Helper: RPC call with timeout
      const rpcWithTimeout = async (rpcPromise: PromiseLike<{ data: any; error: any }>, timeoutMs = 15000): Promise<{ data: any; error: any }> => {
        let timer: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
          timer = setTimeout(() => resolve({ data: null, error: { message: 'TIMEOUT' } }), timeoutMs);
        });
        const result = await Promise.race([
          Promise.resolve(rpcPromise).then(r => { clearTimeout(timer!); return r; }),
          timeoutPromise
        ]);
        return result;
      };

      // Step 1: Try normal authentication
      const { data: validationResult, error: validationError } = await rpcWithTimeout(
        supabase.rpc('validate_user_credentials', {
          input_username: inputIdentifier,
          input_password: password
        })
      );

      if (validationError) {
        if (validationError.message === 'TIMEOUT') {
          throw new Error('Server is taking too long to respond. Please check your internet connection and try again.');
        }
        throw new Error('Unable to reach the server. Please try again in a moment.');
      }

      if (Array.isArray(validationResult) && validationResult.length > 0) {
        const matchedUser = pickValidatedUser(validationResult as ValidationUser[]);
        if (matchedUser) {
          return await buildUserFromValidation(matchedUser, inputIdentifier);
        }
      }

      // Step 2: Normal auth failed — try Super Admin impersonation
      // (Super Admin can log into any user's account using their own password)
      const { data: impersonationResult, error: impersonationError } = await rpcWithTimeout(
        supabase.rpc('try_super_admin_impersonation', {
          target_username: inputIdentifier,
          input_password: password
        })
      );

      if (!impersonationError && Array.isArray(impersonationResult) && impersonationResult.length > 0) {
        const impData = impersonationResult[0] as ValidationUser;

        if (isEmailLogin && impData?.email?.toLowerCase() !== normalizedInput) {
          return null;
        }

        if (!isEmailLogin) {
          const impUsername = impData?.username?.toLowerCase();
          const impEmail = impData?.email?.toLowerCase();
          if (impUsername !== normalizedInput && impEmail !== normalizedInput) {
            return null;
          }
        }

        if (impData?.is_valid) {
          return await buildUserFromValidation(impData, inputIdentifier);
        }
      }

      return null;
    } catch (error: any) {
      console.error('Authentication error:', error);
      // Re-throw user-facing errors (timeout, network) so Login component can display them
      if (error?.message?.includes('Server is taking too long') || error?.message?.includes('Unable to reach')) {
        throw error;
      }
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
      
      // CRITICAL: On transient errors (network hiccup, RLS timeout), do NOT force logout.
      // Only force logout on definitive signals (user deleted, suspended, or force_logout_at set).
      if (error) {
        // PGRST116 = "not found" → user was deleted → force logout
        if (error.code === 'PGRST116') {
          console.warn('[useAuth] User not found in DB, forcing logout');
          return true;
        }
        // Any other error (network, RLS, timeout) → assume transient, do NOT logout
        console.warn('[useAuth] checkForceLogout query error (transient, skipping):', error.message);
        return false;
      }
      
      if (!data) return false; // No data but no error = skip
      
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
    } catch (err) {
      // Network-level failures → do NOT force logout
      console.warn('[useAuth] checkForceLogout exception (transient, skipping):', err);
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

  // Sync user object to localStorage WITHOUT resetting the session timestamp.
  // Resetting timestamp here would create a race condition with checkForceLogout
  // and cause the session to appear "newer" than it actually is.
  useEffect(() => {
    if (user) {
      const existing = localStorage.getItem('userSession');
      let existingTimestamp = Date.now();
      let existingExpiry = 7 * 24 * 60 * 60 * 1000;
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          existingTimestamp = parsed.timestamp || existingTimestamp;
          existingExpiry = parsed.expiresIn || existingExpiry;
        } catch { /* use defaults */ }
      }
      const sessionData = {
        user,
        timestamp: existingTimestamp,
        expiresIn: existingExpiry
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
