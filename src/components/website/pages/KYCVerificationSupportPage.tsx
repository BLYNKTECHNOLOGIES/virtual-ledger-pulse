import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useNavigate } from 'react-router-dom';
import { FIUTrustBanner } from '../FIUTrustBanner';
import { 
  Shield, 
  Lock, 
  FileText, 
  CheckCircle, 
  ArrowRight, 
  Phone, 
  Mail, 
  MessageCircle,
  User,
  Camera,
  Clock,
  AlertTriangle,
  HelpCircle,
  Upload,
  UserCheck,
  CreditCard,
  TrendingUp,
  Eye,
  FileCheck,
  Star,
  Award,
  Globe
} from 'lucide-react';

export function KYCVerificationSupportPage() {
  const navigate = useNavigate();

  const kycBenefits = [
    {
      icon: Shield,
      title: "Protects your account from fraud",
      description: "Multi-layer security verification"
    },
    {
      icon: Award,
      title: "Complies with FIU-IND AML/KYC regulations", 
      description: "Fully regulatory compliant trading"
    },
    {
      icon: TrendingUp,
      title: "Unlocks higher trading limits and OTC Desk access",
      description: "Access institutional trading features"
    }
  ];

  const kycSteps = [
    {
      step: "01",
      title: "Create Your Blynk Account",
      description: "Sign up using your email or mobile number.",
      icon: User
    },
    {
      step: "02",
      title: "Submit Personal Information", 
      description: "Provide full name, DOB, address, and PAN/Aadhaar details.",
      icon: FileText
    },
    {
      step: "03",
      title: "Upload Documents",
      description: "Government-issued ID (Aadhaar, Passport, Voter ID, Driving License) & Address Proof (Utility bill, Aadhaar, Bank Statement – recent 3 months)",
      icon: Upload
    },
    {
      step: "04",
      title: "Selfie / Video Verification",
      description: "Quick face verification for authenticity.",
      icon: Camera
    },
    {
      step: "05",
      title: "Review & Approval",
      description: "Our compliance team verifies within 24-48 hours.",
      icon: CheckCircle
    }
  ];

  const troubleshootingIssues = [
    {
      issue: "Blurry Document",
      solution: "Ensure clear scans/photos with good lighting and focus.",
      icon: Eye
    },
    {
      issue: "Mismatch in Name",
      solution: "Upload supporting proof (e.g., marriage certificate, gazette notification).",
      icon: AlertTriangle
    },
    {
      issue: "Expired Document",
      solution: "Upload a valid, current ID that hasn't expired.",
      icon: Clock
    },
    {
      issue: "Address Not Visible",
      solution: "Submit updated proof with clearly visible address details.",
      icon: FileCheck
    }
  ];

  const supportChannels = [
    {
      icon: Mail,
      title: "Email Support",
      primary: "support@blynkex.com",
      secondary: "24-hour response time",
      color: "bg-gray-600"
    },
    {
      icon: MessageCircle,
      title: "Live Chat",
      primary: "Available 24/7",
      secondary: "Instant assistance",
      color: "bg-gray-600"
    },
    {
      icon: Phone,
      title: "Compliance Helpline",
      primary: "+91 9266712788",
      secondary: "Mon-Fri 9am-6pm IST",
      color: "bg-gray-600"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags */}
      <title>KYC Verification Support - Complete Identity Verification | Blynk</title>
      <meta name="description" content="Complete KYC verification guide for Blynk. Step-by-step process, troubleshooting tips, and support for secure crypto trading with FIU compliance." />
      <meta name="keywords" content="KYC verification, identity verification, AML compliance, FIU registration, crypto KYC, Blynk support" />

      {/* FIU Trust Badge - Top Right */}
      <div className="fixed top-24 right-4 z-50">
        <FIUTrustBanner variant="compact" />
      </div>

      {/* Hero Section */}
      <section className="relative bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full text-sm text-gray-600 border mb-6">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span className="text-blue-600 font-semibold">Identity Verification</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-gray-900">
              Verify Your Identity
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-4xl mx-auto">
              Trade Securely with Blynk
            </p>
            <p className="text-lg text-gray-600 mb-12 max-w-3xl mx-auto">
              KYC ensures safe, compliant, and seamless trading on our platform.
            </p>

            {/* Visual Illustration */}
            <div className="flex justify-center items-center gap-4 mb-12">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
                <Lock className="h-8 w-8 text-gray-600" />
              </div>
              <div className="h-0.5 w-8 bg-gray-300"></div>
              <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
                <FileText className="h-8 w-8 text-gray-600" />
              </div>
              <div className="h-0.5 w-8 bg-gray-300"></div>
              <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
                <Shield className="h-8 w-8 text-gray-600" />
              </div>
            </div>

            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
              onClick={() => navigate('/website/kyc-form')}
            >
              Start KYC Verification
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Why KYC is Important */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Why KYC is Important?
            </h2>
            <p className="text-lg text-gray-600">
              Identity verification ensures security, compliance, and unlocks premium features
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {kycBenefits.map((benefit, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <benefit.icon className="h-8 w-8 text-gray-600" />
                </div>
                <div className="flex items-center justify-center mb-2">
                  <CheckCircle className="h-5 w-5 text-gray-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">{benefit.title}</h3>
                </div>
                <p className="text-gray-600 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Step-by-Step KYC Process */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Step-by-Step KYC Process
            </h2>
            <p className="text-lg text-gray-600">
              Simple verification process to secure your account and unlock trading features
            </p>
          </div>

          <div className="space-y-6">
            {kycSteps.map((step, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                  {/* Step Number & Icon */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-lg font-bold text-blue-600">
                      {step.step}
                    </div>
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <step.icon className="h-5 w-5 text-gray-600" />
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-600">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Important Note */}
          <div className="mt-12 bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 mr-2" />
              <h3 className="text-lg font-semibold text-amber-800">Important Note</h3>
            </div>
            <p className="text-amber-700">
              📌 In some cases, additional documents or a Video KYC may be required for enhanced verification.
            </p>
          </div>
        </div>
      </section>

      {/* Troubleshooting & Support */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Troubleshooting & Support
            </h2>
            <p className="text-lg text-gray-600">
              💡 Common Issues & Quick Fixes
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {troubleshootingIssues.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="bg-white border border-gray-200 rounded-lg">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50 rounded-t-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <item.icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <span className="text-base font-medium text-left">{item.issue}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 py-4 bg-gray-50 rounded-b-lg">
                    <div className="flex items-start gap-4">
                      <CheckCircle className="h-4 w-4 text-gray-600 mt-1 flex-shrink-0" />
                      <p className="text-gray-700">{item.solution}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Need Help Support Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Need Help?
            </h2>
            <p className="text-lg text-gray-600">
              Our support team is here to assist you with your KYC verification
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {supportChannels.map((channel, index) => (
              <div key={index} className="text-center space-y-4">
                <div className={`w-16 h-16 ${channel.color} rounded-full flex items-center justify-center mx-auto`}>
                  <channel.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{channel.title}</h3>
                <p className="text-base font-medium text-gray-900">{channel.primary}</p>
                <p className="text-gray-600 text-sm">{channel.secondary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Trust Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Compliance & Trust
            </h2>
            <p className="text-lg text-gray-600">
              Your security and privacy are our top priorities
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <div className="flex items-center justify-center gap-4 mb-8">
              <Shield className="h-10 w-10 text-gray-600" />
              <Lock className="h-10 w-10 text-gray-600" />
              <Award className="h-10 w-10 text-gray-600" />
            </div>
            
            <h3 className="text-2xl font-bold mb-6 text-gray-900">
              🔒 Blynk Virtual Technologies Pvt Ltd is FIU-IND Registered
            </h3>
            
            <div className="bg-blue-50 rounded-lg p-6 mb-6 border border-blue-200">
              <p className="text-xl font-bold text-blue-600 mb-2">
                FIU Registration Number: VA00293094
              </p>
            </div>
            
            <p className="text-gray-600 max-w-3xl mx-auto mb-12">
              Your information is encrypted, secure, and used only for regulatory purposes. 
              We follow strict data protection standards and comply with all applicable privacy laws.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="h-6 w-6 text-gray-600" />
                </div>
                <h4 className="text-base font-semibold mb-2 text-gray-900">Encrypted Storage</h4>
                <p className="text-gray-600 text-sm">Bank-level encryption</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield className="h-6 w-6 text-gray-600" />
                </div>
                <h4 className="text-base font-semibold mb-2 text-gray-900">Secure Processing</h4>
                <p className="text-gray-600 text-sm">ISO compliant systems</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Award className="h-6 w-6 text-gray-600" />
                </div>
                <h4 className="text-base font-semibold mb-2 text-gray-900">Regulatory Compliance</h4>
                <p className="text-gray-600 text-sm">PMLA & FIU guidelines</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Ready to unlock the full Blynk experience?
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Complete your KYC today and start trading with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 font-medium"
              onClick={() => navigate('/website/kyc-form')}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              Start KYC Verification
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 font-medium"
              onClick={() => navigate('/website/contact')}
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              Get Support
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
            {[
              { value: "1500+", label: "Verified Users" },
              { value: "24-48hrs", label: "Verification Time" },
              { value: "99.5%", label: "Approval Rate" },
              { value: "24/7", label: "Support Available" }
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-blue-100 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}