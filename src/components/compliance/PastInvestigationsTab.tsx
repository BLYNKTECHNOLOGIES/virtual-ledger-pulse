import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, CheckCircle, Archive } from "lucide-react";

export function PastInvestigationsTab() {
  const [selectedInvestigation, setSelectedInvestigation] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Fetch resolved investigations
  const { data: investigations } = useQuery({
    queryKey: ['past_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select(`
          *,
          bank_accounts (
            bank_name,
            account_name,
            account_number
          )
        `)
        .eq('status', 'RESOLVED')
        .order('resolved_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleViewDetails = (investigation: any) => {
    setSelectedInvestigation(investigation);
    setShowDetailsDialog(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'secondary';
    }
  };

  const getDurationInDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-green-500" />
            Past Account Investigations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {investigations?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">No Past Investigations</h3>
              <p>No investigations have been completed yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {investigations?.map((investigation) => (
                <Card key={investigation.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-gray-900">
                            {investigation.bank_accounts?.bank_name}
                          </h4>
                          <Badge variant="default" className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            RESOLVED
                          </Badge>
                          <Badge variant={getPriorityColor(investigation.priority)}>
                            {investigation.priority}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2">
                          {investigation.bank_accounts?.account_name}
                        </p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-500">Type:</span>
                            <p className="text-gray-900">{investigation.investigation_type}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Duration:</span>
                            <p className="text-gray-900">
                              {getDurationInDays(investigation.created_at, investigation.resolved_at)} days
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Started:</span>
                            <p className="text-gray-900">
                              {new Date(investigation.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Resolved:</span>
                            <p className="text-gray-900">
                              {new Date(investigation.resolved_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <span className="font-medium text-gray-500 text-sm">Reason:</span>
                          <p className="text-sm text-gray-900 line-clamp-2">{investigation.reason}</p>
                        </div>
                        
                        {investigation.resolution_notes && (
                          <div className="mt-2">
                            <span className="font-medium text-gray-500 text-sm">Resolution:</span>
                            <p className="text-sm text-green-700 line-clamp-2">{investigation.resolution_notes}</p>
                          </div>
                        )}
                      </div>
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewDetails(investigation)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investigation Details Dialog */}
      {selectedInvestigation && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Resolved Investigation - {selectedInvestigation.bank_accounts?.bank_name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Investigation Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Investigation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Account:</span>
                    <p className="text-sm">{selectedInvestigation.bank_accounts?.account_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Type:</span>
                    <p className="text-sm">{selectedInvestigation.investigation_type}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Priority:</span>
                    <Badge variant={getPriorityColor(selectedInvestigation.priority)}>
                      {selectedInvestigation.priority}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Duration:</span>
                    <p className="text-sm">
                      {getDurationInDays(selectedInvestigation.created_at, selectedInvestigation.resolved_at)} days
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Started:</span>
                    <p className="text-sm">{new Date(selectedInvestigation.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Resolved:</span>
                    <p className="text-sm">{new Date(selectedInvestigation.resolved_at).toLocaleDateString()}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-medium text-gray-500">Initial Reason:</span>
                    <p className="text-sm mt-1">{selectedInvestigation.reason}</p>
                  </div>
                  {selectedInvestigation.resolution_notes && (
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-gray-500">Resolution Notes:</span>
                      <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">{selectedInvestigation.resolution_notes}</p>
                      </div>
                    </div>
                  )}
                  {selectedInvestigation.notes && (
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-gray-500">Additional Notes:</span>
                      <p className="text-sm mt-1">{selectedInvestigation.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}