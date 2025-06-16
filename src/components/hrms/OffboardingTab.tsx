
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Plus } from "lucide-react";
import { OffboardingDialog } from "./OffboardingDialog";

export function OffboardingTab() {
  const [showOffboardingDialog, setShowOffboardingDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: offboardingRecords, isLoading } = useQuery({
    queryKey: ['employee_offboarding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_offboarding')
        .select(`
          *,
          employees:employee_id(name, employee_id, department, designation)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
      case 'INITIATED': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Employee Offboarding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading offboarding records...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              Employee Offboarding
            </CardTitle>
            <Button onClick={() => setShowOffboardingDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Start Offboarding
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {offboardingRecords && offboardingRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Employee</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Department</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reason</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Last Working Day</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Notice Period</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {offboardingRecords.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{record.employees?.name}</p>
                          <p className="text-sm text-blue-600">{record.employees?.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p>{record.employees?.department}</p>
                          <p className="text-sm text-gray-500">{record.employees?.designation}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">{record.reason_for_leaving}</td>
                      <td className="py-3 px-4">
                        {record.last_working_day ? new Date(record.last_working_day).toLocaleDateString() : 'TBD'}
                      </td>
                      <td className="py-3 px-4">{record.notice_period_days} days</td>
                      <td className="py-3 px-4">
                        <Badge className={getStatusColor(record.status)}>{record.status}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">View Details</Button>
                          <Button size="sm" variant="outline">Update</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No offboarding processes active
            </div>
          )}
        </CardContent>
      </Card>

      <OffboardingDialog 
        open={showOffboardingDialog} 
        onOpenChange={setShowOffboardingDialog}
      />
    </div>
  );
}
