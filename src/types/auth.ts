
export interface ValidationUser {
  user_id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status: string;
  is_valid: boolean;
}

export interface UserWithRoles {
  user_id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  created_at?: string;
  roles?: any; // This will be JSON from Supabase
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
}

// Add the correct database User type
export interface DatabaseUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  email_verified?: boolean;
  last_login?: string;
  failed_login_attempts?: number;
  account_locked_until?: string;
  created_at: string;
  updated_at: string;
  password_hash: string;
  role_id?: string;
  role?: {
    id: string;
    name: string;
    description?: string;
  };
}

export interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
}
