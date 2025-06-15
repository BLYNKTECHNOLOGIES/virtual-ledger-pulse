
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { Banknote, User, Database, Shield } from "lucide-react";

const quickAccessItems = [
  { title: "Add New Client", status: "2 Pending Approvals", link: "/clients/new" },
  { title: "Home", link: "/" },
  { title: "Bank Statement", status: "Reconcile", link: "/banking" },
  { title: "Payroll", status: "Processing", link: "/payroll" },
  { title: "Compliance Tasks", count: 3, link: "/compliance" },
  { title: "Analytics Dashboard", link: "/analytics" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to Blynk ERP - Your P2P Trading Management Hub</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Assets Value"
          value="18,200 USDT"
          change="0% since yesterday"
          changeType="neutral"
          icon={Banknote}
        />
        <MetricCard
          title="Total Clients"
          value="129"
          change="↑ 1.6%"
          changeType="positive"
          subtitle="2 new clients"
          icon={User}
        />
        <MetricCard
          title="Active Payment Methods"
          value="7"
          change="No change"
          changeType="neutral"
          icon={Database}
        />
        <MetricCard
          title="Risk Score"
          value="Low"
          change="Stable"
          changeType="positive"
          subtitle="All systems secure"
          icon={Shield}
        />
      </div>

      {/* Charts and Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ExchangeChart />
        </div>
        <div>
          <QuickAccessCard title="Quick Access" items={quickAccessItems} />
        </div>
      </div>
    </div>
  );
}
