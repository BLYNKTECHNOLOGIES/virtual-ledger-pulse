
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ForcedPasswordResetDialog } from '@/components/auth/ForcedPasswordResetDialog';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { RegisterUserDialog } from '@/components/auth/RegisterUserDialog';
import blynkIcon from '@/assets/brand/blynk-icon.svg';
import blynkLogoWhite from '@/assets/brand/blynk-logo-white.svg';

/** A single CSS 3D cube used in the animated backdrop. */
function Cube({
  size,
  className,
  duration,
  style,
}: {
  size: number;
  className?: string;
  duration: number;
  style?: React.CSSProperties;
}) {
  const faces = ['f-front', 'f-back', 'f-right', 'f-left', 'f-top', 'f-bottom'];
  return (
    <div
      className={`cube ${className ?? ''}`}
      style={{ width: size, height: size, ['--h' as string]: `${size / 2}px`, ...style }}
    >
      <div className="cube-inner" style={{ animationDuration: `${duration}s` }}>
        {faces.map((f) => (
          <div key={f} className={`face ${f}`} />
        ))}
      </div>
    </div>
  );
}

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[hsl(231_45%_6%)] text-white">
      {/* ===== 3D animated backdrop ===== */}
      <div className="scene-3d pointer-events-none absolute inset-0 overflow-hidden">
        {/* base wash */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(231_50%_9%)] via-[hsl(231_45%_6%)] to-[hsl(255_50%_8%)]" />
        {/* aurora glow */}
        <div className="absolute -top-40 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-[hsl(231_81%_55%)]/25 blur-[140px] animate-aurora" />
        <div className="absolute bottom-0 -right-40 h-[32rem] w-[32rem] rounded-full bg-[hsl(265_80%_60%)]/20 blur-[130px] animate-aurora-slow" />

        {/* 3D perspective floor */}
        <div className="floor-3d" />

        {/* Floating 3D cubes */}
        <Cube size={90} duration={18} style={{ top: '14%', left: '12%' }} className="animate-float-y" />
        <Cube size={56} duration={13} style={{ top: '22%', right: '14%', animationDelay: '-2s' }} className="animate-float-y" />
        <Cube size={120} duration={26} style={{ bottom: '16%', left: '8%', animationDelay: '-4s' }} className="animate-float-y" />
        <Cube size={70} duration={16} style={{ bottom: '22%', right: '10%', animationDelay: '-1s' }} className="animate-float-y" />
        <Cube size={44} duration={11} style={{ top: '46%', left: '26%', animationDelay: '-3s' }} className="animate-float-y" />

        {/* twinkles */}
        {[
          { top: '18%', left: '40%', d: '0s' },
          { top: '30%', left: '72%', d: '1.2s' },
          { top: '68%', left: '34%', d: '2.1s' },
          { top: '58%', left: '64%', d: '0.6s' },
        ].map((s, i) => (
          <span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white animate-twinkle"
            style={{ top: s.top, left: s.left, animationDelay: s.d }}
          />
        ))}

        {/* vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,hsl(231_45%_4%)_100%)]" />
      </div>

      {/* ===== Centered login form ===== */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div
          className="login-rise w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-7 sm:p-9 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          style={{ animationDelay: '0.1s' }}
        >
          {/* Brand + rotating ring */}
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-dashed border-white/20 animate-ring-spin" />
              <span className="absolute inset-1.5 rounded-full bg-gradient-to-br from-[hsl(231_81%_60%)] to-[hsl(265_80%_60%)] blur-[2px] opacity-70 animate-float-y" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(231_81%_60%)] to-[hsl(265_80%_60%)] shadow-xl animate-float-y">
                <img src={blynkIcon} alt="Blynk" className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-sm text-white/55">
              Sign in to your Blynk workspace to continue
            </p>
          </div>


            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="animate-fade-in rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {success && (
                <div className="animate-fade-in rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <div className="group relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-white/50 transition-colors group-focus-within:text-[hsl(231_81%_72%)]" />
                  <Input
                    id="email"
                    type="text"
                    placeholder="you@blynkex.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/30"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs font-medium text-[hsl(231_81%_75%)] transition-colors hover:text-white"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="group relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-white/50 transition-colors group-focus-within:text-[hsl(231_81%_72%)]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-white/10 bg-white/5 pl-10 pr-10 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/30"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 text-white/60 hover:bg-transparent hover:text-white"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="shimmer-btn h-12 w-full bg-gradient-to-r from-[hsl(231_81%_58%)] to-[hsl(265_80%_60%)] text-base font-semibold text-white shadow-lg shadow-[hsl(231_81%_50%)]/30 transition-transform hover:scale-[1.015] hover:from-[hsl(231_81%_54%)] hover:to-[hsl(265_80%_56%)] active:scale-[0.99]"
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

            <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-white/55">
              New here?{' '}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="font-semibold text-[hsl(231_81%_75%)] transition-colors hover:text-white"
              >
                Register
              </button>
            </div>
          </div>
        </div>

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
