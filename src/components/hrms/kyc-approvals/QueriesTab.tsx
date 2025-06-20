
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, User, Eye } from "lucide-react";

const mockQueries = [
  {
    id: "1",
    counterpartyName: "Alice Johnson",
    kycRequestId: "KYC-001",
    queryType: "VKYC_REQUIRED",
    queryText: "Video KYC required for high-value transaction",
    createdAt: "2024-01-14",
    createdBy: "Compliance Officer",
    resolved: false,
  },
  {
    id: "2",
    counterpartyName: "Bob Wilson",
    kycRequestId: "KYC-002",
    queryType: "MANUAL_QUERY",
    queryText: "Additional address verification documents needed",
    createdAt: "2024-01-13",
    createdBy: "Compliance Officer",
    resolved: true,
    resolvedAt: "2024-01-15",
    responseText: "Documents submitted and verified",
  },
];

export function QueriesTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {mockQueries.map((query) => (
          <Card key={query.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {query.counterpartyName}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant={query.queryType === "VKYC_REQUIRED" ? "default" : "secondary"}>
                    {query.queryType === "VKYC_REQUIRED" ? "VKYC Required" : "Manual Query"}
                  </Badge>
                  <Badge variant={query.resolved ? "outline" : "destructive"}>
                    {query.resolved ? "Resolved" : "Open"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">KYC Request ID</p>
                  <p className="font-medium">{query.kycRequestId}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created Date</p>
                  <p className="font-medium">{query.createdAt}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created By</p>
                  <p className="font-medium">{query.createdBy}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500 mb-1">Query</p>
                <p className="text-sm bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
                  {query.queryText}
                </p>
              </div>

              {query.resolved && query.responseText && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-500 mb-1">Response</p>
                  <p className="text-sm bg-green-50 p-2 rounded border-l-4 border-green-400">
                    {query.responseText}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Resolved on: {query.resolvedAt}</p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View KYC Details
                </Button>
                {!query.resolved && (
                  <Button size="sm" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Mark Resolved
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
