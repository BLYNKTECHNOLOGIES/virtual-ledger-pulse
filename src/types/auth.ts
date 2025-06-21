
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

export interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
}
