
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AuthCheckProps {
  children: React.ReactNode;
}

export function AuthCheck({ children }: AuthCheckProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = () => {
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userEmail = localStorage.getItem('userEmail');
      
      if (isLoggedIn === 'true' && userEmail) {
        // Check if user is admin (demo credentials)
        const isAdmin = userEmail === 'blynkvirtualtechnologiespvtld@gmail.com';
        
        // Store admin status for permission system
        if (isAdmin) {
          localStorage.setItem('userRole', 'admin');
          localStorage.setItem('userPermissions', JSON.stringify([
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
          ]));
        }
        
        setIsAuthenticated(true);
      } else {
        navigate('/website/login');
      }
    };

    checkAuth();
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
