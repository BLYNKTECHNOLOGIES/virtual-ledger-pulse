
import { ReactNode } from 'react';
import { Login } from './auth/Login';
import { AuthProvider as AuthHookProvider, useAuth } from '@/hooks/useAuth';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthContent({ children }: AuthProviderProps) {
  const { user, login, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return <>{children}</>;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <AuthHookProvider>
      <AuthContent>{children}</AuthContent>
    </AuthHookProvider>
  );
}

// Re-export useAuth for convenience
export { useAuth };
