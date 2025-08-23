import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Building2, 
  FileText, 
  Users, 
  CheckCircle, 
  Upload, 
  Download,
  Shield,
  TrendingUp,
  HeadphonesIcon,
  Clock,
  Star
} from 'lucide-react';

export function CorporateKYCPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    incorporationDate: '',
    corporateStructure: '',
    registeredAddress: '',
    gstNumber: '',
    businessNature: '',
    contactPerson: '',
    designation: '',
    email: '',
    phone: ''
  });

  const steps = [
    { number: 1, title: 'Company Information', icon: Building2 },
    { number: 2, title: 'Document Upload', icon: FileText },
    { number: 3, title: 'UBO Declaration', icon: Users },
    { number: 4, title: 'Review & Submit', icon: CheckCircle }
  ];

  const mandatoryDocuments = [
    'Certificate of Incorporation (ROC)',
    'Company PAN / Tax ID',
    'Memorandum & Articles of Association',
    'Board Resolution for Crypto Trading',
    'Directors List with Shareholding',
    'Authorized Signatory KYC Documents',
    'Business Address Proof',
    'Latest Financial Statements',
    'Bank Account Proof',
    'Applicable Business Licenses'
  ];

  const benefits = [
    { icon: TrendingUp, title: 'Bulk Trading Access', desc: 'Higher liquidity & negotiated rates' },
    { icon: HeadphonesIcon, title: 'Dedicated Support', desc: 'Priority relationship manager' },
    { icon: Clock, title: 'Higher Limits', desc: 'Increased daily & monthly limits' },
    { icon: Shield, title: 'Compliance', desc: 'AML/CFT regulatory framework' },
    { icon: Star, title: 'Enterprise Solutions', desc: 'Customized trading solutions' }
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (currentStep < 4) setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <Badge variant="secondary" className="px-4 py-2 text-sm font-medium">
              For Enterprises & Institutions
            </Badge>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Corporate KYC (CKYC)
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Complete regulatory compliance for businesses, enterprises & institutions. 
            Unlock bulk trading and advanced services with secure corporate verification.
          </p>
        </div>
      </section>

      {/* Progress Timeline */}
      <section className="py-12 px-4 bg-card/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;
              
              return (
                <div key={step.number} className="flex items-center">
                  <div className={`flex items-center gap-3 ${isActive ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-muted-foreground'}`}>
                    <div className={`p-3 rounded-full ${isActive ? 'bg-primary text-primary-foreground' : isCompleted ? 'bg-green-100 text-green-600' : 'bg-muted'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="hidden md:block">
                      <p className="font-medium">{step.title}</p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`hidden md:block w-24 h-px mx-4 ${isCompleted ? 'bg-green-600' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
          
          <Progress value={(currentStep / steps.length) * 100} className="h-2" />
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Panel - Form */}
            <div className="lg:col-span-2">
              <Card className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Step {currentStep}: {steps[currentStep - 1].title}
                  </h2>
                  <p className="text-muted-foreground">
                    {currentStep === 1 && "Provide your company's basic information"}
                    {currentStep === 2 && "Upload required corporate documents"}
                    {currentStep === 3 && "Declare Ultimate Beneficial Owners (UBO)"}
                    {currentStep === 4 && "Review and submit your application"}
                  </p>
                </div>

                {/* Step 1: Company Information */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Legal Entity Name *</Label>
                        <Input 
                          id="companyName"
                          value={formData.companyName}
                          onChange={(e) => handleInputChange('companyName', e.target.value)}
                          placeholder="ABC Private Limited"
                        />
                      </div>
                      <div>
                        <Label htmlFor="incorporationDate">Incorporation Date *</Label>
                        <Input 
                          id="incorporationDate"
                          type="date"
                          value={formData.incorporationDate}
                          onChange={(e) => handleInputChange('incorporationDate', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="corporateStructure">Corporate Structure *</Label>
                        <Select onValueChange={(value) => handleInputChange('corporateStructure', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select structure" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="private-limited">Private Limited</SelectItem>
                            <SelectItem value="public-limited">Public Limited</SelectItem>
                            <SelectItem value="llp">Limited Liability Partnership</SelectItem>
                            <SelectItem value="partnership">Partnership</SelectItem>
                            <SelectItem value="trust">Trust</SelectItem>
                            <SelectItem value="society">Society</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="gstNumber">GST / Tax ID Number</Label>
                        <Input 
                          id="gstNumber"
                          value={formData.gstNumber}
                          onChange={(e) => handleInputChange('gstNumber', e.target.value)}
                          placeholder="22AAAAA0000A1Z5"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="registeredAddress">Registered Business Address *</Label>
                      <Textarea 
                        id="registeredAddress"
                        value={formData.registeredAddress}
                        onChange={(e) => handleInputChange('registeredAddress', e.target.value)}
                        placeholder="Enter complete registered address"
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="businessNature">Nature of Business *</Label>
                      <Select onValueChange={(value) => handleInputChange('businessNature', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="crypto-exchange">Crypto Exchange</SelectItem>
                          <SelectItem value="fintech">Fintech</SelectItem>
                          <SelectItem value="import-export">Import/Export</SelectItem>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="trading">Trading</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="services">Services</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contactPerson">Contact Person *</Label>
                        <Input 
                          id="contactPerson"
                          value={formData.contactPerson}
                          onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                          placeholder="Authorized signatory name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="designation">Designation *</Label>
                        <Input 
                          id="designation"
                          value={formData.designation}
                          onChange={(e) => handleInputChange('designation', e.target.value)}
                          placeholder="Director / CEO / Manager"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="email">Official Email *</Label>
                        <Input 
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="business@company.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Official Phone *</Label>
                        <Input 
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          placeholder="+91 XXXXXXXXXX"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Document Upload */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="grid gap-4">
                      {mandatoryDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-4 border border-border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">{doc}</span>
                          </div>
                          <Button variant="outline" size="sm">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Document Guidelines:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• All documents must be clear, colored scans or photos</li>
                        <li>• File formats: PDF, JPG, PNG (Max 10MB per file)</li>
                        <li>• Documents should be current and not expired</li>
                        <li>• Ensure all text is clearly readable</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Step 3: UBO Declaration */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                      <h4 className="font-medium text-amber-800 mb-2">UBO (Ultimate Beneficial Owner) Declaration</h4>
                      <p className="text-sm text-amber-700">
                        Please provide details of all individuals holding more than 10% shareholding in the company.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 border border-border rounded-lg">
                        <h5 className="font-medium mb-3">UBO #1</h5>
                        <div className="grid md:grid-cols-2 gap-4">
                          <Input placeholder="Full Name" />
                          <Input placeholder="Shareholding %" />
                          <Input placeholder="PAN Number" />
                          <Input placeholder="Aadhaar Number" />
                        </div>
                        <div className="mt-4">
                          <Label>Identity & Address Proof</Label>
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" size="sm">
                              <Upload className="h-4 w-4 mr-2" />
                              ID Proof
                            </Button>
                            <Button variant="outline" size="sm">
                              <Upload className="h-4 w-4 mr-2" />
                              Address Proof
                            </Button>
                          </div>
                        </div>
                      </div>

                      <Button variant="outline" className="w-full">
                        + Add Another UBO
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 4: Review & Submit */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                      <h4 className="font-medium text-green-800 mb-2">Application Ready for Submission</h4>
                      <p className="text-sm text-green-700">
                        Please review all information before submitting. Our compliance team will review your application within 3-5 business days.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <h5 className="font-medium mb-2">Company Information</h5>
                        <p className="text-sm text-muted-foreground">Legal Entity: {formData.companyName || 'Not provided'}</p>
                        <p className="text-sm text-muted-foreground">Structure: {formData.corporateStructure || 'Not provided'}</p>
                        <p className="text-sm text-muted-foreground">Contact: {formData.contactPerson || 'Not provided'}</p>
                      </div>
                      
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <h5 className="font-medium mb-2">Documents Status</h5>
                        <p className="text-sm text-muted-foreground">{mandatoryDocuments.length} documents required</p>
                        <p className="text-sm text-green-600">All documents uploaded successfully</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 border border-border rounded-lg">
                      <input type="checkbox" className="mt-1" />
                      <div className="text-sm">
                        <p className="font-medium mb-1">Declaration & Agreement</p>
                        <p className="text-muted-foreground">
                          I hereby declare that all information provided is true and accurate. I agree to comply with all 
                          AML/KYC regulations and understand that false information may result in account suspension.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-8 border-t border-border">
                  <Button 
                    variant="outline" 
                    onClick={prevStep}
                    disabled={currentStep === 1}
                  >
                    Previous
                  </Button>
                  
                  <div className="flex gap-3">
                    <Button variant="ghost">
                      Save Draft
                    </Button>
                    {currentStep < 4 ? (
                      <Button onClick={nextStep}>
                        Next Step
                      </Button>
                    ) : (
                      <Button className="bg-green-600 hover:bg-green-700 text-white">
                        Submit KYC Application
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Panel - Guidelines */}
            <div className="space-y-6">
              {/* Document Checklist */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Document Checklist</h3>
                </div>
                
                <Button variant="outline" className="w-full mb-4">
                  <Download className="h-4 w-4 mr-2" />
                  Download Checklist
                </Button>

                <div className="space-y-2">
                  {mandatoryDocuments.slice(0, 5).map((doc, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full" />
                      <span className="text-muted-foreground">{doc}</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    +{mandatoryDocuments.length - 5} more documents required
                  </p>
                </div>
              </Card>

              {/* Benefits */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Benefits After Approval</h3>
                <div className="space-y-4">
                  {benefits.map((benefit, index) => {
                    const Icon = benefit.icon;
                    return (
                      <div key={index} className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{benefit.title}</p>
                          <p className="text-xs text-muted-foreground">{benefit.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Contact Support */}
              <Card className="p-6 bg-primary/5">
                <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our compliance team is here to assist you with the KYC process.
                </p>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <HeadphonesIcon className="h-4 w-4 mr-2" />
                    Live Chat Support
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    📧 support@blynkvirtual.com
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}