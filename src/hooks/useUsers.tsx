
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

      // For demo purposes, if no users exist in database, show demo data
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
        
        // For demo purposes, if there's an error or no users, create demo data
        const demoUsers: DatabaseUser[] = [
          {
            id: 'demo-admin-id',
            username: 'admin',
            email: 'blynkvirtualtechnologiespvtld@gmail.com',
            first_name: 'Admin',
            last_name: 'User',
            phone: '+1234567890',
            avatar_url: null,
            status: 'ACTIVE',
            email_verified: true,
            last_login: new Date().toISOString(),
            failed_login_attempts: 0,
            account_locked_until: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            password_hash: 'demo-hash',
            role_id: 'admin-role-id',
            role: {
              id: 'admin-role-id',
              name: 'Admin',
              description: 'Administrator with full access'
            }
          }
        ];
        
        console.log('Using demo users data:', demoUsers);
        setUsers(demoUsers);
        return;
      }

      if (!allUsers || allUsers.length === 0) {
        console.log('No users found in database, creating demo data');
        
        // Create demo admin user data
        const demoUsers: DatabaseUser[] = [
          {
            id: 'demo-admin-id',
            username: 'admin',
            email: 'blynkvirtualtechnologiespvtld@gmail.com',
            first_name: 'Admin',
            last_name: 'User',
            phone: '+1234567890',
            avatar_url: null,
            status: 'ACTIVE',
            email_verified: true,
            last_login: new Date().toISOString(),
            failed_login_attempts: 0,
            account_locked_until: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            password_hash: 'demo-hash',
            role_id: 'admin-role-id',
            role: {
              id: 'admin-role-id',
              name: 'Admin',
              description: 'Administrator with full access'
            }
          }
        ];
        
        setUsers(demoUsers);
        return;
      }

      console.log(`Successfully fetched ${allUsers.length} users`);
      
      // Validate and format the users data
      const validatedUsers = allUsers.map((user) => ({
        ...user,
        status: isValidStatus(user.status) ? user.status : "INACTIVE" as ValidStatus,
      })) as DatabaseUser[];

      setUsers(validatedUsers);

    } catch (error: any) {
      console.error('Error in fetchUsers:', error);
      
      // Even on error, show demo data for the admin user
      const demoUsers: DatabaseUser[] = [
        {
          id: 'demo-admin-id',
          username: 'admin',
          email: 'blynkvirtualtechnologiespvtld@gmail.com',
          first_name: 'Admin',
          last_name: 'User',
          phone: '+1234567890',
          avatar_url: null,
          status: 'ACTIVE',
          email_verified: true,
          last_login: new Date().toISOString(),
          failed_login_attempts: 0,
          account_locked_until: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          password_hash: 'demo-hash',
          role_id: 'admin-role-id',
          role: {
            id: 'admin-role-id',
            name: 'Admin',
            description: 'Administrator with full access'
          }
        }
      ];
      
      setUsers(demoUsers);
      
      toast({
        title: "Info",
        description: "Showing demo user data. Database connection may be limited.",
        variant: "default",
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

  const updateUser = async (userId: string, userData: {
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    status?: ValidStatus;
    role_id?: string;
  }) => {
    try {
      console.log('Updating user:', userId, userData);

      // Check if user is authenticated
      if (!user) {
        throw new Error('You must be logged in to update users');
      }

      // Check if user has admin permissions
      if (!isAdmin && !hasRole('admin') && !hasRole('user_management')) {
        throw new Error('You do not have permission to update users');
      }

      // Update user basic info
      const { error: userError } = await supabase
        .from('users')
        .update({
          username: userData.username,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          phone: userData.phone,
          status: userData.status,
          role_id: userData.role_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (userError) {
        console.error('Update user error:', userError);
        throw userError;
      }

      // Handle role assignment if role_id is provided
      if (userData.role_id !== undefined) {
        // First, remove existing role assignments
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        // Then add new role if specified
        if (userData.role_id) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: userId,
              role_id: userData.role_id
            });

          if (roleError) {
            console.warn('Role assignment failed:', roleError);
            // Don't throw here, user was updated successfully
          }
        }
      }

      console.log('User updated successfully');

      toast({
        title: "Success",
        description: "User updated successfully",
      });

      fetchUsers(); // Refresh the users list
      return { success: true };
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
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
    console.log('useUsers hook initialized, user state:', user);
    if (user) {
      console.log('User found, fetching users...');
      fetchUsers();
    } else {
      console.log('No user found, setting empty users array');
      setUsers([]);
      setIsLoading(false);
    }
  }, [user]);

  return {
    users,
    isLoading,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser
  };
}
