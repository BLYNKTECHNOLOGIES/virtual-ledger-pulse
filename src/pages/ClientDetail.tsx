
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, User, Calendar, Tag, Phone, Mail, MapPin, TrendingUp, FileText, MessageCircle, Shield, AlertTriangle, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { TradingPatternAnalysis } from "@/components/clients/TradingPatternAnalysis";
import { OrderHistoryModule } from "@/components/clients/OrderHistoryModule";

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">Loading client details...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Client not found</h2>
          <Button onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </div>
      </div>
    );
  }

  const clientAge = client.date_of_onboarding 
    ? Math.floor((new Date().getTime() - new Date(client.date_of_onboarding).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;

  const monthlyLimit = client.monthly_limit || (client.first_order_value * 2);
  const currentUsed = client.current_month_used || 0;
  const usagePercentage = monthlyLimit > 0 ? (currentUsed / monthlyLimit) * 100 : 0;
  const remaining = monthlyLimit - currentUsed;

  const getClientValueScore = () => {
    return (currentUsed * 0.03);
  };

  const getClientPriority = (valueScore: number) => {
    if (valueScore >= 10000) return { tag: 'Platinum', color: 'bg-purple-100 text-purple-800' };
    if (valueScore >= 5000) return { tag: 'Gold', color: 'bg-yellow-100 text-yellow-800' };
    if (valueScore >= 1000) return { tag: 'Silver', color: 'bg-gray-100 text-gray-800' };
    return { tag: 'General', color: 'bg-blue-100 text-blue-800' };
  };

  const priority = getClientPriority(getClientValueScore());

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/clients')}
              className="border-blue-200 hover:bg-blue-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Clients
            </Button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Client Detail - {client.name}
            </h1>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <Card className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5" />
              <div>
                <p className="text-sm opacity-90">Add New Client</p>
                <p className="text-xs">2 Pending Approvals</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <div>
                <p className="text-sm opacity-90">Re-KYC Required</p>
                <p className="text-xs">5 Clients</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="text-sm opacity-90">Cosmos Alerts</p>
                <p className="text-xs">3 Active</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5" />
              <div>
                <p className="text-sm opacity-90">High Value Clients</p>
                <p className="text-xs">12 Platinum</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Overview Panel */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Client Overview Panel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Client Name</label>
                <p className="text-lg font-semibold text-gray-800">{client.name}</p>
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
                  <span>{format(new Date(client.date_of_onboarding), 'dd MMMM yyyy')}</span>
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

            <div>
              <label className="text-sm font-medium text-gray-600">Assigned Operator</label>
              <p className="text-sm font-medium">{client.assigned_operator || 'Ravi Sharma'}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="border-blue-200 hover:bg-blue-50">
                <Tag className="h-4 w-4 mr-1" />
                Edit Details
              </Button>
              <Button size="sm" variant="outline" className="border-blue-200 hover:bg-blue-50">
                View Full Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Limits & Cosmos Alerts */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Monthly Limits & Cosmos Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">First Order Value</label>
                <p className="text-lg font-semibold text-green-600">₹{client.first_order_value?.toLocaleString() || '50,000'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Current Monthly Limit</label>
                <p className="text-lg font-semibold">₹{monthlyLimit.toLocaleString()}</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-600">Monthly Usage</label>
                <span className="text-sm font-medium">{usagePercentage.toFixed(0)}% Used</span>
              </div>
              <Progress value={usagePercentage} className="h-3" />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Used: ₹{currentUsed.toLocaleString()}</span>
                <span>Remaining: ₹{remaining.toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Cosmos Triggered?</label>
                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                  ❌ Not Triggered
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Re-KYC Status</label>
                <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
                  Pending
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Limit Upgrade Request</label>
              <p className="text-sm">Raised on 12 June by Ravi</p>
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 mt-1">
                In Review
              </Badge>
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="border-green-200 hover:bg-green-50">
                <TrendingUp className="h-4 w-4 mr-1" />
                Request Limit Increase
              </Button>
              <Button size="sm" variant="outline" className="border-green-200 hover:bg-green-50">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Cosmos Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Client Value Score */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Client Value Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div>
              <label className="text-sm font-medium text-gray-600">Monthly Purchase Value</label>
              <p className="text-2xl font-bold text-green-600">₹{currentUsed.toLocaleString()}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Client Value (3%)</label>
              <p className="text-xl font-semibold text-purple-600">₹{getClientValueScore().toLocaleString()}</p>
              <p className="text-sm text-gray-500">Indicates priority level</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600">Client Priority Tag</label>
              <Badge className={priority.color}>
                {priority.tag}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KYC & Bank Account Info */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              KYC & Bank Account Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">PAN Card</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-sm text-green-600">Uploaded</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Aadhar Card</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-sm text-green-600">Uploaded</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Other Docs</span>
                <span className="text-sm text-blue-600">Passport.pdf</span>
              </div>
            </div>

            <Button size="sm" variant="outline" className="w-full border-indigo-200 hover:bg-indigo-50">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage KYC Documents
            </Button>
          </CardContent>
        </Card>

        {/* Trading Pattern Analysis */}
        <div className="lg:col-span-2">
          <TradingPatternAnalysis />
        </div>

        {/* Order History Module */}
        <div className="lg:col-span-2">
          <OrderHistoryModule />
        </div>

        {/* Purpose & Communication */}
        <Card className="lg:col-span-2 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Purpose & Communication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600">Purpose of Buying</label>
                <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 ml-2">
                  {client.buying_purpose || 'Investment'}
                </Badge>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Contact Details</label>
                <div className="space-y-1 mt-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{client.phone || '+91 9876543210'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{client.email || 'john@example.com'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Operator Notes</label>
                <div className="bg-gray-50 p-3 rounded-lg mt-1">
                  <p className="text-sm">High Value Lead, Asked for support on UPI</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" className="border-teal-200 hover:bg-teal-50">
                <MessageCircle className="h-4 w-4 mr-1" />
                Add Note
              </Button>
              <Button size="sm" variant="outline" className="border-teal-200 hover:bg-teal-50">
                Communication Log
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
