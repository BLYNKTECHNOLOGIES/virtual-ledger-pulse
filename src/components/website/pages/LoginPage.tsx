
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ForcedPasswordResetDialog } from '@/components/auth/ForcedPasswordResetDialog';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForcedReset, setShowForcedReset] = useState(false);
  const navigate = useNavigate();

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
          roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
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

      console.log('User authenticated successfully:', authenticatedUser);

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

      setSuccess('Correct password, redirecting to Dashboard...');
      setTimeout(() => navigate('/dashboard'), 1500);
      
    } catch (error: any) {
      console.error('Login error:', error);
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError') || error?.message?.includes('ERR_')) {
        setError('Network error — unable to reach the server. Please check your internet connection and try again.');
      } else if (error?.message?.includes('Username login is no longer supported')) {
        setError(error.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
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
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
                {success}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email or Username</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
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
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
          
        </CardContent>
      </Card>

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
