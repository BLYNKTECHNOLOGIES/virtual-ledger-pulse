import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Calendar, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "./MetricCard";
import { QuickAccessCard } from "./QuickAccessCard";

export function HRDashboard() {
  // Fetch HR-specific metrics
  const { data: hrMetrics } = useQuery({
    queryKey: ['hr-metrics'],
    queryFn: async () => {
      const { data: employees } = await supabase
        .from('employees')
        .select('status, onboarding_completed, created_at');
      
      const activeEmployees = employees?.filter(e => e.status === 'ACTIVE').length || 0;
      const pendingOnboarding = employees?.filter(e => !e.onboarding_completed).length || 0;
      
      const { data: pendingApplicants } = await supabase
        .from('job_applicants')
        .select('id')
        .eq('status', 'APPLIED');

      return {
        totalEmployees: employees?.length || 0,
        activeEmployees,
        pendingOnboarding,
        pendingApplicants: pendingApplicants?.length || 0
      };
    }
  });

  const quickLinks = [
    { title: "Add Employee", description: "Onboard new staff", href: "/hrms", icon: "users" },
    { title: "View Payroll", description: "Manage salaries", href: "/payroll", icon: "package" },
    { title: "Recruitment", description: "Hire candidates", href: "/hrms", icon: "plus" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">HR Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage your workforce</p>
      </div>

      {/* HR Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Employees"
          value={String(hrMetrics?.totalEmployees || 0)}
          icon={Users}
          change="All staff"
          trend="up"
        />
        <MetricCard
          title="Active Employees"
          value={String(hrMetrics?.activeEmployees || 0)}
          icon={UserCheck}
          change="Working now"
          trend="up"
        />
        <MetricCard
          title="Pending Onboarding"
          value={String(hrMetrics?.pendingOnboarding || 0)}
          icon={Calendar}
          change="To complete"
          trend="down"
        />
        <MetricCard
          title="Pending Applicants"
          value={String(hrMetrics?.pendingApplicants || 0)}
          icon={Users}
          change="New applications"
          trend="up"
        />
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickLinks.map((link) => (
              <QuickAccessCard key={link.title} {...link} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
