
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { DatabaseUser } from '@/types/auth';

type ValidStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

function isValidStatus(status: any): status is ValidStatus {
  return ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status);
}

export function useUsers() {
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user, isAdmin, hasRole } = useAuth();

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      console.log('=== FETCHING USERS DEBUG ===');
      console.log('Current auth user:', user);
      console.log('Is admin:', isAdmin);
      console.log('Has admin role:', hasRole('admin'));
      
      // Check if user is authenticated
      if (!user) {
        console.log('No authenticated user found');
        setUsers([]);
        return;
      }

      // Check Supabase session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('Supabase session:', sessionData.session);
      console.log('Session error:', sessionError);

      // Try to fetch all users with their roles
      console.log('Fetching all users from database...');
      
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select(`
          id,
          username,
          email,
          first_name,
          last_name,
          phone,
          avatar_url,
          status,
          email_verified,
          last_login,
          failed_login_attempts,
          account_locked_until,
          created_at,
          updated_at,
          password_hash,
          role_id,
          role:roles(
            id,
            name,
            description
          )
        `)
        .order('created_at', { ascending: false });

      console.log('Users query result:', allUsers);
      console.log('Users query error:', usersError);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      console.log(`Successfully fetched ${allUsers?.length || 0} users`);
      
      // Cast and validate the users data to match DatabaseUser type
      const validatedUsers = (allUsers || []).map((user) => ({
        ...user,
        status: isValidStatus(user.status) ? user.status : "INACTIVE" as ValidStatus, // fallback
      })) as DatabaseUser[];

      setUsers(validatedUsers);

    } catch (error: any) {
      console.error('Error in fetchUsers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
      setUsers([]);
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

      // Use the secure create_user_with_password function
      const { data, error } = await supabase.rpc('create_user_with_password', {
        _username: userData.username,
        _email: userData.email,
        _password: userData.password,
        _first_name: userData.first_name || null,
        _last_name: userData.last_name || null,
        _phone: userData.phone || null
      });

      if (error) {
        console.error('Create user RPC error:', error);
        throw error;
      }

      console.log('User created successfully with ID:', data);

      // If a role_id was specified, assign the role
      if (userData.role_id && data) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: data,
            role_id: userData.role_id
          });

        if (roleError) {
          console.warn('Role assignment failed:', roleError);
          // Don't throw here, user was created successfully
        }
      }

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
        .update({ 
          status: 'INACTIVE',
          updated_at: new Date().toISOString()
        })
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
    console.log('useUsers hook initialized, fetching users...');
    fetchUsers();
  }, [user]); // Add user as dependency

  return {
    users,
    isLoading,
    fetchUsers,
    createUser,
    deleteUser
  };
}
