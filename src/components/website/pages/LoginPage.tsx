
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ForcedPasswordResetDialog } from '@/components/auth/ForcedPasswordResetDialog';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { RegisterUserDialog } from '@/components/auth/RegisterUserDialog';
import blynkIcon from '@/assets/brand/blynk-icon.svg';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForcedReset, setShowForcedReset] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const navigate = useNavigate();

  const writeCompatibilitySession = (authenticatedUser: {
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    roles: string[];
  }) => {
    localStorage.setItem('userSession', JSON.stringify({
      user: authenticatedUser,
      timestamp: Date.now(),
      expiresIn: 7 * 24 * 60 * 60 * 1000,
    }));
    localStorage.setItem('isLoggedIn', 'true');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail.includes('@')) {
        setError('Please use your email address to log in. Username login is no longer supported.');
        return;
      }

      // Clear only this browser's stale Supabase session before password login.
      // This prevents old refresh tokens from racing the new login request.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

      // ═══════════════════════════════════════════════════
      // Supabase Auth — single authentication path
      // ═══════════════════════════════════════════════════
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (authError) {
        if (authError.message?.includes('Invalid login credentials')) {
          setError('Incorrect email or password. Please check your credentials and try again.');
        } else {
          setError(authError.message || 'Login failed. Please try again.');
        }
        return;
      }

      if (!authData?.user) {
        setError('Login failed. Please try again.');
        return;
      }

      // Verify user exists in public.users and is active
      const { data: userData } = await supabase
        .from('users')
        .select('id, username, email, first_name, last_name, avatar_url, status')
        .eq('id', authData.user.id)
        .single();

      if (!userData || userData.status !== 'ACTIVE') {
        await supabase.auth.signOut();
        setError(userData ? `Your account is ${userData.status.toLowerCase()}. Please contact your administrator.` : 'Account not found. Please contact your administrator.');
        return;
      }

      // Get roles
      const { data: userWithRoles } = await supabase
        .rpc('get_user_with_roles', { user_uuid: userData.id });

      let roles: string[] = [];
      if (userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0];
        if (userRoleData.roles && Array.isArray(userRoleData.roles)) {
          roles = userRoleData.roles
            .map((role: unknown) => typeof role === 'string' ? role : (role as { name?: string }).name)
            .filter(Boolean) as string[];
        }
      }
      if (roles.length === 0) roles = ['user'];

      const authenticatedUser = {
        id: userData.id,
        username: userData.username || normalizedEmail,
        email: userData.email || normalizedEmail,
        firstName: userData.first_name || undefined,
        lastName: userData.last_name || undefined,
        roles
      };

      writeCompatibilitySession(authenticatedUser);


      // Check if user must change password (ERP onboarding or transition)
      const { data: pwdCheck } = await supabase
        .from('users')
        .select('force_password_change')
        .eq('id', authData.user.id)
        .single();

      if (pwdCheck?.force_password_change) {
        setShowForcedReset(true);
        return; // Don't redirect yet — force password change first
      }

      setSuccess('Correct password, redirecting...');
      // Honor a same-origin relative ?next= redirect (used by the MCP OAuth consent flow).
      const rawNext = new URLSearchParams(window.location.search).get('next');
      const safeNext =
        rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
      setTimeout(() => navigate(safeNext), 1500);
      
    } catch (error: unknown) {
      console.error('Login error:', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('ERR_')) {
        setError('Network error — unable to reach the server. Please check your internet connection and try again.');
      } else if (message.includes('Username login is no longer supported')) {
        setError(message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Staff Login</CardTitle>
          <CardDescription className="text-center">
            Blynk Technologies Private Limited
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-md text-sm">
                {success}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email or Username</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="text"
                  placeholder="Enter your email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-primary hover:text-primary/80 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>

          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            New here?{' '}
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="font-medium text-primary hover:text-primary/80 hover:underline"
            >
              Register
            </button>
          </div>
        </CardContent>
      </Card>

      <RegisterUserDialog open={showRegister} onOpenChange={setShowRegister} />


      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        defaultEmail={email.includes('@') ? email.trim().toLowerCase() : ''}
      />


      <ForcedPasswordResetDialog
        open={showForcedReset}
        onSuccess={() => {
          setShowForcedReset(false);
          setSuccess('Password updated successfully! Redirecting to Dashboard...');
          setTimeout(() => navigate('/dashboard'), 1500);
        }}
      />
    </div>
  );
}
