
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
      console.log('=== AUTHENTICATION DEBUG START ===');
      console.log('Authenticating user with email:', email);

      // For demo admin user, use hardcoded credentials
      if (email.toLowerCase() === 'blynkvirtualtechnologiespvtld@gmail.com' && password === 'Blynk@0717') {
        const demoUser: User = {
          id: 'demo-admin-id',
          username: 'admin',
          email: email.toLowerCase(),
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin', 'Admin']
        };
        
        console.log('Demo admin user authenticated:', demoUser);
        return demoUser;
      }

      // For other users, try database authentication
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id, username, email, status, password_hash')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (userCheckError || !existingUser) {
        console.log('User not found in database');
        return null;
      }

      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_user_credentials', {
          input_username: email.trim().toLowerCase(),
          input_password: password
        });

      if (validationError || !validationResult || !Array.isArray(validationResult) || validationResult.length === 0) {
        console.log('Invalid credentials');
        return null;
      }

      const validationData = validationResult[0] as ValidationUser;
      
      if (!validationData?.is_valid) {
        console.log('Credentials are invalid');
        return null;
      }

      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      let roles: string[] = [];
      if (!userRolesError && userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0] as UserWithRoles;
        if (userRoleData.roles) {
          if (Array.isArray(userRoleData.roles)) {
            roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
          }
        }
      }

      if (roles.length === 0) {
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
      return authenticatedUser;
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  };

  const restoreSessionFromStorage = async () => {
    try {
      console.log('Attempting to restore session from storage...');
      
      // Check both localStorage methods
      const savedSession = localStorage.getItem('userSession');
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userEmail = localStorage.getItem('userEmail');
      
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const now = Date.now();
        
        if (sessionData.timestamp && (now - sessionData.timestamp) < sessionData.expiresIn) {
          console.log('Restoring user session from localStorage:', sessionData.user);
          setUser(sessionData.user);
          setIsLoading(false);
          return;
        }
      }
      
      // Check old localStorage format
      if (isLoggedIn === 'true' && userEmail) {
        if (userEmail.toLowerCase() === 'blynkvirtualtechnologiespvtld@gmail.com') {
          const demoUser: User = {
            id: 'demo-admin-id',
            username: 'admin',
            email: userEmail.toLowerCase(),
            firstName: 'Admin',
            lastName: 'User',
            roles: ['admin', 'Admin']
          };
          
          console.log('Restoring demo admin from old localStorage format:', demoUser);
          setUser(demoUser);
          
          // Update to new format
          const sessionData = {
            user: demoUser,
            timestamp: Date.now(),
            expiresIn: 7 * 24 * 60 * 60 * 1000
          };
          localStorage.setItem('userSession', JSON.stringify(sessionData));
          setIsLoading(false);
          return;
        }
      }
      
      console.log('No valid session found in storage');
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
        console.log('Setting user in state:', authenticatedUser);
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
        
        // Store permissions
        if (authenticatedUser.roles?.some(role => role.toLowerCase() === 'admin')) {
          const adminPermissions = [
            'dashboard_view',
            'sales_view', 'sales_manage',
            'purchase_view', 'purchase_manage',
            'bams_view', 'bams_manage',
            'clients_view', 'clients_manage',
            'leads_view', 'leads_manage',
            'user_management_view', 'user_management_manage',
            'hrms_view', 'hrms_manage',
            'payroll_view', 'payroll_manage',
            'compliance_view', 'compliance_manage',
            'stock_view', 'stock_manage',
            'accounting_view', 'accounting_manage',
            'video_kyc_view', 'video_kyc_manage',
            'kyc_approvals_view', 'kyc_approvals_manage',
            'statistics_view', 'statistics_manage'
          ];
          localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
        }
        
        console.log('Session stored successfully');
        
        toast({
          title: "Success",
          description: `Logged in successfully as ${authenticatedUser.roles?.includes('admin') ? 'Administrator' : 'User'}`,
        });
        
        return true;
      } else {
        console.log('Authentication failed');
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
    restoreSessionFromStorage();
  }, []);

  useEffect(() => {
    if (user) {
      const sessionData = {
        user,
        timestamp: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000
      };
      localStorage.setItem('userSession', JSON.stringify(sessionData));
      console.log('Updated session in localStorage');
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
