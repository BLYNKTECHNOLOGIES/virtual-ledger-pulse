
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export function LoginPage() {
  const [email, setEmail] = useState('blynkvirtualtechnologiespvtld@gmail.com');
  const [password, setPassword] = useState('Blynk@0717');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      // Check demo admin credentials first
      if (email.toLowerCase() === 'blynkvirtualtechnologiespvtld@gmail.com' && password === 'Blynk@0717') {
        // Store session data for demo admin
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email.toLowerCase());
        localStorage.setItem('userRole', 'admin');
        
        // Set admin permissions
        const adminPermissions = [
          'dashboard_view',
          'sales_view', 'sales_manage',
          'purchase_view', 'purchase_manage',
          'bams_view', 'bams_manage',
          'clients_view', 'clients_manage',
          'leads_view', 'leads_manage',
          'user_management_view', 'user_management_manage',
          'hrms_view', 'hrms_manage',
          'payroll_view', 'payroll_manage',
          'compliance_view', 'compliance_manage',
          'stock_view', 'stock_manage',
          'accounting_view', 'accounting_manage',
          'video_kyc_view', 'video_kyc_manage',
          'kyc_approvals_view', 'kyc_approvals_manage',
          'statistics_view', 'statistics_manage'
        ];
        
        localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
        
        // Store user session in new format
        const sessionData = {
          user: {
            id: 'demo-admin-id',
            username: 'admin',
            email: email.toLowerCase(),
            firstName: 'Admin',
            lastName: 'User',
            roles: ['admin', 'Admin']
          },
          timestamp: Date.now(),
          expiresIn: 7 * 24 * 60 * 60 * 1000
        };
        localStorage.setItem('userSession', JSON.stringify(sessionData));
        
        console.log('Demo admin login successful');
        navigate('/dashboard');
        return;
      }

      // Try database authentication for other users
      console.log('Attempting database authentication for:', email);
      
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id, username, email, status, password_hash')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (userCheckError || !existingUser) {
        console.log('User not found in database');
        setError('Invalid email or password. Please check your credentials and try again.');
        return;
      }

      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_user_credentials', {
          input_username: email.trim().toLowerCase(),
          input_password: password
        });

      if (validationError || !validationResult || !Array.isArray(validationResult) || validationResult.length === 0) {
        console.log('Invalid credentials');
        setError('Invalid email or password. Please check your credentials and try again.');
        return;
      }

      const validationData = validationResult[0];
      
      if (!validationData?.is_valid) {
        console.log('Credentials are invalid');
        setError('Invalid email or password. Please check your credentials and try again.');
        return;
      }

      // Get user roles
      const { data: userWithRoles, error: userRolesError } = await supabase
        .rpc('get_user_with_roles', {
          user_uuid: validationData.user_id
        });

      let roles: string[] = [];
      if (!userRolesError && userWithRoles && Array.isArray(userWithRoles) && userWithRoles.length > 0) {
        const userRoleData = userWithRoles[0];
        if (userRoleData.roles) {
          if (Array.isArray(userRoleData.roles)) {
            roles = userRoleData.roles.map((role: any) => role.name || role).filter(Boolean);
          }
        }
      }

      if (roles.length === 0) {
        roles = ['user'];
      }

      const authenticatedUser = {
        id: validationData.user_id,
        username: validationData.username || email,
        email: validationData.email || email,
        firstName: validationData.first_name || undefined,
        lastName: validationData.last_name || undefined,
        roles
      };

      // Store session data
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', authenticatedUser.email);
      localStorage.setItem('userRole', authenticatedUser.roles?.includes('admin') ? 'admin' : 'user');
      
      // Store user session in new format
      const sessionData = {
        user: authenticatedUser,
        timestamp: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000
      };
      localStorage.setItem('userSession', JSON.stringify(sessionData));
      
      // Store permissions
      if (authenticatedUser.roles?.some(role => role.toLowerCase() === 'admin')) {
        const adminPermissions = [
          'dashboard_view',
          'sales_view', 'sales_manage',
          'purchase_view', 'purchase_manage',
          'bams_view', 'bams_manage',
          'clients_view', 'clients_manage',
          'leads_view', 'leads_manage',
          'user_management_view', 'user_management_manage',
          'hrms_view', 'hrms_manage',
          'payroll_view', 'payroll_manage',
          'compliance_view', 'compliance_manage',
          'stock_view', 'stock_manage',
          'accounting_view', 'accounting_manage',
          'video_kyc_view', 'video_kyc_manage',
          'kyc_approvals_view', 'kyc_approvals_manage',
          'statistics_view', 'statistics_manage'
        ];
        localStorage.setItem('userPermissions', JSON.stringify(adminPermissions));
      }

      console.log('User authenticated successfully:', authenticatedUser);
      navigate('/dashboard');
      
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
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
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
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
          
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Demo Credentials:</p>
            <p>Email: blynkvirtualtechnologiespvtld@gmail.com</p>
            <p>Password: Blynk@0717</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
