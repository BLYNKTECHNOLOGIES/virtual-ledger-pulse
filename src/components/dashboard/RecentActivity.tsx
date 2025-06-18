
import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { format } from "date-fns";

interface ActivityItem {
  id: string;
  type: 'sale' | 'purchase';
  title: string;
  amount: number;
  reference: string;
  timestamp: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

export const RecentActivity = memo(function RecentActivity({ activities = [] }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  activity.type === 'sale' ? 'bg-green-100' : 'bg-blue-100'
                }`}>
                  {activity.type === 'sale' ? (
                    <ArrowUpIcon className="h-4 w-4 text-green-600" />
                  ) : (
                    <ArrowDownIcon className="h-4 w-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{activity.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(activity.timestamp), "MMM dd, HH:mm")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-sm ${
                  activity.type === 'sale' ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">{activity.reference}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            No recent activity
          </div>
        )}
      </CardContent>
    </Card>
  );
});
