
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Users, Package, DollarSign, TrendingUp, Calendar, FileText, Activity, Target } from "lucide-react";

interface WidgetType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

const availableWidgets: WidgetType[] = [
  {
    id: 'revenue-chart',
    name: 'Revenue Chart',
    description: 'Monthly revenue trends and analytics',
    icon: BarChart3,
    category: 'Analytics',
    size: 'large'
  },
  {
    id: 'total-clients',
    name: 'Total Clients',
    description: 'Quick view of total client count',
    icon: Users,
    category: 'Metrics',
    size: 'small'
  },
  {
    id: 'inventory-status',
    name: 'Inventory Status',
    description: 'Current stock levels and alerts',
    icon: Package,
    category: 'Operations',
    size: 'medium'
  },
  {
    id: 'sales-target',
    name: 'Sales Target',
    description: 'Progress towards sales goals',
    icon: Target,
    category: 'Metrics',
    size: 'medium'
  },
  {
    id: 'recent-orders',
    name: 'Recent Orders',
    description: 'Latest customer orders',
    icon: FileText,
    category: 'Operations',
    size: 'large'
  },
  {
    id: 'daily-activity',
    name: 'Daily Activity',
    description: 'Today\'s business activities',
    icon: Activity,
    category: 'Analytics',
    size: 'medium'
  },
  {
    id: 'upcoming-tasks',
    name: 'Upcoming Tasks',
    description: 'Scheduled tasks and reminders',
    icon: Calendar,
    category: 'Productivity',
    size: 'medium'
  },
  {
    id: 'profit-margin',
    name: 'Profit Margin',
    description: 'Current profit margins',
    icon: TrendingUp,
    category: 'Metrics',
    size: 'small'
  }
];

interface AddWidgetDialogProps {
  onAddWidget: (widget: WidgetType) => void;
  existingWidgets: string[];
}

export function AddWidgetDialog({ onAddWidget, existingWidgets }: AddWidgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(availableWidgets.map(w => w.category)))];
  
  const filteredWidgets = availableWidgets.filter(widget => 
    (selectedCategory === 'All' || widget.category === selectedCategory) &&
    !existingWidgets.includes(widget.id)
  );

  const handleAddWidget = (widget: WidgetType) => {
    onAddWidget(widget);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Dashboard Widget</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Widget Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWidgets.map((widget) => {
              const IconComponent = widget.icon;
              return (
                <Card key={widget.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <IconComponent className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-medium">{widget.name}</CardTitle>
                          <Badge variant="outline" className="text-xs mt-1">
                            {widget.category}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {widget.size}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 mb-3">{widget.description}</p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleAddWidget(widget)}
                    >
                      Add Widget
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredWidgets.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {existingWidgets.length === availableWidgets.length 
                ? "All widgets have been added to your dashboard"
                : "No widgets available in this category"
              }
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
