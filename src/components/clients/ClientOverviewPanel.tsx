
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, Tag, Phone, Mail, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ClientOverviewPanelProps {
  clientId?: string;
}

export function ClientOverviewPanel({ clientId }: ClientOverviewPanelProps) {
  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading client details...</div>
        </CardContent>
      </Card>
    );
  }

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Client Overview Panel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Select a client to view details
          </div>
        </CardContent>
      </Card>
    );
  }

  const clientAge = client.date_of_onboarding 
    ? Math.floor((new Date().getTime() - new Date(client.date_of_onboarding).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Client Overview Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Client Name</label>
            <p className="text-lg font-semibold">{client.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client ID</label>
            <p className="text-lg font-semibold text-blue-600">{client.client_id}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Date of Onboarding</label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>{new Date(client.date_of_onboarding).toLocaleDateString()}</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client Age</label>
            <p className="text-sm text-green-600 font-medium">{clientAge} months</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Risk Appetite</label>
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              {client.risk_appetite}
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client Type</label>
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              {client.client_type}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Email</label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{client.email || 'Not provided'}</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Phone</label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{client.phone || 'Not provided'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Monthly Limit</label>
            <p className="text-sm font-medium">₹{client.monthly_limit?.toLocaleString() || 'Not set'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Current Month Used</label>
            <p className="text-sm font-medium">₹{client.current_month_used?.toLocaleString() || '0'}</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Assigned Operator</label>
          <p className="text-sm font-medium">{client.assigned_operator || 'Unassigned'}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">KYC Status</label>
          <Badge variant={client.kyc_status === 'COMPLETED' ? 'default' : 'secondary'}>
            {client.kyc_status}
          </Badge>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline">
            <Tag className="h-4 w-4 mr-1" />
            Edit Details
          </Button>
          <Button size="sm" variant="outline">
            View Full Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
