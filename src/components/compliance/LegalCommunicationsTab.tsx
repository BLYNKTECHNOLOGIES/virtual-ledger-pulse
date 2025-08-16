import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Plus, Calendar, Search, Upload, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function LegalCommunicationsTab() {
  const [showNewCommDialog, setShowNewCommDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [newCommunication, setNewCommunication] = useState({
    communication_type: "",
    party_name: "",
    contact_person: "",
    subject: "",
    content: "",
    communication_date: new Date().toISOString().split('T')[0],
    follow_up_required: false,
    follow_up_date: "",
    legal_action_id: ""
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch legal communications
  const { data: communications, isLoading } = useQuery({
    queryKey: ['legal_communications', searchTerm, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('legal_communications')
        .select('*, legal_actions(title)')
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(`subject.ilike.%${searchTerm}%,party_name.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch legal actions for linking
  const { data: legalActions } = useQuery({
    queryKey: ['legal_actions_for_comm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('legal_actions')
        .select('id, title, case_number')
        .eq('status', 'ACTIVE')
        .order('title');

      if (error) throw error;
      return data || [];
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileName = `legal-communications/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, file);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(fileName);
      
      uploadedUrls.push(publicUrl);
    }
    
    return uploadedUrls;
  };

  // Create communication mutation
  const createCommunicationMutation = useMutation({
    mutationFn: async (commData: typeof newCommunication) => {
      let attachmentUrls: string[] = [];
      
      // Upload attachments if any
      if (attachments.length > 0) {
        attachmentUrls = await uploadFiles(attachments);
      }

      const { data, error } = await supabase
        .from('legal_communications')
        .insert([{
          ...commData,
          attachments: attachmentUrls,
          follow_up_date: commData.follow_up_date || null,
          legal_action_id: commData.legal_action_id || null
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Legal communication logged successfully",
      });
      setNewCommunication({
        communication_type: "",
        party_name: "",
        contact_person: "",
        subject: "",
        content: "",
        communication_date: new Date().toISOString().split('T')[0],
        follow_up_required: false,
        follow_up_date: "",
        legal_action_id: ""
      });
      setAttachments([]);
      setShowNewCommDialog(false);
      queryClient.invalidateQueries({ queryKey: ['legal_communications'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to log communication",
        variant: "destructive",
      });
      console.error('Create error:', error);
    },
  });

  const handleCreateCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    createCommunicationMutation.mutate(newCommunication);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "COMPLETED": return "default";
      case "PENDING": return "secondary";
      case "FOLLOW_UP_REQUIRED": return "destructive";
      default: return "secondary";
    }
  };

  const communicationTypes = [
    "Email", "Phone Call", "Meeting", "Letter", "Legal Notice", 
    "Court Filing", "Settlement Discussion", "Other"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Legal Communications
            </CardTitle>
            <Dialog open={showNewCommDialog} onOpenChange={setShowNewCommDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Communication
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Log New Communication</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCommunication} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Communication Type *</Label>
                      <Select 
                        value={newCommunication.communication_type} 
                        onValueChange={(value) => setNewCommunication(prev => ({ ...prev, communication_type: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {communicationTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Communication Date *</Label>
                      <Input
                        type="date"
                        value={newCommunication.communication_date}
                        onChange={(e) => setNewCommunication(prev => ({ ...prev, communication_date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Party Name *</Label>
                      <Input
                        value={newCommunication.party_name}
                        onChange={(e) => setNewCommunication(prev => ({ ...prev, party_name: e.target.value }))}
                        placeholder="Enter party name"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input
                        value={newCommunication.contact_person}
                        onChange={(e) => setNewCommunication(prev => ({ ...prev, contact_person: e.target.value }))}
                        placeholder="Enter contact person"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Subject *</Label>
                    <Input
                      value={newCommunication.subject}
                      onChange={(e) => setNewCommunication(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Enter subject"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea
                      value={newCommunication.content}
                      onChange={(e) => setNewCommunication(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Enter communication details"
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Related Legal Action (Optional)</Label>
                    <Select 
                      value={newCommunication.legal_action_id} 
                      onValueChange={(value) => setNewCommunication(prev => ({ ...prev, legal_action_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select legal action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {legalActions?.map((action) => (
                          <SelectItem key={action.id} value={action.id}>
                            {action.title} {action.case_number && `(${action.case_number})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Attachments</Label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      <Input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      />
                      <Label 
                        htmlFor="file-upload" 
                        className="cursor-pointer flex items-center justify-center space-x-2 text-gray-600"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Click to upload files</span>
                      </Label>
                    </div>
                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        {attachments.map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                            <span className="text-sm">{file.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAttachment(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="follow-up-required"
                      checked={newCommunication.follow_up_required}
                      onCheckedChange={(checked) => setNewCommunication(prev => ({ ...prev, follow_up_required: checked as boolean }))}
                    />
                    <Label htmlFor="follow-up-required">Follow-up required</Label>
                  </div>

                  {newCommunication.follow_up_required && (
                    <div className="space-y-2">
                      <Label>Follow-up Date</Label>
                      <Input
                        type="date"
                        value={newCommunication.follow_up_date}
                        onChange={(e) => setNewCommunication(prev => ({ ...prev, follow_up_date: e.target.value }))}
                      />
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowNewCommDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createCommunicationMutation.isPending}>
                      {createCommunicationMutation.isPending ? "Logging..." : "Log Communication"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search communications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FOLLOW_UP_REQUIRED">Follow-up Required</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">Loading communications...</div>
            ) : (communications?.length || 0) === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No communications found. Log your first communication to get started.
              </div>
            ) : (
              communications?.map((comm) => (
                <div key={comm.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{comm.subject}</h4>
                      <p className="text-sm text-gray-600">{comm.communication_type} with {comm.party_name}</p>
                    </div>
                    <Badge variant={getStatusVariant(comm.status)}>
                      {comm.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  
                  {comm.content && (
                    <p className="text-sm text-gray-700 mb-3">{comm.content}</p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="font-medium">Date:</span> {new Date(comm.communication_date).toLocaleDateString()}
                    </div>
                    {comm.contact_person && (
                      <div>
                        <span className="font-medium">Contact:</span> {comm.contact_person}
                      </div>
                    )}
                    {comm.legal_actions?.title && (
                      <div>
                        <span className="font-medium">Related Action:</span> {comm.legal_actions.title}
                      </div>
                    )}
                    {comm.follow_up_required && comm.follow_up_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="font-medium">Follow-up:</span> {new Date(comm.follow_up_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {comm.attachments && comm.attachments.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Attachments:</span> {comm.attachments.length} file(s)
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}