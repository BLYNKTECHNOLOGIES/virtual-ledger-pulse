import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, UserPlus, Calendar, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreateJobPostingDialog } from "./CreateJobPostingDialog";
import { AddApplicantDialog } from "./AddApplicantDialog";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";
import { AddOfferDocumentDialog } from "./AddOfferDocumentDialog";
import { PendingInterviewsTable } from "./PendingInterviewsTable";
import { OfferDocumentsTable } from "./OfferDocumentsTable";

export function RecruitmentTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [showApplicantDialog, setShowApplicantDialog] = useState(false);
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);

  // Fetch job postings
  const { data: jobPostings, isLoading: jobsLoading } = useQuery({
    queryKey: ['job_postings', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('job_postings')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,department.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch job applicants
  const { data: applicants, isLoading: applicantsLoading } = useQuery({
    queryKey: ['job_applicants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applicants')
        .select(`
          *,
          job_postings:job_posting_id(title, department)
        `)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Delete job posting mutation
  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('job_postings')
        .delete()
        .eq('id', jobId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Job Posting Deleted",
        description: "Job posting has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['job_postings'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete job posting: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mark job as filled mutation
  const markJobFilledMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('job_postings')
        .update({ status: 'CLOSED' })
        .eq('id', jobId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Job Marked as Filled",
        description: "Job posting has been marked as filled.",
      });
      queryClient.invalidateQueries({ queryKey: ['job_postings'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update job status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mark applicant as not interested mutation
  const markNotInterestedMutation = useMutation({
    mutationFn: async (applicantId: string) => {
      const { error } = await supabase
        .from('job_applicants')
        .update({ is_interested: false, status: 'NOT_INTERESTED' })
        .eq('id', applicantId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Applicant Updated",
        description: "Applicant has been marked as not interested.",
      });
      queryClient.invalidateQueries({ queryKey: ['job_applicants'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update applicant: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const colors = {
      'OPEN': 'bg-green-100 text-green-800',
      'CLOSED': 'bg-gray-100 text-gray-800',
      'APPLIED': 'bg-blue-100 text-blue-800',
      'INTERVIEW': 'bg-yellow-100 text-yellow-800',
      'SELECTED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800',
      'NOT_INTERESTED': 'bg-gray-100 text-gray-800',
      'ONBOARDED': 'bg-purple-100 text-purple-800'
    };
    return <Badge className={colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex gap-4">
        <Button onClick={() => setShowJobDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Job Posting
        </Button>
        <Button onClick={() => setShowApplicantDialog(true)} variant="outline">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Applicant
        </Button>
        <Button onClick={() => setShowInterviewDialog(true)} variant="outline">
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Interview
        </Button>
        <Button onClick={() => setShowOfferDialog(true)} variant="outline">
          <FileText className="h-4 w-4 mr-2" />
          Add Offer Document
        </Button>
      </div>

      {/* Pending Interviews */}
      <PendingInterviewsTable />

      {/* Offer Documents */}
      <OfferDocumentsTable />

      {/* Job Postings */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Job Postings</CardTitle>
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search job postings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="text-center py-8">Loading job postings...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Job Title</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Department</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Job Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Salary Range</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobPostings?.map((job) => (
                    <tr key={job.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{job.title}</td>
                      <td className="py-3 px-4">{job.department}</td>
                      <td className="py-3 px-4">{job.job_type}</td>
                      <td className="py-3 px-4">{getStatusBadge(job.status)}</td>
                      <td className="py-3 px-4">
                        {job.salary_range_min && job.salary_range_max 
                          ? `₹${job.salary_range_min} - ₹${job.salary_range_max}`
                          : 'Not specified'
                        }
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => markJobFilledMutation.mutate(job.id)}
                            disabled={job.status === 'CLOSED'}
                          >
                            Mark as Filled
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => deleteJobMutation.mutate(job.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {jobPostings?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No job postings found. Create your first job posting to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Applicants */}
      <Card>
        <CardHeader>
          <CardTitle>Job Applicants</CardTitle>
        </CardHeader>
        <CardContent>
          {applicantsLoading ? (
            <div className="text-center py-8">Loading applicants...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Position Applied</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Stage</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants?.map((applicant) => (
                    <tr key={applicant.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{applicant.name}</td>
                      <td className="py-3 px-4">{applicant.email}</td>
                      <td className="py-3 px-4">
                        {applicant.job_postings?.title} - {applicant.job_postings?.department}
                      </td>
                      <td className="py-3 px-4">{applicant.stage}</td>
                      <td className="py-3 px-4">{getStatusBadge(applicant.status)}</td>
                      <td className="py-3 px-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => markNotInterestedMutation.mutate(applicant.id)}
                          disabled={!applicant.is_interested}
                        >
                          Mark Not Interested
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {applicants?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No applicants found. Add your first applicant to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateJobPostingDialog open={showJobDialog} onOpenChange={setShowJobDialog} />
      <AddApplicantDialog open={showApplicantDialog} onOpenChange={setShowApplicantDialog} />
      <ScheduleInterviewDialog open={showInterviewDialog} onOpenChange={setShowInterviewDialog} />
      <AddOfferDocumentDialog open={showOfferDialog} onOpenChange={setShowOfferDialog} />
    </div>
  );
}
