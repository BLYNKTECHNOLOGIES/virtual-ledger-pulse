import { Card } from "@/components/ui/card";
import {
  ShoppingCart, AlertTriangle, Wallet, ArrowDownUp,
  ArrowLeftRight, Users, CreditCard, FileWarning
} from "lucide-react";

interface Props {
  counts?: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    openCount: number;
    total: number;
  };
  isLoading: boolean;
  activeCategory?: string;
  onCategoryClick: (cat: string) => void;
}

const CATEGORIES = [
  { key: 'orders', label: 'Orders', icon: ShoppingCart, color: 'border-l-red-500', bg: 'bg-red-50', iconColor: 'text-red-600' },
  { key: 'financial', label: 'Financial', icon: AlertTriangle, color: 'border-l-orange-500', bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  { key: 'fees', label: 'Fees', icon: FileWarning, color: 'border-l-amber-500', bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { key: 'balances', label: 'Balances', icon: Wallet, color: 'border-l-purple-500', bg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { key: 'movements', label: 'Movements', icon: ArrowDownUp, color: 'border-l-blue-500', bg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'conversions', label: 'Conversions', icon: ArrowLeftRight, color: 'border-l-cyan-500', bg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  { key: 'clients', label: 'Clients', icon: Users, color: 'border-l-yellow-500', bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  { key: 'payments', label: 'Payments', icon: CreditCard, color: 'border-l-emerald-500', bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
];

export function SummaryCards({ counts, isLoading, activeCategory, onCategoryClick }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {CATEGORIES.map(c => (
          <Card key={c.key} className="p-3 animate-pulse bg-slate-50">
            <div className="h-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      {CATEGORIES.map(cat => {
        const count = counts?.byCategory[cat.key] || 0;
        const isActive = activeCategory === cat.key;
        const Icon = cat.icon;

        return (
          <Card
            key={cat.key}
            onClick={() => onCategoryClick(cat.key)}
            className={`p-3 cursor-pointer transition-all border-l-4 ${cat.color} hover:shadow-md ${
              isActive ? 'ring-2 ring-primary shadow-md' : ''
            } ${count === 0 ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`p-1.5 rounded-lg ${cat.bg}`}>
                  <Icon className={`h-4 w-4 ${cat.iconColor}`} />
                </div>
                <span className={`text-xl font-bold ${count > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {count}
                </span>
              </div>
              <span className="text-xs font-medium text-muted-foreground truncate">{cat.label}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
