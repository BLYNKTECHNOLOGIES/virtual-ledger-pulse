
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  created_at: string;
  role_id?: string;
  role?: {
    id: string;
    name: string;
    description?: string;
  };
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user, isAdmin, hasRole } = useAuth();

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          role:roles(
            id,
            name,
            description
          )
        `)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch users error:', error);
        throw error;
      }
      
      console.log('Fetched users with roles:', data);
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createUser = async (userData: {
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    password: string;
    role_id?: string;
  }) => {
    try {
      console.log('Creating user with data:', userData);
      console.log('Current authenticated user:', user);
      console.log('Is admin:', isAdmin);
      console.log('Has admin role:', hasRole('admin'));

      // Debug: Check Supabase auth session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('=== SUPABASE AUTH SESSION DEBUG ===');
      console.log('Session data:', sessionData.session);
      console.log('Session error:', sessionError);
      console.log('Access token:', sessionData.session?.access_token ? 'Present' : 'Missing');
      console.log('User ID from session:', sessionData.session?.user?.id);
      console.log('=== END SESSION DEBUG ===');

      // If no Supabase session, try to authenticate
      if (!sessionData.session) {
        console.log('No Supabase session found, attempting to sign in...');
        
        // Try to authenticate with our custom system first
        if (!user) {
          throw new Error('You must be logged in to create users');
        }

        // Create a Supabase session for the current user
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: userData.email,
          password: userData.password
        });

        if (signInError) {
          console.warn('Could not create Supabase session:', signInError);
          // Continue anyway, as we have custom auth
        } else {
          console.log('Created Supabase session:', signInData);
        }
      }

      // Check if user is authenticated with our custom auth system
      if (!user) {
        console.error('No authenticated user found');
        throw new Error('You must be logged in to create users');
      }

      // Check if user has admin permissions
      if (!isAdmin && !hasRole('admin') && !hasRole('user_management')) {
        console.error('Insufficient permissions');
        throw new Error('You do not have permission to create users');
      }

      console.log('Permission check passed, proceeding with user creation');

      // Create a simple password hash for the custom users table
      const passwordHash = btoa(userData.password); // Simple base64 encoding for demo

      // Debug: Check auth.uid() before insert
      const { data: currentUser } = await supabase.auth.getUser();
      console.log('Current Supabase user before insert:', currentUser);

      // Get default role if no role_id provided
      let roleId = userData.role_id;
      if (!roleId) {
        const { data: defaultRole } = await supabase
          .from('roles')
          .select('id')
          .eq('name', 'User')
          .single();
        roleId = defaultRole?.id;
      }

      // Insert into the custom users table - let it generate its own UUID
      const { data, error } = await supabase
        .from('users')
        .insert([{
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name || null,
          last_name: userData.last_name || null,
          phone: userData.phone || null,
          password_hash: passwordHash,
          status: 'ACTIVE',
          email_verified: false,
          failed_login_attempts: 0,
          role_id: roleId
        }])
        .select()
        .single();

      if (error) {
        console.error('Insert user error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }

      console.log('User created successfully:', data);

      toast({
        title: "Success",
        description: "User created successfully",
      });

      fetchUsers(); // Refresh the users list
      return { success: true, data };
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
      return { success: false, error };
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      console.log('Deactivating user:', userId);

      const { error } = await supabase
        .from('users')
        .update({ status: 'INACTIVE' })
        .eq('id', userId);

      if (error) {
        console.error('Update user error:', error);
        throw error;
      }

      console.log('User deactivated successfully');

      toast({
        title: "Success",
        description: "User deactivated successfully",
      });

      fetchUsers(); // Refresh the users list
      return { success: true };
    } catch (error: any) {
      console.error('Error deactivating user:', error);
      toast({
        title: "Error",
        description: "Failed to deactivate user: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
      return { success: false, error };
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    isLoading,
    fetchUsers,
    createUser,
    deleteUser
  };
}
