import { ReactNode, useState, useEffect, createContext, useContext } from 'react';
import { Login } from './auth/Login';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ValidationUser, UserWithRoles, User, AuthContextType } from '@/types/auth';

// Create and export the AuthContext
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

function AuthHookProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const authenticateUser = async (email: string, password: string): Promise<User | null> => {
    try {
      console.log('=== AUTHENTICATION DEBUG START ===');
      console.log('Authenticating user with email:', email);
      console.log('Password length:', password.length);

      // First, let's check if the user exists in the database
      console.log('Step 1: Checking if user exists in database...');
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id, username, email, status, password_hash')
        .eq('email', email.trim().toLowerCase())
        .single();

      console.log('User existence check result:', { existingUser, userCheckError });

      if (userCheckError) {
        console.error('Error checking user existence:', userCheckError);
        if (userCheckError.code === 'PGRST116') {
          console.log('User not found in database');
          return null;
        }
        throw userCheckError;
      }

      if (!existingUser) {
        console.log('No user found with that email');
        return null;
      }

      console.log('User found:', {
        id: existingUser.id,
        email: existingUser.email,
        status: existingUser.status,
        hasPasswordHash: !!existingUser.password_hash
      });

      // Step 2: Use the validate_user_credentials function
      console.log('Step 2: Validating credentials using RPC function...');
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_user_credentials', {
          input_username: email.trim().toLowerCase(),
          input_password: password
        });

      console.log('Validation result:', { validationResult, validationError });

      if (validationError) {
        console.error('Validation error:', validationError);
        return null;
      }

      // Handle array response from validate_user_credentials
      if (!Array.isArray(validationResult) || validationResult.length === 0) {
        console.log('Invalid credentials - no validation result');
        return null;
      }

      const validationData = validationResult[0] as ValidationUser;
      console.log('Validation data:', validationData);
      
      if (!validationData?.is_valid) {
        console.log('Credentials are invalid according to validation function');
        return null;
      }

      console.log('Step 3: Credentials validated successfully, fetching user roles...');

      // Get user with roles using the existing function
      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      console.log('User with roles result:', { userWithRoles, userRolesError });

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
      console.log('=== AUTHENTICATION DEBUG END ===');
      return authenticatedUser;
    } catch (error) {
      console.error('Authentication error:', error);
      console.log('=== AUTHENTICATION DEBUG END (ERROR) ===');
      return null;
    }
  };

  const restoreSessionFromStorage = async () => {
    try {
      console.log('Attempting to restore session from storage...');
      
      // Check localStorage for custom session
      const savedSession = localStorage.getItem('userSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const now = Date.now();
        
        // Check if session is still valid (not expired) - extend to 7 days
        if (sessionData.timestamp && (now - sessionData.timestamp) < sessionData.expiresIn) {
          console.log('Restoring user session from localStorage:', sessionData.user);
          setUser(sessionData.user);
          setIsLoading(false);
          return;
        } else {
          console.log('Session expired, removing from storage');
          localStorage.removeItem('userSession');
        }
      }
      
      console.log('No valid session found in storage');
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
        
        // Store in localStorage with longer expiration (7 days)
        const sessionData = {
          user: authenticatedUser,
          timestamp: Date.now(),
          expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
        };
        localStorage.setItem('userSession', JSON.stringify(sessionData));
        console.log('Session stored in localStorage:', sessionData);
        
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
        console.log('Authentication failed - no authenticated user returned');
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
    console.log('Logging out user');
    setUser(null);
    localStorage.removeItem('userSession');
    
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
  }, []); // Remove user dependency to prevent logout loops

  // Update session in localStorage whenever user changes (but not on initial load)
  useEffect(() => {
    if (user) {
      const sessionData = {
        user,
        timestamp: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
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

function AuthContent({ children }: AuthProviderProps) {
  const { user, login, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return <>{children}</>;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <AuthHookProvider>
      <AuthContent>{children}</AuthContent>
    </AuthHookProvider>
  );
}

// Create a custom hook that uses the context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
