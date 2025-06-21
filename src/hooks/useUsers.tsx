
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
      console.log('Fetching all users from database...');
      
      // First, let's try a simple query to get all users
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      console.log('All users from database:', allUsers);

      // Now let's get users with their roles
      const { data: usersWithRoles, error: rolesError } = await supabase
        .from('users')
        .select(`
          *,
          role:roles(
            id,
            name,
            description
          )
        `)
        .order('created_at', { ascending: false });

      if (rolesError) {
        console.error('Error fetching users with roles:', rolesError);
        // If roles query fails, use the basic users data
        setUsers(allUsers || []);
      } else {
        console.log('Users with roles:', usersWithRoles);
        setUsers(usersWithRoles || []);
      }

    } catch (error: any) {
      console.error('Error in fetchUsers:', error);
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

      // Check if user is authenticated
      if (!user) {
        throw new Error('You must be logged in to create users');
      }

      // Check if user has admin permissions
      if (!isAdmin && !hasRole('admin') && !hasRole('user_management')) {
        throw new Error('You do not have permission to create users');
      }

      // Create a simple password hash for the custom users table
      const passwordHash = btoa(userData.password); // Simple base64 encoding for demo

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

      // Insert into the custom users table
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
