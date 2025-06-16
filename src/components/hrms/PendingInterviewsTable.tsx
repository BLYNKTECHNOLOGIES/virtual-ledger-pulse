
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User } from "lucide-react";

export function PendingInterviewsTable() {
  const { data: interviews, isLoading } = useQuery({
    queryKey: ['pending_interviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interview_schedules')
        .select(`
          *,
          job_applicants:applicant_id(
            name,
            email,
            job_postings:job_posting_id(title, department)
          )
        `)
        .eq('status', 'SCHEDULED')
        .order('interview_date', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Interviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading interviews...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Pending Interviews
        </CardTitle>
      </CardHeader>
      <CardContent>
        {interviews && interviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Candidate</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Position</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Interview Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Interviewer</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((interview) => (
                  <tr key={interview.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium">{interview.job_applicants?.name}</p>
                          <p className="text-sm text-gray-500">{interview.job_applicants?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{interview.job_applicants?.job_postings?.title}</p>
                        <p className="text-sm text-gray-500">{interview.job_applicants?.job_postings?.department}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm">{new Date(interview.interview_date).toLocaleDateString()}</p>
                          <p className="text-xs text-gray-500">{new Date(interview.interview_date).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline">{interview.interview_type}</Badge>
                    </td>
                    <td className="py-3 px-4">{interview.interviewer_name || 'TBD'}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary">{interview.status}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">Complete</Button>
                        <Button size="sm" variant="outline">Reschedule</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No pending interviews scheduled
          </div>
        )}
      </CardContent>
    </Card>
  );
}
