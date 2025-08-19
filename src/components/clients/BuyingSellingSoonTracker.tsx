
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Phone, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BuyingSellingSoonTrackerProps {
  clientId?: string;
}

export function BuyingSellingSoonTracker({ clientId }: BuyingSellingSoonTrackerProps) {
  // Fetch leads data for tracking buying/selling soon
  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .in('status', ['NEW', 'CONTACTED', 'QUALIFIED', 'FOLLOW_UP'])
        .not('follow_up_date', 'is', null)
        .order('follow_up_date', { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch recent client interactions (from sales orders)
  const { data: recentInteractions } = useQuery({
    queryKey: ['recent-interactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('client_name, client_phone, order_date, total_amount, status')
        .order('order_date', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch clients data
  const { data: clients } = useQuery({
    queryKey: ['clients-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('name, phone, email, assigned_operator, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading tracker data...</div>
        </CardContent>
      </Card>
    );
  }

  // Combine and process data to create buying/selling soon tracker
  const trackerData = [];

  // Add leads with follow-up dates
  leads?.forEach(lead => {
    if (lead.follow_up_date) {
      const followupDate = new Date(lead.follow_up_date);
      const today = new Date();
      const daysFromNow = Math.ceil((followupDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysFromNow >= -7 && daysFromNow <= 30) { // Show leads with follow-ups within 7 days past to 30 days future
        trackerData.push({
          clientName: lead.name,
          lastInteraction: new Date(lead.created_at).toLocaleDateString(),
          intent: lead.lead_type === 'BUYING' ? 'Buying Soon' : lead.lead_type === 'SELLING' ? 'Selling Soon' : 'Interested',
          assignedOperator: 'System Lead',
          followupAction: `Follow-up ${daysFromNow > 0 ? 'in ' + daysFromNow + ' days' : 'overdue'}`,
          intentColor: lead.lead_type === 'BUYING' ? "text-green-600 bg-green-50 border-green-200" : lead.lead_type === 'SELLING' ? "text-blue-600 bg-blue-50 border-blue-200" : "text-purple-600 bg-purple-50 border-purple-200",
          contactMethod: lead.contact_channel || 'phone',
          phone: lead.contact_number,
          isOverdue: daysFromNow < 0
        });
      }
    }
  });

  // Add clients with recent activity (last order within 30 days)
  const recentClientActivity = new Map();
  recentInteractions?.forEach(order => {
    const orderDate = new Date(order.order_date);
    const today = new Date();
    const daysAgo = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysAgo <= 30 && !recentClientActivity.has(order.client_name)) {
      const client = clients?.find(c => c.name === order.client_name);
      recentClientActivity.set(order.client_name, {
        clientName: order.client_name,
        lastInteraction: orderDate.toLocaleDateString(),
        intent: order.status === 'COMPLETED' ? 'Repeat Customer' : 'Pending Order',
        assignedOperator: client?.assigned_operator || 'Unassigned',
        followupAction: daysAgo <= 7 ? 'Recent activity' : `Last order ${daysAgo} days ago`,
        intentColor: order.status === 'COMPLETED' ? "text-green-600 bg-green-50 border-green-200" : "text-orange-600 bg-orange-50 border-orange-200",
        phone: order.client_phone,
        isOverdue: false
      });
    }
  });

  // Add recent client activity to tracker data
  recentClientActivity.forEach(activity => trackerData.push(activity));

  // Sort by urgency (overdue first, then by last interaction date)
  trackerData.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime();
  });

  // Limit to top 8 entries
  const displayData = trackerData.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-600" />
          Buying/Selling Soon Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No recent activity or follow-ups scheduled
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Last Interaction</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Assigned Operator</TableHead>
                  <TableHead>Follow-up Action</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((client, index) => (
                  <TableRow key={index} className={client.isOverdue ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{client.clientName}</TableCell>
                    <TableCell>{client.lastInteraction}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={client.intentColor}>
                        {client.intent}
                      </Badge>
                    </TableCell>
                    <TableCell>{client.assignedOperator}</TableCell>
                    <TableCell className={client.isOverdue ? 'text-red-600 font-medium' : ''}>
                      {client.followupAction}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {client.phone && (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => window.open(`tel:${client.phone}`, '_self')}
                            title={`Call ${client.phone}`}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => {
                            // You can implement WhatsApp or SMS functionality here
                            if (client.phone) {
                              window.open(`https://wa.me/${client.phone.replace(/[^\d]/g, '')}`, '_blank');
                            }
                          }}
                          title="Send WhatsApp message"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
