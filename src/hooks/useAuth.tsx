
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

      // Query the users table directly with password verification
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          username,
          email,
          first_name,
          last_name,
          password_hash,
          status,
          user_roles!inner (
            roles!inner (
              name
            )
          )
        `)
        .eq('email', email)
        .eq('status', 'ACTIVE')
        .single();

      if (userError || !userData) {
        console.error('User lookup failed:', userError);
        // Try with username instead of email
        const { data: userByUsername, error: usernameError } = await supabase
          .from('users')
          .select(`
            id,
            username,
            email,
            first_name,
            last_name,
            password_hash,
            status,
            user_roles!inner (
              roles!inner (
                name
              )
            )
          `)
          .eq('username', email)
          .eq('status', 'ACTIVE')
          .single();

        if (usernameError || !userByUsername) {
          console.error('User not found by email or username');
          return null;
        }

        // Use the user found by username
        Object.assign(userData || {}, userByUsername);
      }

      console.log('User data retrieved:', userData);

      // Verify password using PostgreSQL's crypt function
      const { data: passwordCheck, error: passwordError } = await supabase
        .rpc('verify_password', {
          input_password: password,
          stored_hash: userData.password_hash
        });

      console.log('Password verification result:', { passwordCheck, passwordError });

      if (passwordError) {
        console.error('Password verification error:', passwordError);
        return null;
      }

      if (!passwordCheck) {
        console.log('Password verification failed - incorrect password');
        return null;
      }

      // Extract roles - handle the case where user_roles might be empty
      const roles = userData.user_roles?.map((ur: any) => ur.roles?.name).filter(Boolean) || [];

      const authenticatedUser: User = {
        id: userData.id,
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
