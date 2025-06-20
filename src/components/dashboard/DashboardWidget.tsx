
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MoreVertical, 
  X, 
  Move, 
  BarChart3, 
  Users, 
  Package, 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  FileText, 
  Activity, 
  Target 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { MetricCard } from "./MetricCard";
import { ExchangeChart } from "./ExchangeChart";

interface Widget {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

interface DashboardWidgetProps {
  widget: Widget;
  onRemove: (widgetId: string) => void;
  onMove: (widgetId: string, direction: 'up' | 'down') => void;
  metrics?: any;
}

const iconMap = {
  'revenue-chart': BarChart3,
  'total-clients': Users,
  'inventory-status': Package,
  'sales-target': Target,
  'recent-orders': FileText,
  'daily-activity': Activity,
  'upcoming-tasks': Calendar,
  'profit-margin': TrendingUp
};

export function DashboardWidget({ widget, onRemove, onMove, metrics }: DashboardWidgetProps) {
  const IconComponent = iconMap[widget.id as keyof typeof iconMap] || widget.icon;

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'small': return 'col-span-1';
      case 'medium': return 'col-span-1 md:col-span-2';
      case 'large': return 'col-span-1 md:col-span-2 lg:col-span-3';
      default: return 'col-span-1';
    }
  };

  const renderWidgetContent = () => {
    switch (widget.id) {
      case 'revenue-chart':
        return <ExchangeChart />;
      
      case 'total-clients':
        return (
          <div className="text-center p-4">
            <div className="text-3xl font-bold text-blue-600">{metrics?.totalClients || 0}</div>
            <p className="text-sm text-gray-600 mt-1">Active Clients</p>
            <Badge variant="outline" className="mt-2">+3.2% this month</Badge>
          </div>
        );
      
      case 'inventory-status':
        return (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl font-bold">{metrics?.totalProducts || 0}</div>
                <p className="text-sm text-gray-600">Total Products</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>In Stock</span>
                <span className="text-green-600">85%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Low Stock</span>
                <span className="text-yellow-600">12%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Out of Stock</span>
                <span className="text-red-600">3%</span>
              </div>
            </div>
          </div>
        );
      
      case 'sales-target':
        return (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl font-bold">₹{((metrics?.totalRevenue || 0) / 100000).toFixed(1)}L</div>
                <p className="text-sm text-gray-600">Monthly Target: ₹10L</p>
              </div>
              <Target className="h-8 w-8 text-green-600" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div className="bg-green-600 h-2 rounded-full" style={{ width: '65%' }}></div>
            </div>
            <p className="text-sm text-gray-600">65% of target achieved</p>
          </div>
        );
      
      case 'recent-orders':
        return (
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1234</p>
                  <p className="text-sm text-gray-600">John Doe - ₹5,000</p>
                </div>
                <Badge variant="outline">Pending</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1235</p>
                  <p className="text-sm text-gray-600">Jane Smith - ₹12,000</p>
                </div>
                <Badge className="bg-green-100 text-green-800">Completed</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1236</p>
                  <p className="text-sm text-gray-600">Mike Johnson - ₹8,500</p>
                </div>
                <Badge variant="outline">Processing</Badge>
              </div>
            </div>
          </div>
        );
      
      case 'daily-activity':
        return (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{metrics?.totalSales || 0}</div>
                <p className="text-xs text-gray-600">Sales Today</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{metrics?.totalPurchases || 0}</div>
                <p className="text-xs text-gray-600">Purchases</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-purple-600">15</div>
                <p className="text-xs text-gray-600">New Leads</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-600">8</div>
                <p className="text-xs text-gray-600">Tasks Done</p>
              </div>
            </div>
          </div>
        );
      
      case 'upcoming-tasks':
        return (
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">KYC Review - Urgent</p>
                  <p className="text-xs text-gray-600">Due in 2 hours</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Client Meeting</p>
                  <p className="text-xs text-gray-600">Tomorrow 10:00 AM</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Monthly Report</p>
                  <p className="text-xs text-gray-600">Due in 3 days</p>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'profit-margin':
        return (
          <div className="text-center p-4">
            <div className="text-3xl font-bold text-green-600">23.5%</div>
            <p className="text-sm text-gray-600 mt-1">Profit Margin</p>
            <Badge className="bg-green-100 text-green-800 mt-2">+2.1% vs last month</Badge>
          </div>
        );
      
      default:
        return (
          <div className="p-4 text-center">
            <IconComponent className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">{widget.description}</p>
          </div>
        );
    }
  };

  return (
    <div className={getSizeClasses(widget.size)}>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <IconComponent className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">{widget.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMove(widget.id, 'up')}>
                <Move className="h-4 w-4 mr-2" />
                Move Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(widget.id, 'down')}>
                <Move className="h-4 w-4 mr-2" />
                Move Down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onRemove(widget.id)}
                className="text-red-600"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Widget
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="p-0">
          {renderWidgetContent()}
        </CardContent>
      </Card>
    </div>
  );
}
