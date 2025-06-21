
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
      console.log('Authenticating user with email:', email);

      // Use the existing validate_user_credentials function
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_user_credentials', {
          input_username: email,
          input_password: password
        });

      console.log('Validation result:', { validationResult, validationError });

      if (validationError) {
        console.error('Validation error:', validationError);
        return null;
      }

      // Handle array response from validate_user_credentials
      if (!Array.isArray(validationResult) || validationResult.length === 0) {
        console.log('Invalid credentials - no user found');
        return null;
      }

      const validationData = validationResult[0] as ValidationUser;
      
      if (!validationData?.is_valid) {
        console.log('Invalid credentials');
        return null;
      }

      // Get user with roles using the existing function
      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      console.log('User with roles:', { userWithRoles, userRolesError });

      let roles: string[] = [];

      // Check if this is the demo admin user first
      const isDemoAdmin = email.toLowerCase() === 'blynkvirtualtechnologiespvtld@gmail.com';
      
      if (isDemoAdmin && validationData.is_valid) {
        // Always assign admin role for the demo credentials
        roles = ['admin', 'Admin'];
        console.log('Demo admin user detected, assigned admin roles:', roles);
      } else if (!userRolesError && userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0] as UserWithRoles;
        
        // Safely handle roles which might be a JSON array
        if (userRoleData.roles) {
          if (Array.isArray(userRoleData.roles)) {
            roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
          } else if (typeof userRoleData.roles === 'string') {
            try {
              const parsedRoles = JSON.parse(userRoleData.roles);
              if (Array.isArray(parsedRoles)) {
                roles = parsedRoles.map((role: any) => role.name || role).filter(Boolean);
              }
            } catch (e) {
              console.warn('Could not parse roles JSON:', e);
            }
          } else if (typeof userRoleData.roles === 'object') {
            // Handle case where roles is already an object/array
            const rolesArray = Array.isArray(userRoleData.roles) ? userRoleData.roles : [userRoleData.roles];
            roles = rolesArray.map((role: any) => role.name || role).filter(Boolean);
          }
        }
      }

      // Fallback: if no roles found but user is valid, assign basic user role (except for demo admin)
      if (roles.length === 0 && !isDemoAdmin) {
        roles = ['user'];
      }

      const authenticatedUser: User = {
        id: validationData.user_id,
        username: validationData.username || email,
        email: validationData.email || email,
        firstName: validationData.first_name || undefined,
        lastName: validationData.last_name || undefined,
        roles
      };

      console.log('User authenticated successfully:', authenticatedUser);
      console.log('User roles assigned:', roles);
      return authenticatedUser;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  };

  const restoreSessionFromStorage = async () => {
    try {
      console.log('Attempting to restore session from storage...');
      
      // First check localStorage for custom session
      const savedSession = localStorage.getItem('userSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const now = Date.now();
        
        // Check if session is still valid (not expired)
        if (sessionData.timestamp && (now - sessionData.timestamp) < sessionData.expiresIn) {
          console.log('Restoring user session from localStorage:', sessionData.user);
          setUser(sessionData.user);
          return;
        } else {
          console.log('Session expired, removing from storage');
          localStorage.removeItem('userSession');
        }
      }
      
      // Then check Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('Supabase session check:', { session, error });
      
      if (session?.user && !error) {
        // If we have a Supabase session but no custom user data, 
        // we need to authenticate through our custom system
        console.log('Found Supabase session, checking custom auth...');
        // Note: We can't re-authenticate without password, so we'll clear the session
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('Session restoration error:', error);
      localStorage.removeItem('userSession');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: { email: string; password: string }): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const authenticatedUser = await authenticateUser(credentials.email, credentials.password);
      
      if (authenticatedUser) {
        console.log('Setting user in state:', authenticatedUser);
        setUser(authenticatedUser);
        
        // Store in localStorage with expiration (24 hours)
        const sessionData = {
          user: authenticatedUser,
          timestamp: Date.now(),
          expiresIn: 24 * 60 * 60 * 1000 // 24 hours
        };
        localStorage.setItem('userSession', JSON.stringify(sessionData));
        console.log('Session stored in localStorage:', sessionData);
        
        // Also create a Supabase session for consistency
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password
        });
        
        if (signInError) {
          console.warn('Could not create Supabase session, but custom auth succeeded:', signInError);
        }
        
        const isUserAdmin = authenticatedUser.roles?.some(role => 
          role.toLowerCase() === 'admin'
        ) || false;
        
        console.log('Is user admin?', isUserAdmin);
        console.log('User roles for admin check:', authenticatedUser.roles);
        
        toast({
          title: "Success",
          description: `Logged in successfully as ${isUserAdmin ? 'Administrator' : 'User'}`,
        });
        
        return true;
      } else {
        toast({
          title: "Error",
          description: "Invalid email/username or password",
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
    console.log('Logging out user');
    setUser(null);
    localStorage.removeItem('userSession');
    
    // Also sign out from Supabase if there's a session
    await supabase.auth.signOut();
    
    toast({
      title: "Success",
      description: "Logged out successfully",
    });
  };

  const hasRole = (role: string): boolean => {
    if (!user?.roles) {
      console.log('No user or roles found for hasRole check');
      return false;
    }
    
    const hasRoleResult = user.roles.some(userRole => 
      userRole.toLowerCase() === role.toLowerCase()
    );
    
    console.log(`Checking if user has role '${role}':`, hasRoleResult);
    console.log('User roles:', user.roles);
    
    return hasRoleResult;
  };

  const isAdmin = hasRole('admin');

  useEffect(() => {
    // Restore session on app load
    restoreSessionFromStorage();

    // Listen for Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Supabase auth state change:', event, session);
      
      if (event === 'SIGNED_OUT' || !session) {
        // If signed out from Supabase, also clear our custom session
        setUser(null);
        localStorage.removeItem('userSession');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Update session in localStorage whenever user changes
  useEffect(() => {
    if (user) {
      const sessionData = {
        user,
        timestamp: Date.now(),
        expiresIn: 24 * 60 * 60 * 1000 // 24 hours
      };
      localStorage.setItem('userSession', JSON.stringify(sessionData));
      console.log('Updated session in localStorage:', sessionData);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isLoading, 
      hasRole, 
      isAdmin 
    }}>
      {children}
    </AuthContext.Provider>
  );
}
