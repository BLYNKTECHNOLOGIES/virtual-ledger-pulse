
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, User } from "lucide-react";
import { format } from "date-fns";

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

export function ApprovalsTab({ registrations, onApprove, onReject }: ApprovalsTabProps) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedRegistration, setSelectedRegistration] = useState<string>("");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'APPROVED':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="outline" className="text-red-600 border-red-600"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleReject = () => {
    if (selectedRegistration) {
      onReject(selectedRegistration, rejectionReason || undefined);
      setRejectionReason("");
      setSelectedRegistration("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Registration Approvals</h2>
          <p className="text-gray-600 mt-1">Review and manage pending user registrations</p>
        </div>
      </div>

      <div className="grid gap-4">
        {registrations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pending registrations</h3>
              <p className="text-gray-500 text-center">All user registrations have been processed.</p>
            </CardContent>
          </Card>
        ) : (
          registrations.map((registration) => (
            <Card key={registration.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {registration.first_name && registration.last_name 
                      ? `${registration.first_name} ${registration.last_name}` 
                      : registration.username}
                  </CardTitle>
                  {getStatusBadge(registration.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Username</p>
                    <p className="font-medium">{registration.username}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Email</p>
                    <p className="font-medium">{registration.email}</p>
                  </div>
                  {registration.phone && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Phone</p>
                      <p className="font-medium">{registration.phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Submitted</p>
                    <p className="font-medium">{format(new Date(registration.submitted_at), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                </div>

                {registration.rejection_reason && (
                  <div className="mb-4 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Rejection Reason</p>
                    <p className="text-sm text-red-800">{registration.rejection_reason}</p>
                  </div>
                )}

                {registration.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => onApprove(registration.id)}
                      className="bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => setSelectedRegistration(registration.id)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Reject Registration</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">
                            Are you sure you want to reject the registration for <strong>{registration.username}</strong>?
                          </p>
                          <div>
                            <Label htmlFor="reason">Rejection Reason (Optional)</Label>
                            <Textarea
                              id="reason"
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder="Provide a reason for rejection..."
                              className="mt-1"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => {
                              setRejectionReason("");
                              setSelectedRegistration("");
                            }}>
                              Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleReject}>
                              Reject Registration
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
