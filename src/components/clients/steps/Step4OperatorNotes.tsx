import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, User, CreditCard, Building2 } from "lucide-react";

interface Step4OperatorNotesProps {
  formData: any;
  setFormData: (data: any) => void;
}

export function Step4OperatorNotes({ formData, setFormData }: Step4OperatorNotesProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Review & Add Notes</h3>
        <p className="text-gray-600">Review the client information and add any operator notes</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Client Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p><strong>Name:</strong> {formData.name || 'Not provided'}</p>
              <p><strong>Type:</strong> {formData.client_type || 'Not selected'}</p>
              <p><strong>Email:</strong> {formData.email || 'Not provided'}</p>
              <p><strong>Phone:</strong> {formData.phone || 'Not provided'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              KYC Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>✓ PAN Card: {formData.pan_card_file ? 'Uploaded' : 'Missing'}</p>
              <p>✓ Aadhar Front: {formData.aadhar_front_file ? 'Uploaded' : 'Missing'}</p>
              <p>✓ Aadhar Back: {formData.aadhar_back_file ? 'Uploaded' : 'Missing'}</p>
              <p>+ Other Docs: {formData.other_docs_files?.length || 0} files</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Bank Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {formData.linked_bank_accounts?.length > 0 ? (
                formData.linked_bank_accounts.map((account: any, index: number) => (
                  <p key={index}>
                    {account.bankName} - {account.accountType}
                  </p>
                ))
              ) : (
                <p className="text-gray-500">No bank accounts added</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operator Notes */}
      <div className="space-y-3">
        <Label htmlFor="operator_notes">Operator Notes</Label>
        <Textarea
          id="operator_notes"
          value={formData.operator_notes || ''}
          onChange={(e) => setFormData({ ...formData, operator_notes: e.target.value })}
          placeholder="Add any important notes about this client, special instructions, or observations..."
          rows={6}
          className="resize-none"
        />
        <p className="text-sm text-gray-500">
          These notes will be visible to all operators and can include information about client preferences, 
          special requirements, risk assessments, or any other relevant details.
        </p>
      </div>

      {/* Final Validation Summary */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-green-800">Ready to Create Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-green-800 mb-2">Required Information:</p>
              <ul className="space-y-1 text-green-700">
                <li>✓ Client name provided</li>
                <li>✓ Client type selected</li>
                <li>✓ PAN Card uploaded</li>
                <li>✓ Aadhar Cards uploaded</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-green-800 mb-2">Additional Info:</p>
              <ul className="space-y-1 text-green-700">
                <li>{formData.email ? '✓' : '○'} Email address</li>
                <li>{formData.phone ? '✓' : '○'} Phone number</li>
                <li>{formData.linked_bank_accounts?.length > 0 ? '✓' : '○'} Bank accounts</li>
                <li>{formData.operator_notes ? '✓' : '○'} Operator notes</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}