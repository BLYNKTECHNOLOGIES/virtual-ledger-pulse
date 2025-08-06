import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Video, Camera } from "lucide-react";

interface ReKYCFormProps {
  requestId: string;
  isReadOnly?: boolean;
  onClose?: () => void;
}

interface ReKYCData {
  id: string;
  status: string;
  aadhar_front_url?: string;
  aadhar_back_url?: string;
  pan_card_url?: string;
  bank_statement_url?: string;
  vkyc_video_url?: string;
  vkyc_completed: boolean;
  user_notes?: string;
  submitted_at?: string;
  review_notes?: string;
}

export function ReKYCForm({ requestId, isReadOnly = false, onClose }: ReKYCFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    aadhar_front: null as File | null,
    aadhar_back: null as File | null,
    pan_card: null as File | null,
    bank_statement: null as File | null,
    vkyc_video: null as File | null,
    user_notes: "",
    vkyc_completed: false
  });

  const { data: rekycData, isLoading } = useQuery({
    queryKey: ["rekyc-data", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rekyc_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (error) throw error;
      return data as ReKYCData;
    },
  });

  useEffect(() => {
    if (rekycData) {
      setFormData(prev => ({
        ...prev,
        user_notes: rekycData.user_notes || "",
        vkyc_completed: rekycData.vkyc_completed
      }));
    }
  }, [rekycData]);

  const uploadFile = async (file: File, bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    
    if (error) throw error;
    return data.path;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const updates: any = {
        user_notes: formData.user_notes,
        vkyc_completed: formData.vkyc_completed,
        status: "SUBMITTED",
        submitted_at: new Date().toISOString()
      };

      // Upload files if they exist
      if (formData.aadhar_front) {
        const path = `rekyc/${requestId}/aadhar_front_${Date.now()}.${formData.aadhar_front.name.split('.').pop()}`;
        const url = await uploadFile(formData.aadhar_front, "kyc-documents", path);
        updates.aadhar_front_url = url;
      }

      if (formData.aadhar_back) {
        const path = `rekyc/${requestId}/aadhar_back_${Date.now()}.${formData.aadhar_back.name.split('.').pop()}`;
        const url = await uploadFile(formData.aadhar_back, "kyc-documents", path);
        updates.aadhar_back_url = url;
      }

      if (formData.pan_card) {
        const path = `rekyc/${requestId}/pan_card_${Date.now()}.${formData.pan_card.name.split('.').pop()}`;
        const url = await uploadFile(formData.pan_card, "kyc-documents", path);
        updates.pan_card_url = url;
      }

      if (formData.bank_statement) {
        const path = `rekyc/${requestId}/bank_statement_${Date.now()}.${formData.bank_statement.name.split('.').pop()}`;
        const url = await uploadFile(formData.bank_statement, "kyc-documents", path);
        updates.bank_statement_url = url;
      }

      if (formData.vkyc_video) {
        const path = `rekyc/${requestId}/vkyc_video_${Date.now()}.${formData.vkyc_video.name.split('.').pop()}`;
        const url = await uploadFile(formData.vkyc_video, "kyc-documents", path);
        updates.vkyc_video_url = url;
      }

      const { error } = await supabase
        .from("rekyc_requests")
        .update(updates)
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rekyc-requests"] });
      toast({
        title: "Success",
        description: "ReKYC documents submitted successfully",
      });
      onClose?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (field: string, file: File | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const getFileUrl = (url?: string) => {
    if (!url) return null;
    const { data } = supabase.storage.from("kyc-documents").getPublicUrl(url);
    return data.publicUrl;
  };

  if (isLoading) {
    return <div>Loading ReKYC form...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ReKYC Document Submission</CardTitle>
          <CardDescription>
            Please upload the required documents to complete your re-verification
          </CardDescription>
          <div className="flex gap-2">
            <Badge variant={rekycData?.status === "SUBMITTED" ? "default" : "secondary"}>
              Status: {rekycData?.status?.replace("_", " ")}
            </Badge>
            {rekycData?.submitted_at && (
              <Badge variant="outline">
                Submitted: {new Date(rekycData.submitted_at).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Aadhar Front */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Aadhar Card (Front) *
            </Label>
            {isReadOnly && rekycData?.aadhar_front_url ? (
              <div className="p-4 border rounded-lg">
                <a 
                  href={getFileUrl(rekycData.aadhar_front_url) || "#"} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View Aadhar Front Document
                </a>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange("aadhar_front", e.target.files?.[0] || null)}
                disabled={isReadOnly}
              />
            )}
          </div>

          {/* Aadhar Back */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Aadhar Card (Back) *
            </Label>
            {isReadOnly && rekycData?.aadhar_back_url ? (
              <div className="p-4 border rounded-lg">
                <a 
                  href={getFileUrl(rekycData.aadhar_back_url) || "#"} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View Aadhar Back Document
                </a>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange("aadhar_back", e.target.files?.[0] || null)}
                disabled={isReadOnly}
              />
            )}
          </div>

          {/* PAN Card */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              PAN Card *
            </Label>
            {isReadOnly && rekycData?.pan_card_url ? (
              <div className="p-4 border rounded-lg">
                <a 
                  href={getFileUrl(rekycData.pan_card_url) || "#"} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View PAN Card Document
                </a>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange("pan_card", e.target.files?.[0] || null)}
                disabled={isReadOnly}
              />
            )}
          </div>

          {/* Bank Statement */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recent Bank Statement *
            </Label>
            {isReadOnly && rekycData?.bank_statement_url ? (
              <div className="p-4 border rounded-lg">
                <a 
                  href={getFileUrl(rekycData.bank_statement_url) || "#"} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View Bank Statement
                </a>
              </div>
            ) : (
              <Input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => handleFileChange("bank_statement", e.target.files?.[0] || null)}
                disabled={isReadOnly}
              />
            )}
          </div>

          {/* vKYC Video */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              vKYC Video (Face Verification)
            </Label>
            {isReadOnly && rekycData?.vkyc_video_url ? (
              <div className="p-4 border rounded-lg">
                <a 
                  href={getFileUrl(rekycData.vkyc_video_url) || "#"} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View vKYC Video
                </a>
              </div>
            ) : (
              <Input
                type="file"
                accept="video/*"
                onChange={(e) => handleFileChange("vkyc_video", e.target.files?.[0] || null)}
                disabled={isReadOnly}
              />
            )}
            
            {!isReadOnly && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="vkyc_completed"
                  checked={formData.vkyc_completed}
                  onChange={(e) => setFormData(prev => ({ ...prev, vkyc_completed: e.target.checked }))}
                />
                <label htmlFor="vkyc_completed" className="text-sm">
                  I have completed the video KYC verification
                </label>
              </div>
            )}
          </div>

          {/* User Notes */}
          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any additional information or explanations..."
              value={formData.user_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, user_notes: e.target.value }))}
              disabled={isReadOnly}
            />
          </div>

          {/* Review Notes (Read Only) */}
          {isReadOnly && rekycData?.review_notes && (
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">{rekycData.review_notes}</p>
              </div>
            </div>
          )}

          {!isReadOnly && rekycData?.status === "PENDING" && (
            <div className="flex gap-2">
              <Button 
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {submitMutation.isPending ? "Submitting..." : "Submit ReKYC"}
              </Button>
              {onClose && (
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}