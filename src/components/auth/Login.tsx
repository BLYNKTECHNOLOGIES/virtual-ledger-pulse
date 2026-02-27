
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';
import { RegistrationDialogV2 } from './RegistrationDialogV2';

interface LoginProps {
  onLogin: (credentials: { email: string; password: string }) => Promise<boolean>;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);
    
    try {
      const success = await onLogin({ email, password });
      if (!success) {
        setLoginError('Invalid email/username or password. Please check your credentials and try again.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {loginError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700 font-medium">Login Failed</p>
                <p className="text-xs text-red-600 mt-1">{loginError}</p>
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
                  onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                  className="pl-10"
                  required
                  autoComplete="off"
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
                  onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                  className="pl-10 pr-10"
                  required
                  autoComplete="off"
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
          
          <div className="mt-4 text-center space-y-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Request New Password
            </Button>
            
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">Don't have an account?</span>
              <Button
                variant="link"
                type="button"
                onClick={() => setShowRegistration(true)}
                className="text-sm p-0 h-auto font-medium"
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Register Now
              </Button>
            </div>
          </div>
        </CardContent>
        
        <ForgotPasswordDialog
          open={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
        />
        
        <RegistrationDialogV2
          open={showRegistration}
          onOpenChange={setShowRegistration}
        />
      </Card>
    </div>
  );
}
