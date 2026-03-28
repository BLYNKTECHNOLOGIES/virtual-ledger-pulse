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

  /** Build a User object from public.users + roles */
  const buildUserFromUserId = async (userId: string, emailFallback: string): Promise<User | null> => {
    // Fetch profile from public.users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, email, first_name, last_name, avatar_url, status')
      .eq('id', userId)
      .single();

    if (userError || !userData) return null;

    // Block non-active users
    if (userData.status !== 'ACTIVE') return null;

    // Get roles
    const { data: userWithRoles } = await supabase
      .rpc('get_user_with_roles', { user_uuid: userId });

    let roles: string[] = [];
    if (userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
      const userRoleData = userWithRoles[0] as UserWithRoles;
      if (userRoleData.roles && Array.isArray(userRoleData.roles)) {
        roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
      }
    }

    if (roles.length === 0) {
      const { data: fallbackData } = await supabase
        .from('users')
        .select(`*, roles!role_id(id, name, description)`)
        .eq('id', userId)
        .single();
      if (fallbackData?.roles) {
        roles = [fallbackData.roles.name];
      }
    }

    if (roles.length === 0) roles = ['user'];

    return {
      id: userData.id,
      username: userData.username || emailFallback,
      email: userData.email || emailFallback,
      firstName: userData.first_name || undefined,
      lastName: userData.last_name || undefined,
      avatar_url: userData.avatar_url || undefined,
      roles
    };
  };

  const buildUserFromValidation = async (validationData: ValidationUser, emailFallback: string): Promise<User | null> => {
    return buildUserFromUserId(validationData.user_id, emailFallback);
  };

  /** Write compatibility localStorage entries so all 25+ files that read userSession continue working */
  const writeCompatibilitySession = (authenticatedUser: User) => {
    const sessionData = {
      user: authenticatedUser,
      timestamp: Date.now(),
      expiresIn: 7 * 24 * 60 * 60 * 1000
    };
    localStorage.setItem('userSession', JSON.stringify(sessionData));
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userEmail', authenticatedUser.email);
    localStorage.setItem('userRole', authenticatedUser.roles?.some(r => r.toLowerCase() === 'admin' || r.toLowerCase() === 'super admin') ? 'admin' : 'user');
  };

  const clearAllSessions = async () => {
    // Sign out from Supabase Auth
    try { await supabase.auth.signOut(); } catch { /* best effort */ }
    // Clear legacy localStorage
    localStorage.removeItem('userSession');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userPermissions');
  };

  const authenticateUser = async (email: string, password: string): Promise<User | null> => {
    try {
      const inputIdentifier = email.trim();
      const normalizedInput = inputIdentifier.toLowerCase();
      const isEmailLogin = normalizedInput.includes('@');

      // ═══════════════════════════════════════════════════
      // PATH A: Try Supabase Auth first (new path)
      // ═══════════════════════════════════════════════════
      if (isEmailLogin) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedInput,
          password
        });

        if (!authError && authData?.user) {
          // Supabase Auth succeeded — build user from public.users using the same UUID
          const builtUser = await buildUserFromUserId(authData.user.id, normalizedInput);
          if (builtUser) {
            return builtUser;
          }
          // If user exists in auth but not in public.users (shouldn't happen), fall through
        }
        // If Supabase Auth fails (wrong password, user not migrated yet), fall through to legacy
      }

      // ═══════════════════════════════════════════════════
      // PATH B: Legacy RPC authentication (fallback)
      // ═══════════════════════════════════════════════════
      const pickValidatedUser = (rows: ValidationUser[]): ValidationUser | null => {
        const validRows = rows.filter((row) => row?.is_valid);
        if (validRows.length === 0) return null;

        if (isEmailLogin) {
          return validRows.find((row) => row.email?.toLowerCase() === normalizedInput) ?? null;
        }

        return (
          validRows.find((row) => row.username?.toLowerCase() === normalizedInput) ??
          validRows.find((row) => row.email?.toLowerCase() === normalizedInput) ??
          null
        );
      };

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

      // Step 1: Try normal authentication via legacy RPC
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
      
      if (error) {
        if (error.code === 'PGRST116') {
          console.warn('[useAuth] User not found in DB, forcing logout');
          return true;
        }
        console.warn('[useAuth] checkForceLogout query error (transient, skipping):', error.message);
        return false;
      }
      
      if (!data) return false;
      
      if (data.status === 'SUSPENDED' || data.status === 'INACTIVE') return true;
      
      if (data.force_logout_at) {
        const forceLogoutTime = new Date(data.force_logout_at).getTime();
        if (sessionTimestamp < forceLogoutTime) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('[useAuth] checkForceLogout exception (transient, skipping):', err);
      return false;
    }
  };

  const restoreSessionFromStorage = async () => {
    try {
      // ═══════════════════════════════════════════════════
      // PATH A: Try restoring from Supabase Auth session
      // ═══════════════════════════════════════════════════
      const { data: { session: supaSession } } = await supabase.auth.getSession();
      if (supaSession?.user) {
        const builtUser = await buildUserFromUserId(supaSession.user.id, supaSession.user.email || '');
        if (builtUser) {
          // Check force logout
          const savedSession = localStorage.getItem('userSession');
          const sessionTimestamp = savedSession ? JSON.parse(savedSession).timestamp || Date.now() : Date.now();
          const shouldLogout = await checkForceLogout(builtUser.id, sessionTimestamp);
          if (shouldLogout) {
            await clearAllSessions();
            toast({
              title: "Session Expired",
              description: "Your account has been updated or removed. Please log in again.",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
          setUser(builtUser);
          writeCompatibilitySession(builtUser);
          setIsLoading(false);
          return;
        }
      }

      // ═══════════════════════════════════════════════════
      // PATH B: Fallback to legacy localStorage session
      // ═══════════════════════════════════════════════════
      const savedSession = localStorage.getItem('userSession');
      
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const now = Date.now();
        
        if (sessionData.timestamp && (now - sessionData.timestamp) < sessionData.expiresIn) {
          const shouldLogout = await checkForceLogout(sessionData.user?.id, sessionData.timestamp);
          if (shouldLogout) {
            await clearAllSessions();
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
        writeCompatibilitySession(authenticatedUser);
        
        // Log login activity with IP
        try {
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

          await supabase.rpc('update_last_login', { _user_id: authenticatedUser.id });
        } catch (logErr) {
          console.warn('[useAuth] Failed to log login activity:', logErr);
        }

        toast({
          title: "Success",
          description: `Logged in successfully as ${authenticatedUser.roles?.join(', ') || 'User'}`,
        });
        
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
    await clearAllSessions();
    
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

      const updatedUser = await buildUserFromUserId(user.id, user.email);
      if (updatedUser) {
        setUser(updatedUser);
        writeCompatibilitySession(updatedUser);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  // Restore session on mount
  useEffect(() => {
    restoreSessionFromStorage();
  }, []);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('userSession');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userPermissions');
      }
    });

    return () => subscription.unsubscribe();
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
        await clearAllSessions();
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
