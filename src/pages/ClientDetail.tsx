
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientOverviewPanel } from "@/components/clients/ClientOverviewPanel";
import { MonthlyLimitsPanel } from "@/components/clients/MonthlyLimitsPanel";
import { ClientValueScore } from "@/components/clients/ClientValueScore";
import { KYCBankInfo } from "@/components/clients/KYCBankInfo";
import { PurposeCommunication } from "@/components/clients/PurposeCommunication";
import { BuyingSellingSoonTracker } from "@/components/clients/BuyingSellingSoonTracker";
import { TradingPatternAnalysis } from "@/components/clients/TradingPatternAnalysis";
import { OrderHistoryModule } from "@/components/clients/OrderHistoryModule";

export default function ClientDetail() {
  const { id: clientId } = useParams();

  // Fetch client data to determine if seller or buyer
  const { data: client } = useQuery({
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

  // Check if client is a seller (has selling purpose or client_type indicates seller)
  const isSeller = client?.buying_purpose?.toLowerCase().includes('sell') || 
                   client?.client_type?.toLowerCase() === 'seller' ||
                   (client?.buying_purpose && client.buying_purpose.toLowerCase().includes('selling'));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Client Details</h1>
        <p className="text-gray-600 mt-1">Comprehensive view of client information and trading activity</p>
      </div>

      {/* Row 1: Client Overview and Monthly Limits (only for buyers) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientOverviewPanel clientId={clientId} isSeller={isSeller} />
        {!isSeller && <MonthlyLimitsPanel clientId={clientId} />}
      </div>

      {/* Row 2: Client Value Score and KYC/Bank Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientValueScore clientId={clientId} />
        <KYCBankInfo clientId={clientId} isSeller={isSeller} />
      </div>

      {/* Row 3: Purpose Communication and Buying/Selling Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PurposeCommunication clientId={clientId} />
        <BuyingSellingSoonTracker clientId={clientId} />
      </div>

      {/* Row 4: Trading Pattern Analysis */}
      <div className="grid grid-cols-1 gap-6">
        <TradingPatternAnalysis clientId={clientId} />
      </div>

      {/* Row 5: Order History Module */}
      <div className="grid grid-cols-1 gap-6">
        <OrderHistoryModule clientId={clientId} />
      </div>
    </div>
  );
}
