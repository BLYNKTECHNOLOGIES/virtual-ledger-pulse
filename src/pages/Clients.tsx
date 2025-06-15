
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Plus } from "lucide-react";

const shortcuts = [
  { title: "Add New Client", count: "2 Pending Approvals" },
];

const reportsAndMasters = {
  "Reports & Masters": {
    "Client List": null,
    "Appointments": null,
    "Communication": null,
  },
  "Settings": {
    "Client Groups": null,
    "Contracts": null,
  },
  "Maintenance": {
    "Maintenance Requests": null,
    "Feedback": null,
  },
};

export default function Clients() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">Manage your clients and related reports.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add New Client
        </Button>
      </div>

      {/* Your Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">{shortcut.title}</span>
                </div>
                <span className="text-sm text-blue-600 font-medium">{shortcut.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reports & Masters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(reportsAndMasters).map(([category, items]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-lg">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(items).map(([item, value]) => (
                  <div key={item} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer">
                    <span className="text-sm font-medium text-gray-700">{item}</span>
                    <span className="text-xs text-gray-500">→</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
