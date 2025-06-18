
import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Check, X } from "lucide-react";

interface PendingRegistration {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status: string;
  submitted_at: string;
  rejection_reason?: string;
}

interface ApprovalsTabProps {
  registrations: PendingRegistration[];
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

export const ApprovalsTab = memo(function ApprovalsTab({
  registrations,
  onApprove,
  onReject
}: ApprovalsTabProps) {
  const getRegistrationStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "APPROVED":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "REJECTED":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Registration Approvals ({registrations.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {registrations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No pending registration requests.
          </div>
        ) : (
          <div className="space-y-4">
            {registrations.map((registration) => (
              <Card key={registration.id} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{registration.username}</h3>
                        {getRegistrationStatusBadge(registration.status)}
                      </div>
                      <p className="text-sm text-gray-600">{registration.email}</p>
                      {(registration.first_name || registration.last_name) && (
                        <p className="text-sm text-gray-600">
                          {[registration.first_name, registration.last_name].filter(Boolean).join(' ')}
                        </p>
                      )}
                      {registration.phone && (
                        <p className="text-sm text-gray-600">📞 {registration.phone}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Submitted: {new Date(registration.submitted_at).toLocaleDateString()}
                      </p>
                      {registration.rejection_reason && (
                        <p className="text-sm text-red-600">
                          Reason: {registration.rejection_reason}
                        </p>
                      )}
                    </div>
                    
                    {registration.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => onApprove(registration.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = prompt("Reason for rejection (optional):");
                            onReject(registration.id, reason || undefined);
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
