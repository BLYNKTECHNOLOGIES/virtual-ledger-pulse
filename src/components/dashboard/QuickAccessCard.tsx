
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickAccessItem {
  title: string;
  count?: number;
  status?: string;
  link: string;
}

interface QuickAccessCardProps {
  title: string;
  items: QuickAccessItem[];
}

export function QuickAccessCard({ title, items }: QuickAccessCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div>
              <h4 className="font-medium text-gray-900">{item.title}</h4>
              {item.status && (
                <span className="text-sm text-blue-600 font-medium">{item.status}</span>
              )}
            </div>
            {item.count && (
              <span className="text-sm font-medium text-gray-600">{item.count}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
