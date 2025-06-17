import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Upload, Scale, Calendar, MessageSquare, Download, Eye, AlertTriangle } from "lucide-react";
import { DocumentUploadDialog } from "./DocumentUploadDialog";

export function LegalComplianceTab() {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [documents] = useState([
    { id: 1, name: "Company Registration Certificate", category: "Certifications", status: "Active", expiry: null },
    { id: 2, name: "GST Registration", category: "Licenses", status: "Active", expiry: "2026-03-31" },
    { id: 3, name: "Service Agreement - ABC Corp", category: "Contracts", status: "Active", expiry: "2025-12-31" },
    { id: 4, name: "Office Lease Agreement", category: "Agreements", status: "Expired", expiry: "2025-05-31" },
    { id: 5, name: "Professional Tax License", category: "Licenses", status: "Active", expiry: "2025-09-15" },
  ]);

  const [legalActions] = useState([
    { id: 1, title: "Contract Dispute - XYZ Ltd", status: "Ongoing", court: "Delhi High Court", nextDate: "2025-07-15" },
    { id: 2, title: "IP Infringement Case", status: "Resolved", court: "Supreme Court", nextDate: "N/A" },
  ]);

  // Check for documents expiring within 90 days
  const getExpiringDocuments = () => {
    const today = new Date();
    const ninetyDaysFromNow = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000));
    
    return documents.filter(doc => {
      if (!doc.expiry) return false;
      const expiryDate = new Date(doc.expiry);
      return expiryDate <= ninetyDaysFromNow && expiryDate >= today;
    });
  };

  const expiringDocuments = getExpiringDocuments();

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No expiry";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "default";
      case "Expired": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      {/* Expiry Alerts */}
      {expiringDocuments.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Documents Expiring Soon:</strong> {expiringDocuments.length} document(s) will expire within 90 days.
            {expiringDocuments.map(doc => (
              <div key={doc.id} className="mt-1">
                • {doc.name} expires on {formatDate(doc.expiry)}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

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
                <Button onClick={() => setShowUploadDialog(true)}>
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
                      <p className="text-sm text-gray-500">
                        Expires: {formatDate(doc.expiry)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusColor(doc.status)}>
                        {doc.status}
                      </Badge>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
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
                {expiringDocuments.map((doc) => (
                  <div key={doc.id} className="p-4 border rounded-lg bg-yellow-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-yellow-600" />
                      <span className="font-semibold text-yellow-800">Expiring Soon</span>
                    </div>
                    <p className="text-sm text-yellow-700">
                      {doc.name} expires on {formatDate(doc.expiry)}
                    </p>
                    <Button size="sm" className="mt-2" variant="outline">
                      Renew Document
                    </Button>
                  </div>
                ))}
                
                {documents.filter(doc => doc.status === "Expired").map((doc) => (
                  <div key={doc.id} className="p-4 border rounded-lg bg-red-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-red-600" />
                      <span className="font-semibold text-red-800">Expired</span>
                    </div>
                    <p className="text-sm text-red-700">
                      {doc.name} expired on {formatDate(doc.expiry)}
                    </p>
                    <Button size="sm" className="mt-2" variant="destructive">
                      Renew Now
                    </Button>
                  </div>
                ))}
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

      <DocumentUploadDialog 
        open={showUploadDialog} 
        onOpenChange={setShowUploadDialog} 
      />
    </div>
  );
}
