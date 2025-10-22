import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Download, Eye, Plus, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

export function DocumentManagementTab() {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [newDocument, setNewDocument] = useState({
    name: "",
    category: "",
    expiry_date: "",
    file: null as File | null
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("compliance_manage");

  // Fetch compliance documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ['compliance_documents', searchTerm, filterCategory],
    queryFn: async () => {
      let query = supabase
        .from('compliance_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Upload document mutation
  const uploadDocumentMutation = useMutation({
    mutationFn: async (formData: typeof newDocument) => {
      if (!formData.file) throw new Error("No file selected");

      // Upload file to storage
      const fileName = `compliance-documents/${Date.now()}-${formData.file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, formData.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(fileName);

      // Save document info to database
      const { data, error } = await supabase
        .from('compliance_documents')
        .insert([{
          name: formData.name,
          category: formData.category,
          file_url: publicUrl,
          file_type: formData.file.type,
          file_size: formData.file.size,
          expiry_date: formData.expiry_date || null,
          uploaded_by: null // Replace with actual user ID when auth is implemented
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      setNewDocument({ name: "", category: "", expiry_date: "", file: null });
      setShowUploadDialog(false);
      queryClient.invalidateQueries({ queryKey: ['compliance_documents'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive",
      });
      console.error('Upload error:', error);
    },
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    uploadDocumentMutation.mutate(newDocument);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "ACTIVE": return "default";
      case "EXPIRED": return "destructive";
      case "EXPIRING_SOON": return "secondary";
      default: return "secondary";
    }
  };

  const categories = [
    "Certifications", "Licenses", "Contracts", "Agreements", 
    "Legal Documents", "Compliance Certificates", "Other"
  ];

  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || doc.category === filterCategory;
    return matchesSearch && matchesCategory;
  }) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Management
            </CardTitle>
            <ViewOnlyWrapper isViewOnly={!canManage}>
              <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Upload New Document</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Document Name *</Label>
                    <Input
                      value={newDocument.name}
                      onChange={(e) => setNewDocument(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter document name"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select 
                      value={newDocument.category} 
                      onValueChange={(value) => setNewDocument(prev => ({ ...prev, category: value }))}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Expiry Date (Optional)</Label>
                    <Input
                      type="date"
                      value={newDocument.expiry_date}
                      onChange={(e) => setNewDocument(prev => ({ ...prev, expiry_date: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>File *</Label>
                    <Input
                      type="file"
                      onChange={(e) => setNewDocument(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      required
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowUploadDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={uploadDocumentMutation.isPending}>
                      {uploadDocumentMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </ViewOnlyWrapper>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">Loading documents...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents found. Upload your first document to get started.
              </div>
            ) : (
              filteredDocuments.map((document) => (
                <div key={document.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{document.name}</h4>
                      <p className="text-sm text-gray-600">{document.category}</p>
                    </div>
                    <Badge variant={getStatusVariant(document.status)}>
                      {document.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="font-medium">File Type:</span> {document.file_type}
                    </div>
                    <div>
                      <span className="font-medium">Size:</span> {document.file_size ? `${Math.round(document.file_size / 1024)} KB` : 'N/A'}
                    </div>
                    {document.expiry_date && (
                      <div>
                        <span className="font-medium">Expires:</span> {new Date(document.expiry_date).toLocaleDateString()}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Uploaded:</span> {new Date(document.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={document.file_url} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={document.file_url} download>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}