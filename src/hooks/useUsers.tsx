
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
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch users error:', error);
        throw error;
      }
      
      console.log('Fetched users:', data);
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
  }) => {
    try {
      console.log('Creating user with data:', userData);
      console.log('Current authenticated user:', user);
      console.log('Is admin:', isAdmin);
      console.log('Has admin role:', hasRole('admin'));

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

      // First, create a Supabase auth user to ensure proper authentication integration
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            first_name: userData.first_name,
            last_name: userData.last_name,
            username: userData.username,
          }
        }
      });

      if (authError) {
        console.error('Auth user creation error:', authError);
        throw new Error('Failed to create authentication user: ' + authError.message);
      }

      console.log('Auth user created:', authData);

      // Create a simple password hash for the custom users table
      const passwordHash = btoa(userData.password); // Simple base64 encoding for demo

      // Insert into the custom users table
      const { data, error } = await supabase
        .from('users')
        .insert([{
          id: authData.user?.id, // Use the same ID as the auth user
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name || null,
          last_name: userData.last_name || null,
          phone: userData.phone || null,
          password_hash: passwordHash,
          status: 'ACTIVE',
          email_verified: false,
          failed_login_attempts: 0
        }])
        .select()
        .single();

      if (error) {
        console.error('Insert user error:', error);
        
        // If the custom user creation fails, we should clean up the auth user
        if (authData.user) {
          console.log('Cleaning up auth user due to custom user creation failure');
          // Note: In a production app, you'd want to handle this cleanup properly
        }
        
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
