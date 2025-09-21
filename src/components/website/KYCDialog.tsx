import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { INDIAN_STATES_AND_UTS } from '@/data/indianStatesAndUTs';
import { 
  User, 
  CreditCard, 
  Building2,
  CheckCircle,
  Upload,
  ArrowRight,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface KYCDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KYCDialog({ open, onOpenChange }: KYCDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleted, setIsCompleted] = useState(false);
  const [formData, setFormData] = useState({
    // Personal Information
    fullName: '',
    email: '',
    mobile: '',
    
    // Address Details
    permanentAddress: '',
    state: '',
    city: '',
    pincode: '',
    
    // Identity Documents
    documentType: '',
    documentNumber: '',
    
    // Bank Details
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    
    // Video KYC Status
    vkycScheduled: false,
    
    // Declarations
    detailsConfirmed: false,
    termsAccepted: false
  });

  const steps = [
    { number: 1, title: 'Personal Info', icon: User, description: 'Basic details' },
    { number: 2, title: 'Address', icon: Building2, description: 'Your address' },
    { number: 3, title: 'Identity', icon: CreditCard, description: 'ID documents' },
    { number: 4, title: 'Bank Details', icon: Building2, description: 'Account info' },
    { number: 5, title: 'Video KYC', icon: CheckCircle, description: 'Live verification' },
    { number: 6, title: 'Review & Submit', icon: CheckCircle, description: 'Final review' }
  ];

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return formData.fullName && formData.mobile;
      case 2:
        return formData.permanentAddress && formData.state && formData.city && formData.pincode;
      case 3:
        return formData.documentType && formData.documentNumber;
      case 4:
        return formData.accountHolderName && formData.bankName && formData.accountNumber && formData.ifscCode;
      case 5:
        return true; // Video KYC is optional
      case 6:
        return formData.detailsConfirmed && formData.termsAccepted;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateCurrentStep()) {
      toast({
        title: "Missing Information",
        description: "Please fill all required fields before proceeding.",
        variant: "destructive"
      });
      return;
    }
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === 6) {
      // Complete basic KYC
      setIsCompleted(true);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCompleteKYC = () => {
    // Close dialog
    onOpenChange(false);
    setIsCompleted(false);
    setCurrentStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">
            Complete Your KYC Verification
          </DialogTitle>
          <p className="text-center text-muted-foreground">
            Quick verification to start trading securely
          </p>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                currentStep >= step.number 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {currentStep > step.number ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  step.number
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-8 h-px mx-2 ${
                  currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {/* Success/Completion Screen */}
          {isCompleted ? (
            <div className="space-y-6">
              <div className="text-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-semibold text-green-900 mb-2">
                  Thank You for Completing Basic KYC!
                </h3>
                <p className="text-green-700 mb-6">
                  Your KYC documents are being reviewed by our compliance team. This usually takes 45-60 minutes.
                </p>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <Shield className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-green-900 mb-2">
                  What's Next?
                </h4>
                <div className="space-y-3 text-left">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">You will receive a call within 24 hours</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Complete document verification with our executive</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Start trading once your KYC is fully approved</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <Button onClick={handleCompleteKYC} className="bg-green-600 hover:bg-green-700 px-8">
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Personal Information */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <User className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Personal Information</h3>
                    <p className="text-sm text-muted-foreground">Tell us about yourself</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      placeholder="Enter your full legal name"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email ID (Optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Enter your email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobile">Mobile Number *</Label>
                      <Input
                        id="mobile"
                        value={formData.mobile}
                        onChange={(e) => handleInputChange('mobile', e.target.value)}
                        placeholder="Enter mobile number"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Address Details */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Address Details</h3>
                    <p className="text-sm text-muted-foreground">Your permanent address</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="permanentAddress">Permanent Address *</Label>
                    <Textarea
                      id="permanentAddress"
                      value={formData.permanentAddress}
                      onChange={(e) => handleInputChange('permanentAddress', e.target.value)}
                      placeholder="Enter your permanent address"
                      rows={3}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES_AND_UTS.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Enter city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode *</Label>
                      <Input
                        id="pincode"
                        value={formData.pincode}
                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                        placeholder="Enter pincode"
                        maxLength={6}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Identity Documents */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <CreditCard className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Identity Documents</h3>
                    <p className="text-sm text-muted-foreground">ID document details</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="documentType">Document Type *</Label>
                      <Select value={formData.documentType} onValueChange={(value) => handleInputChange('documentType', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                          <SelectItem value="pan">PAN Card</SelectItem>
                          <SelectItem value="passport">Passport</SelectItem>
                          <SelectItem value="driving_license">Driving License</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="documentNumber">Document Number *</Label>
                      <Input
                        id="documentNumber"
                        value={formData.documentNumber}
                        onChange={(e) => handleInputChange('documentNumber', e.target.value)}
                        placeholder="Enter document number"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Bank Details */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Bank Details</h3>
                    <p className="text-sm text-muted-foreground">Add your bank account information</p>
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Important:</p>
                        <p className="text-sm text-yellow-700">
                          Account holder name must match your KYC name. Third-party payments are not allowed.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="accountHolderName">Account Holder Name *</Label>
                      <Input
                        id="accountHolderName"
                        value={formData.accountHolderName}
                        onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
                        placeholder="Must match KYC name"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="bankName">Bank Name *</Label>
                      <Input
                        id="bankName"
                        value={formData.bankName}
                        onChange={(e) => handleInputChange('bankName', e.target.value)}
                        placeholder="Enter bank name"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="accountNumber">Account Number *</Label>
                      <Input
                        id="accountNumber"
                        value={formData.accountNumber}
                        onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                        placeholder="Enter account number"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="ifscCode">IFSC Code *</Label>
                      <Input
                        id="ifscCode"
                        value={formData.ifscCode}
                        onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                        placeholder="Enter IFSC code"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="bankStatement">Bank Statement (Past 30 Days) *</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Upload past 30 days bank statement to verify proof of funds
                    </p>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700 mb-1">Upload Bank Statement</p>
                      <p className="text-xs text-gray-500 mb-3">PDF (Max 5MB)</p>
                      <Button variant="outline" size="sm">
                        Choose File
                      </Button>
                      <p className="text-xs text-red-600 mt-2">* Required document</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Video KYC Verification */}
              {currentStep === 5 && (
                <div className="space-y-6">
                  <div className="text-center mb-4">
                    <CheckCircle className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Video KYC Verification</h3>
                    <p className="text-sm text-muted-foreground">
                      Complete your verification with a live video call (optional but recommended)
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                    <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h4 className="text-lg font-semibold text-blue-900 mb-2">
                      Choose Your Verification Method
                    </h4>
                    <p className="text-blue-700 mb-4">
                      Complete your verification with a live video call. This step is optional but 
                      recommended for faster approval.
                    </p>
                    
                    <div className="space-y-2 text-left mb-6">
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Hold your document in hand & look into camera</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Read the random code/phrase shown on screen</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Ensure good lighting and clear audio</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Process takes about 5-10 minutes</span>
                      </div>
                    </div>

                    <div className="flex gap-3 justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          // Handle fix/go back functionality
                          setCurrentStep(1);
                        }}
                        className="flex-1 max-w-40"
                      >
                        Fix Details
                      </Button>
                      <Button 
                        onClick={() => {
                          // Handle VKYC booking
                          setFormData(prev => ({ ...prev, vkycScheduled: true }));
                          setCurrentStep(6);
                        }}
                        className="flex-1 max-w-40 bg-blue-600 hover:bg-blue-700"
                      >
                        Book VKYC Slot
                      </Button>
                    </div>
                    
                    <p className="text-xs text-blue-600 mt-3">
                      Skip this step if you prefer manual document verification
                    </p>
                  </div>
                </div>
              )}
            </>
              )}

              {/* Step 6: Review & Submit */}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <div className="text-center mb-4">
                    <CheckCircle className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Review & Submit</h3>
                    <p className="text-sm text-muted-foreground">
                      Final review and submission
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h4 className="text-lg font-semibold mb-4">Review Your Information</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-sm"><strong>Name:</strong> {formData.fullName}</p>
                        <p className="text-sm"><strong>Email:</strong> {formData.email || 'Not provided'}</p>
                        <p className="text-sm"><strong>Mobile:</strong> {formData.mobile}</p>
                        <p className="text-sm"><strong>Document:</strong> {formData.documentType}</p>
                        <p className="text-sm"><strong>Bank:</strong> {formData.bankName}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm"><strong>State:</strong> {formData.state}</p>
                        <p className="text-sm"><strong>City:</strong> {formData.city}</p>
                        <p className="text-sm"><strong>Account Holder:</strong> {formData.accountHolderName}</p>
                        <p className="text-sm"><strong>IFSC:</strong> {formData.ifscCode}</p>
                        <p className="text-sm"><strong>Video KYC:</strong> 
                          <span className="text-green-600 font-medium">
                            {formData.vkycScheduled ? ' Scheduled' : ' Skipped'}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="detailsConfirmed" 
                        checked={formData.detailsConfirmed}
                        onCheckedChange={(checked) => handleInputChange('detailsConfirmed', checked as boolean)}
                      />
                      <label htmlFor="detailsConfirmed" className="text-sm text-gray-700">
                        I confirm that the above details are correct and belong to me.
                      </label>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="termsAccepted" 
                        checked={formData.termsAccepted}
                        onCheckedChange={(checked) => handleInputChange('termsAccepted', checked as boolean)}
                      />
                      <label htmlFor="termsAccepted" className="text-sm text-gray-700">
                        I agree to the <a href="/website/terms-of-service" className="text-blue-600 hover:underline">Terms & Privacy Policy</a>.
                      </label>
                    </div>
                  </div>
                </div>
              )}
        </div>

        {/* Navigation Buttons */}
        {!isCompleted && (
          <div className="flex justify-between pt-6">
            <Button 
              variant="outline" 
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              Previous
            </Button>
            
            {currentStep < 6 && (
              <Button 
                onClick={nextStep} 
                className="bg-blue-600 hover:bg-blue-700"
              >
                Next Step
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {currentStep === 6 && (
              <Button 
                onClick={nextStep} 
                disabled={!formData.detailsConfirmed || !formData.termsAccepted}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Submit KYC for Review
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}