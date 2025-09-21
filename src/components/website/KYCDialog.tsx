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
    
    // Declarations
    detailsConfirmed: false,
    termsAccepted: false
  });

  const steps = [
    { number: 1, title: 'Personal Info', icon: User, description: 'Basic details' },
    { number: 2, title: 'Address', icon: Building2, description: 'Your address' },
    { number: 3, title: 'Identity', icon: CreditCard, description: 'ID documents' },
    { number: 4, title: 'Submit', icon: CheckCircle, description: 'Complete basic KYC' }
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
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === 4) {
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
                  Our customer executive will contact you for advance KYC verification.
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

              {/* Step 4: Complete Basic KYC */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-4">
                    <CheckCircle className="h-12 w-12 text-blue-600 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">Complete Basic KYC</h3>
                    <p className="text-sm text-muted-foreground">
                      Submit your basic information for initial verification
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                    <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h4 className="text-lg font-semibold text-blue-900 mb-2">
                      Ready to Submit Basic KYC
                    </h4>
                    <p className="text-blue-700 mb-4">
                      By submitting, you agree that all provided information is accurate. 
                      Our customer executive will contact you within 24 hours for advanced KYC verification.
                    </p>
                    
                    <div className="space-y-2 text-left">
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Personal information verified</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Address details confirmed</span>
                      </div>
                      <div className="flex items-center gap-2 text-blue-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Identity documents noted</span>
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
                        I confirm that all the details provided are accurate and up-to-date.
                      </label>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="termsAccepted" 
                        checked={formData.termsAccepted}
                        onCheckedChange={(checked) => handleInputChange('termsAccepted', checked as boolean)}
                      />
                      <label htmlFor="termsAccepted" className="text-sm text-gray-700">
                        I agree to the <a href="/website/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="/website/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</a>.
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
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
            
            <Button 
              onClick={nextStep} 
              disabled={currentStep === 4 && (!formData.detailsConfirmed || !formData.termsAccepted)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {currentStep === 4 ? 'Submit Basic KYC' : 'Next Step'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}