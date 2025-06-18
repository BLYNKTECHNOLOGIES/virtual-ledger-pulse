
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created: string;
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  users: User[];
  addUser: (userData: Omit<User, 'id' | 'created'>) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users data - in a real app, this would come from a database
const mockUsers: User[] = [
  {
    id: "1",
    username: "admin",
    email: "admin@company.com",
    role: "Admin",
    created: "22/5/2025",
    status: "Active"
  },
  {
    id: "2",
    username: "architadamle48",
    email: "architadamle48@gmail.com",
    role: "User",
    created: "22/5/2025",
    status: "Active"
  },
  {
    id: "3",
    username: "govindyadav",
    email: "75666govindyadav@gmail.com",
    role: "User", 
    created: "13/5/2025",
    status: "Active"
  },
  {
    id: "4",
    username: "priyankathakur",
    email: "priyankathakur3303@gmail.com",
    role: "User",
    created: "12/5/2025", 
    status: "Active"
  },
  {
    id: "5",
    username: "saxenapriya78",
    email: "saxenapriya7826@gmail.com",
    role: "Admin",
    created: "12/5/2025",
    status: "Active"
  }
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(mockUsers);

  useEffect(() => {
    // Check for stored authentication on app load
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      // Fetch user permissions from Supabase
      fetchUserPermissions(userData.username);
    }
  }, []);

  const fetchUserPermissions = async (username: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_user_permissions', { username });

      if (error) {
        console.error('Error fetching user permissions:', error);
        return;
      }

      // Update user with permissions
      setUser(prev => prev ? {
        ...prev,
        permissions: data?.map((item: any) => item.permission) || []
      } : null);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  };

  const login = async (credentials: { username: string; password: string }) => {
    // Simulate authentication - replace with actual auth logic
    const foundUser = users.find(u => u.username === credentials.username);
    
    if (foundUser) {
      // In a real app, you'd verify the password here
      setUser(foundUser);
      localStorage.setItem('currentUser', JSON.stringify(foundUser));
      
      // Fetch user permissions
      await fetchUserPermissions(foundUser.username);
    } else {
      throw new Error("Invalid username or password");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const addUser = (userData: Omit<User, 'id' | 'created'>) => {
    const newUser: User = {
      ...userData,
      id: Date.now().toString(),
      created: new Date().toLocaleDateString('en-GB')
    };
    setUsers(prev => [...prev, newUser]);
  };

  const updateUser = (id: string, userData: Partial<User>) => {
    setUsers(prev => prev.map(user => 
      user.id === id ? { ...user, ...userData } : user
    ));
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(user => user.id !== id));
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    
    // Admin users have all permissions
    if (user.role === 'Admin') return true;
    
    // Check specific permissions
    return user.permissions?.includes(permission) || false;
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
    hasPermission
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
