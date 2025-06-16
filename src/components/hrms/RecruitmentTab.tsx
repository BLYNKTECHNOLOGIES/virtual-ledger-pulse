
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Briefcase, Calendar, FileText } from "lucide-react";
import { CreateJobPostingDialog } from "./CreateJobPostingDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function RecruitmentTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: jobPostings, isLoading } = useQuery({
    queryKey: ['job-postings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <Tabs defaultValue="postings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="postings">Job Postings</TabsTrigger>
          <TabsTrigger value="applicants">Applicant Tracking</TabsTrigger>
          <TabsTrigger value="interviews">Interview Scheduling</TabsTrigger>
          <TabsTrigger value="offers">Offers & Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="postings">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Job Postings
                </CardTitle>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Briefcase className="h-4 w-4 mr-2" />
                  Create Job Posting
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading job postings...</div>
              ) : jobPostings && jobPostings.length > 0 ? (
                <div className="space-y-4">
                  {jobPostings.map((job) => (
                    <div key={job.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-lg">{job.title}</h3>
                          <p className="text-gray-600">{job.department} • {job.location}</p>
                        </div>
                        <Badge variant={job.status === 'OPEN' ? 'default' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">{job.description}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span>Experience: {job.experience_required || 'Not specified'}</span>
                        <span>Type: {job.job_type.replace('_', ' ')}</span>
                        {job.salary_range_min && job.salary_range_max && (
                          <span>Salary: ₹{job.salary_range_min} - ₹{job.salary_range_max}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No job postings created yet</p>
                  <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                    Create First Job Posting
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applicants">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Applicant Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No applicants yet</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interviews">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Interview Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No interviews scheduled</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Offers & Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No offers or documents</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateJobPostingDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}
