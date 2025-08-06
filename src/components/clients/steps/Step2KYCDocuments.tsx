import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface Step2KYCDocumentsProps {
  formData: any;
  setFormData: (data: any) => void;
}

interface AdditionalDocument {
  id: string;
  name: string;
  file: File | null;
}

export function Step2KYCDocuments({ formData, setFormData }: Step2KYCDocumentsProps) {
  const [additionalDocs, setAdditionalDocs] = useState<AdditionalDocument[]>([]);

  const addAdditionalDocument = () => {
    const newDoc: AdditionalDocument = {
      id: Date.now().toString(),
      name: "",
      file: null
    };
    setAdditionalDocs([...additionalDocs, newDoc]);
  };

  const removeAdditionalDocument = (id: string) => {
    const updatedDocs = additionalDocs.filter(doc => doc.id !== id);
    setAdditionalDocs(updatedDocs);
    
    // Update formData to remove the file
    const updatedFiles = formData.other_docs_files.filter((_: any, index: number) => {
      const docIndex = additionalDocs.findIndex(doc => doc.id === id);
      return index !== docIndex;
    });
    setFormData({ ...formData, other_docs_files: updatedFiles });
  };

  const updateAdditionalDocName = (id: string, name: string) => {
    setAdditionalDocs(additionalDocs.map(doc => 
      doc.id === id ? { ...doc, name } : doc
    ));
  };

  const updateAdditionalDocFile = (id: string, file: File | null) => {
    const docIndex = additionalDocs.findIndex(doc => doc.id === id);
    const updatedFiles = [...formData.other_docs_files];
    
    if (file) {
      updatedFiles[docIndex] = file;
    } else {
      updatedFiles.splice(docIndex, 1);
    }
    
    setFormData({ ...formData, other_docs_files: updatedFiles });
    
    setAdditionalDocs(additionalDocs.map(doc => 
      doc.id === id ? { ...doc, file } : doc
    ));
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">KYC Documents</h3>
        <p className="text-gray-600">Please upload the required documents for verification</p>
      </div>

      {/* Required Documents */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Required Documents</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pan_card">PAN Card *</Label>
            <Input
              id="pan_card"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFormData({ ...formData, pan_card_file: file });
              }}
              required
            />
            {formData.pan_card_file && (
              <p className="text-sm text-green-600 mt-1">✓ {formData.pan_card_file.name}</p>
            )}
          </div>

          <div>
            <Label htmlFor="aadhar_front">Aadhar Card (Front) *</Label>
            <Input
              id="aadhar_front"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFormData({ ...formData, aadhar_front_file: file });
              }}
              required
            />
            {formData.aadhar_front_file && (
              <p className="text-sm text-green-600 mt-1">✓ {formData.aadhar_front_file.name}</p>
            )}
          </div>
        </div>

        <div className="w-1/2">
          <Label htmlFor="aadhar_back">Aadhar Card (Back) *</Label>
          <Input
            id="aadhar_back"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setFormData({ ...formData, aadhar_back_file: file });
            }}
            required
          />
          {formData.aadhar_back_file && (
            <p className="text-sm text-green-600 mt-1">✓ {formData.aadhar_back_file.name}</p>
          )}
        </div>
      </div>

      {/* Additional Documents */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900">Additional Documents</h4>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addAdditionalDocument}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
        </div>

        {additionalDocs.map((doc) => (
          <div key={doc.id} className="flex items-end gap-2 p-3 border rounded-lg">
            <div className="flex-1">
              <Label htmlFor={`doc_name_${doc.id}`}>Document Name</Label>
              <Input
                id={`doc_name_${doc.id}`}
                value={doc.name}
                onChange={(e) => updateAdditionalDocName(doc.id, e.target.value)}
                placeholder="e.g., Passport, Driving License, etc."
              />
            </div>
            <div className="flex-1">
              <Label htmlFor={`doc_file_${doc.id}`}>Document File</Label>
              <Input
                id={`doc_file_${doc.id}`}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  updateAdditionalDocFile(doc.id, file);
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeAdditionalDocument(doc.id)}
              className="mb-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {additionalDocs.length === 0 && (
          <p className="text-gray-500 text-sm italic">No additional documents added. Click "Add Document" to include more KYC documents.</p>
        )}
      </div>
    </div>
  );
}