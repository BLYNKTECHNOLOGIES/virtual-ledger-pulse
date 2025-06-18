import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  created_at: string;
  permissions?: string[];
  roles?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  users: User[];
  addUser: (userData: Omit<User, 'id' | 'created_at'>) => Promise<void>;
  updateUser: (id: string, userData: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  userHasPermission: (permission: string) => boolean;
  refreshUserPermissions: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      console.log('=== REFRESHING USERS ===');
      setLoading(true);

      console.log('Fetching users from database...');
      const { data: usersData, error } = await supabase
        .from('users')
        .select(`
          id,
          username,
          email,
          first_name,
          last_name,
          phone,
          status,
          created_at
        `)
        .order('created_at', { ascending: false });

      console.log('Raw query result:', { data: usersData, error });

      if (error) {
        console.error('Error fetching users:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        // Don't throw error, just log it and set empty array
        setUsers([]);
        return;
      }

      console.log('Users fetched from DB:', usersData);

      // Transform the data to match the expected User interface
      const transformedUsers = usersData?.map(userData => ({
        id: userData.id,
        username: userData.username || '',
        email: userData.email || '',
        first_name: userData.first_name || undefined,
        last_name: userData.last_name || undefined,
        phone: userData.phone || undefined,
        status: userData.status || 'ACTIVE',
        created_at: new Date(userData.created_at).toLocaleDateString('en-GB'),
      })) || [];

      console.log('Transformed users:', transformedUsers);
      console.log('Setting users state with', transformedUsers.length, 'users');
      setUsers(transformedUsers);
    } catch (error: any) {
      console.error('Error in refreshUsers:', error);
      setUsers([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('=== AUTH PROVIDER INIT ===');
    
    // Check for stored authentication on app load
    const storedUser = localStorage.getItem('currentUser');
    console.log('Stored user:', storedUser);
    
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      console.log('Setting user from localStorage:', parsedUser);
      // Load permissions for the user
      refreshUserPermissions(parsedUser.id);
    }
    
    // Load all users only once on mount
    refreshUsers();
  }, [refreshUsers]);

  const refreshUserPermissions = useCallback(async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_permissions', { user_uuid: targetUserId });

      if (error) {
        console.error('Error fetching permissions:', error);
        return;
      }

      const permissions = data?.map((item: any) => item.permission) || [];
      
      setUser(prevUser => {
        if (prevUser) {
          const updatedUser = { ...prevUser, permissions };
          localStorage.setItem('currentUser', JSON.stringify(updatedUser));
          return updatedUser;
        }
        return prevUser;
      });
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    }
  }, [user?.id]);

  const login = async (credentials: { username: string; password: string }) => {
    try {
      console.log('Attempting login for:', credentials.username);
      
      const { data, error } = await supabase
        .rpc('validate_user_credentials', {
          input_username: credentials.username,
          input_password: credentials.password
        });

      if (error) {
        console.error('Login RPC error:', error);
        throw error;
      }

      console.log('Login response:', data);

      if (data && data.length > 0 && data[0].is_valid) {
        const userData = data[0];
        const foundUser: User = {
          id: userData.user_id,
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          status: userData.status,
          created_at: new Date().toLocaleDateString('en-GB')
        };

        console.log('Setting authenticated user:', foundUser);
        setUser(foundUser);
        localStorage.setItem('currentUser', JSON.stringify(foundUser));
        
        // Load user permissions from Supabase
        await refreshUserPermissions(foundUser.id);

        // Update last login
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', foundUser.id);

        // Refresh users list after successful login
        await refreshUsers();

      } else {
        throw new Error("Invalid username or password");
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || "Login failed");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const addUser = async (userData: Omit<User, 'id' | 'created_at'>) => {
    try {
      // Generate a default password (should be changed on first login)
      const defaultPassword = 'password123';
      
      const { data, error } = await supabase
        .from('users')
        .insert({
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
          password_hash: `crypt('${defaultPassword}', gen_salt('bf'))`, // This should use proper password hashing
          status: userData.status || 'ACTIVE',
          email_verified: false
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh users list
      await refreshUsers();
    } catch (error: any) {
      console.error('Error adding user:', error);
      throw error;
    }
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
          status: userData.status
        })
        .eq('id', id);

      if (error) throw error;

      // Refresh users list
      await refreshUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      throw error;
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Refresh users list
      await refreshUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      throw error;
    }
  };

  const userHasPermission = (permission: string): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    users,
    addUser,
    updateUser,
    deleteUser,
    userHasPermission,
    refreshUserPermissions,
    refreshUsers,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
