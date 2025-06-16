
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Calendar, FileText, User } from "lucide-react";

export function RecruitmentTab() {
  const [jobPostings] = useState([
    { id: 1, title: "Software Engineer", department: "IT", status: "Open", applications: 15 },
    { id: 2, title: "Sales Manager", department: "Sales", status: "On Hold", applications: 8 },
    { id: 3, title: "HR Executive", department: "HR", status: "Closed", applications: 23 },
  ]);

  const [applicants] = useState([
    { id: 1, name: "John Doe", position: "Software Engineer", status: "Interview Scheduled", email: "john@example.com" },
    { id: 2, name: "Jane Smith", position: "Sales Manager", status: "Under Review", email: "jane@example.com" },
    { id: 3, name: "Mike Johnson", position: "HR Executive", status: "Offered", email: "mike@example.com" },
  ]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Job Postings</TabsTrigger>
          <TabsTrigger value="applicants">Applicant Tracking</TabsTrigger>
          <TabsTrigger value="interviews">Interview Scheduling</TabsTrigger>
          <TabsTrigger value="offers">Offer Management</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Job Postings
                </CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Job Posting
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {jobPostings.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">{job.title}</h3>
                      <p className="text-sm text-gray-600">{job.department} Department</p>
                      <p className="text-sm text-gray-500">{job.applications} applications</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={job.status === "Open" ? "default" : job.status === "On Hold" ? "secondary" : "outline"}>
                        {job.status}
                      </Badge>
                      <Button variant="outline" size="sm">View Details</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applicants">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Applicant Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Input placeholder="Search applicants..." className="flex-1" />
                  <Button variant="outline">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {applicants.map((applicant) => (
                  <div key={applicant.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">{applicant.name}</h3>
                      <p className="text-sm text-gray-600">{applicant.position}</p>
                      <p className="text-sm text-gray-500">{applicant.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={applicant.status === "Offered" ? "default" : "secondary"}>
                        {applicant.status}
                      </Badge>
                      <Button variant="outline" size="sm">View Profile</Button>
                    </div>
                  </div>
                ))}
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
                <Button className="mt-4">Schedule Interview</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <Card>
            <CardHeader>
              <CardTitle>Offer Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No offers generated</p>
                <Button className="mt-4">Create Offer Letter</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
