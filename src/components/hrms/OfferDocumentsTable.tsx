
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye } from "lucide-react";

export function OfferDocumentsTable() {
  const { data: offerDocuments, isLoading } = useQuery({
    queryKey: ['offer_documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offer_documents')
        .select(`
          *,
          job_applicants:applicant_id(
            name,
            email,
            job_postings:job_posting_id(title, department)
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Offer Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading offer documents...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Offer Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        {offerDocuments && offerDocuments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Candidate</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Position</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Document Type</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Sent Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Response Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offerDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{doc.job_applicants?.name}</p>
                        <p className="text-sm text-gray-500">{doc.job_applicants?.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{doc.job_applicants?.job_postings?.title}</p>
                        <p className="text-sm text-gray-500">{doc.job_applicants?.job_postings?.department}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline">{doc.document_type}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      {doc.sent_date ? new Date(doc.sent_date).toLocaleDateString() : 'Not sent'}
                    </td>
                    <td className="py-3 px-4">
                      {doc.response_date ? new Date(doc.response_date).toLocaleDateString() : 'Pending'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={getStatusColor(doc.status)}>{doc.status}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {doc.document_url && (
                          <>
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button size="sm" variant="outline">
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="outline">Edit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No offer documents found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
