import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Target, MessageSquare, TrendingUp } from "lucide-react";
import { PerformanceReviewDialog } from "./PerformanceReviewDialog";
import { FeedbackSubmissionDialog } from "./FeedbackSubmissionDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function PerformanceTab() {
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  const { data: performanceReviews, isLoading } = useQuery({
    queryKey: ['performance_reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_reviews')
        .select(`
          *,
          employees:employee_id(name, employee_id, department)
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
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Performance Reviews</TabsTrigger>
          <TabsTrigger value="goals">Goal Setting</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Management</TabsTrigger>
          <TabsTrigger value="appraisal">Appraisal & Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Performance Reviews
                </CardTitle>
                <Button onClick={() => setShowReviewDialog(true)}>
                  <Trophy className="h-4 w-4 mr-2" />
                  Start Review Cycle
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading performance reviews...</div>
              ) : performanceReviews && performanceReviews.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Employee</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Review Period</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Review Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Score</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Supervisor</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceReviews.map((review) => (
                        <tr key={review.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{review.employees?.name}</p>
                              <p className="text-sm text-blue-600">{review.employees?.employee_id}</p>
                              <p className="text-sm text-gray-500">{review.employees?.department}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">{review.review_period}</td>
                          <td className="py-3 px-4">{new Date(review.review_date).toLocaleDateString()}</td>
                          <td className="py-3 px-4">
                            {review.final_score ? `${review.final_score.toFixed(1)}%` : 'Pending'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={getStatusColor(review.status)}>{review.status}</Badge>
                          </td>
                          <td className="py-3 px-4">{review.supervisor_name || 'TBD'}</td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">View</Button>
                              <Button size="sm" variant="outline">Edit</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold">Q2 2025 Performance Review</h3>
                      <Badge variant="secondary">Ready to Start</Badge>
                    </div>
                    <p className="text-sm text-gray-600">Review period: April - June 2025</p>
                    <p className="text-sm text-gray-500">Click "Start Review Cycle" to begin</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Goal Setting & Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No goals set for current period</p>
                <Button className="mt-4">Set Employee Goals</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Feedback Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No feedback submissions</p>
                <Button className="mt-4" onClick={() => setShowFeedbackDialog(true)}>
                  Submit Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appraisal">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Appraisal & Salary Revision
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No pending appraisals</p>
                <Button className="mt-4">Process Appraisals</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PerformanceReviewDialog 
        open={showReviewDialog} 
        onOpenChange={setShowReviewDialog}
      />

      <FeedbackSubmissionDialog 
        open={showFeedbackDialog} 
        onOpenChange={setShowFeedbackDialog}
      />
    </div>
  );
}
