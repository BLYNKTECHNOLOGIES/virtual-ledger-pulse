
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ForcedPasswordResetDialog } from '@/components/auth/ForcedPasswordResetDialog';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { RegisterUserDialog } from '@/components/auth/RegisterUserDialog';
import { LivingSettlementField } from '@/components/website/LivingSettlementField';
import blynkLogoWhite from '@/assets/brand/blynk-logo-white.svg';


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
    <div className="flex min-h-screen w-full bg-[hsl(231_45%_5%)] text-white">
      {/* ===== LEFT — form side ===== */}
      <div className="relative flex w-full flex-col justify-center px-6 py-12 sm:px-10 lg:w-[44%] lg:px-14">
        {/* faint background treatment on mobile (visual side collapses) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] lg:hidden"
          style={{
            backgroundImage: 'radial-gradient(hsl(231 60% 78% / 0.10) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />

        <div className="login-rise relative z-10 mx-auto w-full max-w-[400px]">
          {/* Brand logo — top-left, exact white asset */}
          <img src={blynkLogoWhite} alt="Blynk" className="mb-10 h-7 w-auto" />

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-white/55">
            Sign in to your Blynk workspace to continue
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="flex items-start gap-2 text-xs text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 text-xs text-emerald-400" role="status">
                <span>{success}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-white/70">Email</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                placeholder="you@blynkex.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/40"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-white/70">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="rounded-sm text-xs font-medium text-[hsl(231_81%_78%)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(231_81%_60%)]/50"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/40"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full px-3 py-2 text-white/60 hover:bg-transparent hover:text-white"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full bg-gradient-to-r from-[hsl(231_81%_58%)] to-[hsl(265_80%_60%)] font-medium text-white shadow-lg shadow-[hsl(231_81%_50%)]/25 transition-transform hover:opacity-95 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm text-white/55">
            New here?{' '}
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="rounded-sm font-medium text-[hsl(231_81%_78%)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(231_81%_60%)]/50"
            >
              Register
            </button>
          </div>
        </div>
      </div>

      {/* ===== RIGHT — meaning side ===== */}
      <OpsGatewayVisual />

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
