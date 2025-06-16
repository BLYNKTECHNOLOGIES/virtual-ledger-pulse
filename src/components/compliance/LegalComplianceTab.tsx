
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Scale, Calendar, MessageSquare } from "lucide-react";

export function LegalComplianceTab() {
  const [documents] = useState([
    { id: 1, name: "Company Registration Certificate", category: "Certifications", status: "Active", expiry: "N/A" },
    { id: 2, name: "GST Registration", category: "Licenses", status: "Active", expiry: "2026-03-31" },
    { id: 3, name: "Service Agreement - ABC Corp", category: "Contracts", status: "Active", expiry: "2025-12-31" },
    { id: 4, name: "Office Lease Agreement", category: "Agreements", status: "Expired", expiry: "2025-05-31" },
  ]);

  const [legalActions] = useState([
    { id: 1, title: "Contract Dispute - XYZ Ltd", status: "Ongoing", court: "Delhi High Court", nextDate: "2025-07-15" },
    { id: 2, title: "IP Infringement Case", status: "Resolved", court: "Supreme Court", nextDate: "N/A" },
  ]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="documents">Document Management</TabsTrigger>
          <TabsTrigger value="expiration">Expiration Management</TabsTrigger>
          <TabsTrigger value="legal-actions">Legal Actions</TabsTrigger>
          <TabsTrigger value="communications">Legal Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Legal Document Management
                </CardTitle>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-semibold">{doc.name}</h3>
                      <p className="text-sm text-gray-600">{doc.category}</p>
                      <p className="text-sm text-gray-500">Expires: {doc.expiry}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={doc.status === "Active" ? "default" : "destructive"}>
                        {doc.status}
                      </Badge>
                      <Button variant="outline" size="sm">View</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Document Expiration Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-yellow-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-yellow-600" />
                    <span className="font-semibold text-yellow-800">Expiring Soon</span>
                  </div>
                  <p className="text-sm text-yellow-700">Service Agreement - ABC Corp expires on Dec 31, 2025</p>
                </div>
                <div className="p-4 border rounded-lg bg-red-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-red-600" />
                    <span className="font-semibold text-red-800">Expired</span>
                  </div>
                  <p className="text-sm text-red-700">Office Lease Agreement expired on May 31, 2025</p>
                  <Button size="sm" className="mt-2" variant="destructive">Renew Now</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legal-actions">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Legal Action Tracking
                </CardTitle>
                <Button>
                  <Scale className="h-4 w-4 mr-2" />
                  Add Legal Case
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {legalActions.map((action) => (
                  <div key={action.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{action.title}</h3>
                      <Badge variant={action.status === "Ongoing" ? "secondary" : "default"}>
                        {action.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">Court: {action.court}</p>
                    <p className="text-sm text-gray-500">Next hearing: {action.nextDate}</p>
                    <Button variant="outline" size="sm" className="mt-2">View Details</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Legal Communications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">Meeting with Legal Advisor</h3>
                    <span className="text-sm text-gray-500">June 10, 2025</span>
                  </div>
                  <p className="text-sm text-gray-600">Discussed contract dispute strategy and next steps</p>
                  <p className="text-sm text-gray-500">Contact: Advocate Sharma & Associates</p>
                </div>
                <Button>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Log Communication
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
