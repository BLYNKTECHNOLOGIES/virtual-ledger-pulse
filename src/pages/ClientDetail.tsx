
import { useParams } from "react-router-dom";
import { ClientOverviewPanel } from "@/components/clients/ClientOverviewPanel";
import { MonthlyLimitsPanel } from "@/components/clients/MonthlyLimitsPanel";
import { ClientValueScore } from "@/components/clients/ClientValueScore";
import { KYCBankInfo } from "@/components/clients/KYCBankInfo";
import { PurposeCommunication } from "@/components/clients/PurposeCommunication";
import { BuyingSellingSoonTracker } from "@/components/clients/BuyingSellingSoonTracker";
import { TradingPatternAnalysis } from "@/components/clients/TradingPatternAnalysis";
import { OrderHistoryModule } from "@/components/clients/OrderHistoryModule";

export default function ClientDetail() {
  const { clientId } = useParams();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Client Details</h1>
        <p className="text-gray-600 mt-1">Comprehensive view of client information and trading activity</p>
      </div>

      {/* Row 1: Client Overview and Monthly Limits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientOverviewPanel clientId={clientId} />
        <MonthlyLimitsPanel clientId={clientId} />
      </div>

      {/* Row 2: Client Value Score and KYC/Bank Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientValueScore clientId={clientId} />
        <KYCBankInfo clientId={clientId} />
      </div>

      {/* Row 3: Purpose Communication and Buying/Selling Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PurposeCommunication clientId={clientId} />
        <BuyingSellingSoonTracker clientId={clientId} />
      </div>

      {/* Row 4: Trading Pattern Analysis */}
      <div className="grid grid-cols-1 gap-6">
        <TradingPatternAnalysis />
      </div>

      {/* Row 5: Order History Module */}
      <div className="grid grid-cols-1 gap-6">
        <OrderHistoryModule />
      </div>
    </div>
  );
}
