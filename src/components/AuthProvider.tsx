
import { ReactNode } from 'react';
import { AuthProvider as AuthHookProvider, useAuth } from '@/hooks/useAuth';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthContent({ children }: AuthProviderProps) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
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
