import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientOverviewPanel } from "@/components/clients/ClientOverviewPanel";
import { MonthlyLimitsPanel } from "@/components/clients/MonthlyLimitsPanel";
import { ClientValueScore } from "@/components/clients/ClientValueScore";
import { KYCBankInfo } from "@/components/clients/KYCBankInfo";
import { PurposeCommunication } from "@/components/clients/PurposeCommunication";
import { ClientTDSRecords } from "@/components/clients/ClientTDSRecords";
import { TradingPatternAnalysis } from "@/components/clients/TradingPatternAnalysis";
import { OrderHistoryModule } from "@/components/clients/OrderHistoryModule";
import { ClientDualStatistics } from "@/components/clients/ClientDualStatistics";

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

  // Fetch buy orders count
  const { data: buyOrdersCount } = useQuery({
    queryKey: ['client-buy-orders-count', clientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!clientId || !client) return 0;
      const { count, error } = await supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .or(`client_name.eq.${client.name},client_phone.eq.${client.phone}`);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clientId && !!client,
  });

  // Fetch sell orders count
  const { data: sellOrdersCount } = useQuery({
    queryKey: ['client-sell-orders-count', clientId, client?.name, client?.phone],
    queryFn: async () => {
      if (!clientId || !client) return 0;
      const { count, error } = await supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .or(`supplier_name.eq.${client.name},contact_number.eq.${client.phone}`);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clientId && !!client,
  });

  // Determine client type dynamically
  const isBuyer = (buyOrdersCount || 0) > 0;
  const isSeller = (sellOrdersCount || 0) > 0;
  const isComposite = isBuyer && isSeller;

  // Legacy check for sellers without order data
  const legacySeller = client?.buying_purpose?.toLowerCase().includes('sell') || 
                       client?.client_type?.toLowerCase() === 'seller' ||
                       (client?.buying_purpose && client.buying_purpose.toLowerCase().includes('selling'));

  // Use detected type, fallback to legacy
  const showAsSellerOnly = !isBuyer && (isSeller || legacySeller);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Client Details</h1>
        <p className="text-muted-foreground mt-1">Comprehensive view of client information and trading activity</p>
      </div>

      {/* Row 1: Client Overview and Monthly Limits (only for buyers/composite) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientOverviewPanel clientId={clientId} isSeller={showAsSellerOnly} isComposite={isComposite} />
        {!showAsSellerOnly && <MonthlyLimitsPanel clientId={clientId} />}
      </div>

      {/* Row 2: Dual Statistics Panel (for composite clients or any client with orders) */}
      {(isComposite || isBuyer || isSeller) && (
        <div className="grid grid-cols-1 gap-6">
          <ClientDualStatistics clientId={clientId} />
        </div>
      )}

      {/* Row 3: Client Value Score and KYC/Bank Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientValueScore clientId={clientId} />
        <KYCBankInfo clientId={clientId} isSeller={showAsSellerOnly} />
      </div>

      {/* Row 4: Purpose Communication and TDS Records (for sellers/composite) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PurposeCommunication clientId={clientId} />
        {(isSeller || showAsSellerOnly || isComposite) && (
          <ClientTDSRecords clientId={clientId} clientName={client?.name} clientPhone={client?.phone} />
        )}
      </div>

      {/* Row 5: Trading Pattern Analysis */}
      <div className="grid grid-cols-1 gap-6">
        <TradingPatternAnalysis clientId={clientId} />
      </div>

      {/* Row 6: Order History Module with tabs for buy/sell */}
      <div className="grid grid-cols-1 gap-6">
        <OrderHistoryModule clientId={clientId} showTabs={isComposite} />
      </div>
    </div>
  );
}
