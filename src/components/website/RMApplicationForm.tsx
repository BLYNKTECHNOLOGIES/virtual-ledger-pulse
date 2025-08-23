import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  DollarSign,
  CheckCircle,
  Send
} from 'lucide-react';

interface RMApplicationFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RMApplicationForm({ isOpen, onClose }: RMApplicationFormProps) {
  const [formData, setFormData] = useState({
    applicantType: '',
    companyName: '',
    contactPerson: '',
    designation: '',
    email: '',
    phone: '',
    tradingVolume: '',
    businessType: '',
    requirements: '',
    currentProvider: '',
    experience: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      
      // Reset after 3 seconds
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
        // Reset form
        setFormData({
          applicantType: '',
          companyName: '',
          contactPerson: '',
          designation: '',
          email: '',
          phone: '',
          tradingVolume: '',
          businessType: '',
          requirements: '',
          currentProvider: '',
          experience: ''
        });
      }, 3000);
    }, 2000);
  };

  if (isSubmitted) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Application Submitted!</h3>
            <p className="text-muted-foreground mb-4">
              Thank you for applying for a Dedicated Relationship Manager. Our team will review your application and contact you within 24-48 hours.
            </p>
            <Badge className="bg-green-50 text-green-700 border-green-200">
              Reference ID: RM{Date.now().toString().slice(-6)}
            </Badge>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Apply for Relationship Manager
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Applicant Type */}
          <div>
            <Label htmlFor="applicantType">Applicant Type *</Label>
            <Select onValueChange={(value) => handleInputChange('applicantType', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select applicant type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual Trader</SelectItem>
                <SelectItem value="hnwi">High Net-Worth Individual</SelectItem>
                <SelectItem value="corporate">Corporate Client</SelectItem>
                <SelectItem value="institution">Institution</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Company/Personal Information */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="companyName">
                {formData.applicantType === 'individual' ? 'Full Name' : 'Company/Institution Name'} *
              </Label>
              <Input 
                id="companyName"
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                placeholder={formData.applicantType === 'individual' ? 'Enter your full name' : 'Enter company name'}
                required
              />
            </div>
            <div>
              <Label htmlFor="contactPerson">Contact Person *</Label>
              <Input 
                id="contactPerson"
                value={formData.contactPerson}
                onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                placeholder="Primary contact person"
                required
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input 
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="business@company.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input 
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+91 XXXXXXXXXX"
                required
              />
            </div>
          </div>

          {/* Designation & Business Type */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="designation">Designation/Role *</Label>
              <Input 
                id="designation"
                value={formData.designation}
                onChange={(e) => handleInputChange('designation', e.target.value)}
                placeholder="CEO, CFO, Trader, etc."
                required
              />
            </div>
            <div>
              <Label htmlFor="businessType">Business Type</Label>
              <Select onValueChange={(value) => handleInputChange('businessType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fintech">Fintech</SelectItem>
                  <SelectItem value="trading">Trading Firm</SelectItem>
                  <SelectItem value="investment">Investment Company</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Trading Volume & Experience */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tradingVolume">Expected Monthly Trading Volume *</Label>
              <Select onValueChange={(value) => handleInputChange('tradingVolume', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select volume range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-5l">₹1-5 Lakhs</SelectItem>
                  <SelectItem value="5-25l">₹5-25 Lakhs</SelectItem>
                  <SelectItem value="25l-1cr">₹25 Lakhs - 1 Crore</SelectItem>
                  <SelectItem value="1-5cr">₹1-5 Crores</SelectItem>
                  <SelectItem value="5cr+">₹5+ Crores</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="experience">Crypto Trading Experience</Label>
              <Select onValueChange={(value) => handleInputChange('experience', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner (0-6 months)</SelectItem>
                  <SelectItem value="intermediate">Intermediate (6 months - 2 years)</SelectItem>
                  <SelectItem value="experienced">Experienced (2+ years)</SelectItem>
                  <SelectItem value="expert">Expert (5+ years)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Current Provider */}
          <div>
            <Label htmlFor="currentProvider">Current Crypto Service Provider (if any)</Label>
            <Input 
              id="currentProvider"
              value={formData.currentProvider}
              onChange={(e) => handleInputChange('currentProvider', e.target.value)}
              placeholder="WazirX, CoinDCX, Binance, etc."
            />
          </div>

          {/* Requirements */}
          <div>
            <Label htmlFor="requirements">Specific Requirements/Services Needed *</Label>
            <Textarea 
              id="requirements"
              value={formData.requirements}
              onChange={(e) => handleInputChange('requirements', e.target.value)}
              placeholder="Describe your specific trading needs, compliance requirements, or any special services you're looking for..."
              rows={4}
              required
            />
          </div>

          {/* Terms */}
          <div className="bg-muted/30 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Eligibility Criteria</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Minimum monthly trading volume of ₹5 Lakhs</li>
              <li>• Complete KYC verification required</li>
              <li>• Valid business registration (for corporate clients)</li>
              <li>• Clean transaction history</li>
            </ul>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Submitting...
                </div>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Application
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}