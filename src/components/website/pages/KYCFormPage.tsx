import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { INDIAN_STATES_AND_UTS } from '@/data/indianStatesAndUTs';
import { 
  User, 
  Home, 
  CreditCard, 
  Video, 
  Building2, 
  CheckCircle, 
  Upload, 
  ArrowRight, 
  ArrowLeft,
  Shield,
  Phone,
  Mail,
  FileText,
  AlertTriangle
} from 'lucide-react';

export function KYCFormPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Personal Information
    fullName: '',
    dateOfBirth: '',
    gender: '',
    nationality: 'Indian',
    email: '',
    mobile: '',
    
    // Address Details
    permanentAddress: '',
    state: '',
    city: '',
    pincode: '',
    addressProof: null,
    
    // Identity Documents
    documentType: '',
    documentNumber: '',
    documentFront: null,
    documentBack: null,
    selfie: null,
    
    // Video KYC
    videoKycCompleted: false,
    
    // Bank Details
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    bankProof: null,
    
    // Declarations
    detailsConfirmed: false,
    termsAccepted: false
  });

  const [kycStatus, setKycStatus] = useState('draft'); // draft, pending, approved, rejected, query

  const steps = [
    { number: 1, title: 'Personal Information', icon: User, description: 'Tell us about yourself' },
    { number: 2, title: 'Address Details', icon: Home, description: 'Your permanent address' },
    { number: 3, title: 'Identity Documents', icon: CreditCard, description: 'Upload your ID documents' },
    { number: 4, title: 'Video KYC', icon: Video, description: 'Live verification (optional)' },
    { number: 5, title: 'Bank Details', icon: Building2, description: 'Add your bank account' },
    { number: 6, title: 'Review & Submit', icon: CheckCircle, description: 'Final review and submission' }
  ];

  const totalSteps = steps.length;
  const progressPercentage = (currentStep / totalSteps) * 100;

  const handleFileUpload = (field: string, file: File) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return formData.fullName && formData.dateOfBirth && formData.gender && formData.email && formData.mobile;
      case 2:
        return formData.permanentAddress && formData.state && formData.city && formData.pincode && formData.addressProof;
      case 3:
        return formData.documentType && formData.documentNumber && formData.documentFront && formData.documentBack && formData.selfie;
      case 5:
        return formData.accountHolderName && formData.bankName && formData.accountNumber && formData.ifscCode && formData.bankProof;
      case 6:
        return formData.detailsConfirmed && formData.termsAccepted;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateCurrentStep()) {
      alert('Please fill all required fields and upload all mandatory documents before proceeding.');
      return;
    }
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitKYC = () => {
    if (!validateCurrentStep()) {
      alert('Please complete all required fields and document uploads.');
      return;
    }
    setKycStatus('pending');
    // Here you would submit the form data to your backend
    console.log('Submitting KYC:', formData);
  };

  const handleContactSupport = () => {
    // Show multiple contact options
    toast({
      title: "Contact Support Options",
      description: "Choose how you'd like to reach us",
      duration: 8000,
    });
    
    // Multiple options for contacting support
    const options = [
      { method: 'WhatsApp', action: () => window.open('https://wa.me/918889923366', '_blank') },
      { method: 'Email', action: () => window.location.href = 'mailto:support@blynkvirtual.com?subject=KYC Support Request' },
      { method: 'Support Page', action: () => navigate('/website/whatsapp-support') }
    ];
    
    // For now, let's direct them to the WhatsApp support page
    navigate('/website/whatsapp-support');
  };

  const FileUploadArea = ({ field, label, accept = "image/*,.pdf", multiple = false, required = true }: any) => (
    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm font-medium text-foreground mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </p>
      <p className="text-xs text-muted-foreground mb-3">JPG, PNG, PDF (Max 5MB)</p>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => e.target.files?.[0] && handleFileUpload(field, e.target.files[0])}
        className="hidden"
        id={field}
        required={required}
      />
      <Button variant="outline" size="sm" onClick={() => document.getElementById(field)?.click()}>
        Choose File
      </Button>
      {formData[field] && (
        <p className="text-xs text-green-600 mt-2 flex items-center justify-center gap-1">
          <CheckCircle className="h-3 w-3" />
          ✓ File uploaded: {formData[field]?.name || 'File selected'}
        </p>
      )}
      {required && !formData[field] && (
        <p className="text-xs text-red-500 mt-2 flex items-center justify-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Required document
        </p>
      )}
    </div>
  );

  if (kycStatus !== 'draft') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-16 max-w-2xl">
          <Card className="text-center shadow-xl">
            <CardContent className="p-8">
              <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
                kycStatus === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                kycStatus === 'approved' ? 'bg-green-100 text-green-600' :
                'bg-red-100 text-red-600'
              }`}>
                {kycStatus === 'pending' && <Shield className="h-10 w-10" />}
                {kycStatus === 'approved' && <CheckCircle className="h-10 w-10" />}
                {kycStatus === 'rejected' && <FileText className="h-10 w-10" />}
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-4">
                {kycStatus === 'pending' && 'KYC Under Review'}
                {kycStatus === 'approved' && 'KYC Approved'}
                {kycStatus === 'rejected' && 'KYC Rejected'}
              </h2>
              
              <p className="text-muted-foreground mb-6">
                {kycStatus === 'pending' && 'Your KYC documents are being reviewed by our compliance team. This usually takes 24-48 hours.'}
                {kycStatus === 'approved' && 'Congratulations! Your identity has been verified. You can now access all platform features.'}
                {kycStatus === 'rejected' && 'Your KYC submission has been rejected. Please review the feedback and resubmit with correct documents.'}
              </p>
              
              <Badge variant={kycStatus === 'approved' ? 'default' : 'secondary'} className="mb-6">
                Status: {kycStatus.toUpperCase()}
              </Badge>
              
              <div className="space-y-3">
                <Button variant="outline" className="w-full" onClick={handleContactSupport}>
                  <Mail className="h-4 w-4 mr-2" />
                  Contact Support
                </Button>
                {kycStatus === 'rejected' && (
                  <Button className="w-full" onClick={() => setKycStatus('draft')}>
                    Resubmit KYC
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Verify Your Identity (KYC)
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            To comply with Indian regulations and ensure secure transactions, every user must complete Know Your Customer (KYC) verification.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                  currentStep >= step.number 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {currentStep > step.number ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <p className="text-xs text-center mt-2 text-muted-foreground max-w-20">
                  {step.title}
                </p>
              </div>
            ))}
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Form Content */}
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-lg flex items-center justify-center">
                {React.createElement(steps[currentStep - 1].icon, { className: "h-6 w-6 text-primary" })}
              </div>
              <CardTitle className="text-2xl">
                Step {currentStep}: {steps[currentStep - 1].title}
              </CardTitle>
              <p className="text-muted-foreground">{steps[currentStep - 1].description}</p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Step 1: Personal Information */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">Full Name (as per Aadhaar/PAN)</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        placeholder="Enter your full legal name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="gender">Gender</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="nationality">Nationality</Label>
                      <Select value={formData.nationality} onValueChange={(value) => handleInputChange('nationality', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Indian">Indian</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email ID</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Enter your email address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobile">Mobile Number</Label>
                      <div className="flex gap-2">
                        <Input
                          id="mobile"
                          value={formData.mobile}
                          onChange={(e) => handleInputChange('mobile', e.target.value)}
                          placeholder="Enter mobile number"
                        />
                        <Button variant="outline" size="sm">
                          <Phone className="h-4 w-4 mr-1" />
                          OTP
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Address Details */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="permanentAddress">Permanent Address (as per Aadhaar/Utility Bill) <span className="text-red-500">*</span></Label>
                    <Textarea
                      id="permanentAddress"
                      value={formData.permanentAddress}
                      onChange={(e) => handleInputChange('permanentAddress', e.target.value)}
                      placeholder="Enter your permanent address"
                      rows={3}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="state">State <span className="text-red-500">*</span></Label>
                      <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state/UT" />
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
                      <Label htmlFor="city">City <span className="text-red-500">*</span></Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Enter city"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode <span className="text-red-500">*</span></Label>
                      <Input
                        id="pincode"
                        value={formData.pincode}
                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                        placeholder="Enter pincode"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Upload Proof of Address <span className="text-red-500">*</span></Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Aadhaar / Passport / Driving License / Utility Bill (Required)
                    </p>
                    <FileUploadArea
                      field="addressProof"
                      label="Upload Address Proof"
                      required={true}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Identity Documents */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="documentType">Document Type</Label>
                      <Select value={formData.documentType} onValueChange={(value) => handleInputChange('documentType', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aadhaar">Aadhaar</SelectItem>
                          <SelectItem value="pan">PAN Card</SelectItem>
                          <SelectItem value="passport">Passport</SelectItem>
                          <SelectItem value="driving_license">Driving License</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="documentNumber">Document Number</Label>
                      <Input
                        id="documentNumber"
                        value={formData.documentNumber}
                        onChange={(e) => handleInputChange('documentNumber', e.target.value)}
                        placeholder="Enter document number"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Document Front</Label>
                      <FileUploadArea
                        field="documentFront"
                        label="Upload Front Side"
                      />
                    </div>
                    <div>
                      <Label>Document Back</Label>
                      <FileUploadArea
                        field="documentBack"
                        label="Upload Back Side"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Selfie Upload</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Take a clear selfie for face matching
                    </p>
                    <FileUploadArea
                      field="selfie"
                      label="Upload Your Selfie"
                      accept="image/*"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Video KYC */}
              {currentStep === 4 && (
                <div className="space-y-6 text-center">
                  <div className="bg-muted/30 p-8 rounded-lg">
                    <Video className="h-16 w-16 mx-auto mb-4 text-primary" />
                    <h3 className="text-xl font-semibold mb-4">Video KYC Verification</h3>
                    <p className="text-muted-foreground mb-6">
                      Complete your verification with a live video call. This step is optional but recommended for faster approval.
                    </p>
                    
                    <div className="bg-background p-4 rounded-lg mb-6 text-left">
                      <h4 className="font-semibold mb-2">Instructions:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Hold your document in hand & look into camera</li>
                        <li>• Read the random code/phrase shown on screen</li>
                        <li>• Ensure good lighting and clear audio</li>
                        <li>• Process takes about 5-10 minutes</li>
                      </ul>
                    </div>

                    <Button 
                      size="lg" 
                      className="mb-4"
                      onClick={() => handleInputChange('videoKycCompleted', true)}
                    >
                      <Video className="h-4 w-4 mr-2" />
                      Start Video Verification
                    </Button>
                    
                    <p className="text-xs text-muted-foreground">
                      Skip this step if you prefer manual document verification
                    </p>
                  </div>
                </div>
              )}

              {/* Step 5: Bank Details */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Important:</strong> Account holder name must match your KYC name. Third-party payments are not allowed.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="accountHolderName">Account Holder Name</Label>
                      <Input
                        id="accountHolderName"
                        value={formData.accountHolderName}
                        onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
                        placeholder="Must match KYC name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bankName">Bank Name</Label>
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
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <Input
                        id="accountNumber"
                        value={formData.accountNumber}
                        onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                        placeholder="Enter account number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ifscCode">IFSC Code</Label>
                      <Input
                        id="ifscCode"
                        value={formData.ifscCode}
                        onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                        placeholder="Enter IFSC code"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Bank Proof</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Upload cancelled cheque or bank statement
                    </p>
                    <FileUploadArea
                      field="bankProof"
                      label="Upload Bank Document"
                    />
                  </div>
                </div>
              )}

              {/* Step 6: Review & Submit */}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <div className="bg-muted/30 p-6 rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">Review Your Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p><strong>Name:</strong> {formData.fullName}</p>
                        <p><strong>Email:</strong> {formData.email}</p>
                        <p><strong>Mobile:</strong> {formData.mobile}</p>
                      </div>
                      <div>
                        <p><strong>Document:</strong> {formData.documentType}</p>
                        <p><strong>Bank:</strong> {formData.bankName}</p>
                        <p><strong>Video KYC:</strong> {formData.videoKycCompleted ? 'Completed' : 'Skipped'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="detailsConfirmed"
                        checked={formData.detailsConfirmed}
                        onCheckedChange={(checked) => handleInputChange('detailsConfirmed', checked)}
                      />
                      <Label htmlFor="detailsConfirmed" className="text-sm">
                        I confirm that the above details are correct and belong to me.
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="termsAccepted"
                        checked={formData.termsAccepted}
                        onCheckedChange={(checked) => handleInputChange('termsAccepted', checked)}
                      />
                      <Label htmlFor="termsAccepted" className="text-sm">
                        I agree to the <span className="text-primary cursor-pointer hover:underline">Terms & Privacy Policy</span>.
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className="flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <div className="flex gap-2">
                  <Button variant="outline">
                    Save & Continue Later
                  </Button>
                  
                  {currentStep < totalSteps ? (
                    <Button onClick={nextStep} className="flex items-center">
                      Next
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button 
                      onClick={submitKYC}
                      disabled={!formData.detailsConfirmed || !formData.termsAccepted}
                      className="flex items-center"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Submit KYC for Review
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}