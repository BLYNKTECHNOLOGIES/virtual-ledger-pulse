
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

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
      const validationData = Array.isArray(validationResult) ? validationResult[0] : validationResult;
      
      if (!validationData || !validationData.is_valid) {
        console.log('Invalid credentials');
        return null;
      }

      // Get user with roles using the existing function
      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      console.log('User with roles:', { userWithRoles, userRolesError });

      if (userRolesError || !userWithRoles || userWithRoles.length === 0) {
        console.error('Failed to get user with roles:', userRolesError);
        return null;
      }

      const userData = userWithRoles[0];
      
      // Safely handle roles which might be a JSON array
      let roles: string[] = [];
      if (userData.roles && typeof userData.roles === 'object') {
        if (Array.isArray(userData.roles)) {
          roles = userData.roles.map((role: any) => role.name || role).filter(Boolean);
        } else if (typeof userData.roles === 'string') {
          try {
            const parsedRoles = JSON.parse(userData.roles);
            if (Array.isArray(parsedRoles)) {
              roles = parsedRoles.map((role: any) => role.name || role).filter(Boolean);
            }
          } catch (e) {
            console.warn('Could not parse roles JSON:', e);
          }
        }
      }

      const authenticatedUser: User = {
        id: userData.user_id,
        username: userData.username,
        email: userData.email,
        firstName: userData.first_name || undefined,
        lastName: userData.last_name || undefined,
        roles
      };

      console.log('User authenticated successfully:', authenticatedUser);
      return authenticatedUser;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  };

  const login = async (credentials: { email: string; password: string }): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const authenticatedUser = await authenticateUser(credentials.email, credentials.password);
      
      if (authenticatedUser) {
        setUser(authenticatedUser);
        localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
        
        toast({
          title: "Success",
          description: "Logged in successfully",
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

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    toast({
      title: "Success",
      description: "Logged out successfully",
    });
  };

  useEffect(() => {
    // Check for existing session on app load
    const checkSession = async () => {
      try {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          // Verify the saved user still exists and is active
          const { data: userData, error } = await supabase
            .from('users')
            .select('id, status')
            .eq('id', parsedUser.id)
            .eq('status', 'ACTIVE')
            .single();

          if (!error && userData) {
            setUser(parsedUser);
          } else {
            localStorage.removeItem('currentUser');
          }
        }
      } catch (error) {
        console.error('Session check error:', error);
        localStorage.removeItem('currentUser');
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
