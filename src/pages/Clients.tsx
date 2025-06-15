
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ClientOverviewPanel } from "@/components/clients/ClientOverviewPanel";
import { MonthlyLimitsPanel } from "@/components/clients/MonthlyLimitsPanel";
import { ClientValueScore } from "@/components/clients/ClientValueScore";
import { KYCBankInfo } from "@/components/clients/KYCBankInfo";
import { PurposeCommunication } from "@/components/clients/PurposeCommunication";
import { TradingPatternAnalysis } from "@/components/clients/TradingPatternAnalysis";
import { OrderHistoryModule } from "@/components/clients/OrderHistoryModule";
import { BuyingSellingSoonTracker } from "@/components/clients/BuyingSellingSoonTracker";

const shortcuts = [
  { title: "Add New Client", count: "2 Pending Approvals" },
  { title: "Re-KYC Required", count: "5 Clients" },
  { title: "Cosmos Alerts", count: "3 Active" },
  { title: "High Value Clients", count: "12 Platinum" },
];

export default function Clients() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Client CRM Dashboard</h1>
          <p className="text-gray-600 mt-1">Blynk Virtual Technologies Pvt Ltd - Complete Client Management</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input 
              placeholder="Search clients..." 
              className="pl-10 w-64"
            />
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add New Client
          </Button>
        </div>
      </div>

      {/* Quick Access Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border cursor-pointer">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-sm">{shortcut.title}</span>
                </div>
                <span className="text-sm text-blue-600 font-medium">{shortcut.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main CRM Dashboard - Client Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientOverviewPanel />
        <MonthlyLimitsPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ClientValueScore />
        <KYCBankInfo />
        <PurposeCommunication />
      </div>

      <TradingPatternAnalysis />
      
      <OrderHistoryModule />
      
      <BuyingSellingSoonTracker />
    </div>
  );
}
