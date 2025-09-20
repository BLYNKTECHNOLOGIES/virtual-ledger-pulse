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
      icon: User,
      color: "from-blue-500 to-blue-600"
    },
    {
      step: "02",
      title: "Submit Personal Information", 
      description: "Provide full name, DOB, address, and PAN/Aadhaar details.",
      icon: FileText,
      color: "from-green-500 to-green-600"
    },
    {
      step: "03",
      title: "Upload Documents",
      description: "Government-issued ID (Aadhaar, Passport, Voter ID, Driving License) & Address Proof (Utility bill, Aadhaar, Bank Statement – recent 3 months)",
      icon: Upload,
      color: "from-purple-500 to-purple-600"
    },
    {
      step: "04",
      title: "Selfie / Video Verification",
      description: "Quick face verification for authenticity.",
      icon: Camera,
      color: "from-orange-500 to-orange-600"
    },
    {
      step: "05",
      title: "Review & Approval",
      description: "Our compliance team verifies within 24-48 hours.",
      icon: CheckCircle,
      color: "from-emerald-500 to-emerald-600"
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
      color: "bg-blue-500"
    },
    {
      icon: MessageCircle,
      title: "Live Chat",
      primary: "Available 24/7",
      secondary: "Instant assistance",
      color: "bg-green-500"
    },
    {
      icon: Phone,
      title: "Compliance Helpline",
      primary: "+91 9266712788",
      secondary: "Mon-Fri 9am-6pm IST",
      color: "bg-purple-500"
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
      <section className="relative py-20 px-4 bg-gradient-to-br from-blue-50 via-white to-green-50 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(34,197,94,0.1),transparent_50%)]" />
        
        {/* Security Icons Background */}
        <div className="absolute inset-0 opacity-5">
          <Shield className="absolute top-20 left-10 h-24 w-24 text-blue-500 animate-pulse" />
          <Lock className="absolute top-40 right-20 h-16 w-16 text-green-500 animate-pulse delay-1000" />
          <FileText className="absolute bottom-40 left-20 h-20 w-20 text-purple-500 animate-pulse delay-500" />
        </div>

        <div className="relative max-w-7xl mx-auto text-center">
          <Badge variant="secondary" className="mb-8 px-6 py-3 text-lg bg-gradient-to-r from-blue-600/20 to-green-600/20 border border-blue-500/30">
            <UserCheck className="w-5 h-5 mr-2" />
            Identity Verification
          </Badge>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-8 bg-gradient-to-r from-blue-600 via-green-600 to-blue-600 bg-clip-text text-transparent leading-tight">
            Verify Your Identity
          </h1>
          
          <p className="text-2xl md:text-3xl mb-6 text-green-700 font-medium">
            Trade Securely with Blynk
          </p>
          
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            KYC ensures safe, compliant, and seamless trading on our platform.
          </p>

          {/* Visual Illustration */}
          <div className="flex justify-center items-center gap-8 mb-12">
            <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-lg">
              <Lock className="h-12 w-12 text-white" />
            </div>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-green-500"></div>
            <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-lg">
              <FileText className="h-12 w-12 text-white" />
            </div>
            <div className="h-1 w-16 bg-gradient-to-r from-green-500 to-purple-500"></div>
            <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full shadow-lg">
              <Shield className="h-12 w-12 text-white" />
            </div>
          </div>

          <Button 
            size="lg" 
            className="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white px-10 py-4 text-xl rounded-xl shadow-lg"
            onClick={() => navigate('/website/kyc-form')}
          >
            Start KYC Verification
            <ArrowRight className="ml-3 h-6 w-6" />
          </Button>
        </div>
      </section>

      {/* Why KYC is Important */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Why KYC is Important?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Identity verification ensures security, compliance, and unlocks premium features
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {kycBenefits.map((benefit, index) => (
              <Card key={index} className="text-center border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <benefit.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="flex items-center justify-center mb-4">
                    <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                    <h3 className="text-lg font-bold text-gray-900">{benefit.title}</h3>
                  </div>
                  <p className="text-gray-600">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Step-by-Step KYC Process */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Step-by-Step KYC Process
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Simple verification process to secure your account and unlock trading features
            </p>
          </div>

          <div className="space-y-8">
            {kycSteps.map((step, index) => (
              <Card key={index} className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Step Number & Icon */}
                    <div className={`md:w-48 flex flex-col items-center justify-center p-8 bg-gradient-to-br ${step.color} text-white`}>
                      <div className="text-4xl font-bold mb-4">{step.step}</div>
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <step.icon className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 p-8">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">{step.title}</h3>
                      <p className="text-gray-600 text-lg leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Important Note */}
          <Card className="mt-12 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
            <CardContent className="p-8 text-center">
              <div className="flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-amber-600 mr-3" />
                <h3 className="text-xl font-bold text-amber-800">Important Note</h3>
              </div>
              <p className="text-amber-700 text-lg">
                📌 In some cases, additional documents or a Video KYC may be required for enhanced verification.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Troubleshooting & Support */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Troubleshooting & Support
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              💡 Common Issues & Quick Fixes
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {troubleshootingIssues.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-gray-50 rounded-t-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                        <item.icon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-lg font-semibold text-left">{item.issue}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 py-4 bg-gray-50 rounded-b-lg">
                    <div className="flex items-start gap-4">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-1 flex-shrink-0" />
                      <p className="text-gray-700 text-lg">{item.solution}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Need Help Support Section */}
      <section className="py-20 bg-gradient-to-br from-blue-50 to-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Need Help?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our support team is here to assist you with your KYC verification
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {supportChannels.map((channel, index) => (
              <Card key={index} className="text-center border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-white/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className={`w-16 h-16 ${channel.color} rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                    <channel.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{channel.title}</h3>
                  <p className="text-lg font-semibold text-blue-600 mb-2">{channel.primary}</p>
                  <p className="text-gray-600">{channel.secondary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Trust Section */}
      <section className="py-20 bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Compliance & Trust
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Your security and privacy are our top priorities
            </p>
          </div>

          <Card className="bg-gradient-to-br from-blue-900/50 to-green-900/50 border-blue-500/30 backdrop-blur-sm">
            <CardContent className="p-12 text-center">
              <div className="flex items-center justify-center gap-4 mb-8">
                <Shield className="h-12 w-12 text-blue-400" />
                <Lock className="h-12 w-12 text-green-400" />
                <Award className="h-12 w-12 text-yellow-400" />
              </div>
              
              <h3 className="text-3xl font-bold mb-6 text-white">
                🔒 Blynk Virtual Technologies Pvt Ltd is FIU-IND Registered
              </h3>
              
              <div className="bg-blue-500/20 rounded-xl p-6 mb-6 border border-blue-500/30">
                <p className="text-2xl font-bold text-blue-300 mb-2">
                  FIU Registration Number: VA00293094
                </p>
              </div>
              
              <p className="text-lg text-gray-300 max-w-3xl mx-auto">
                Your information is encrypted, secure, and used only for regulatory purposes. 
                We follow strict data protection standards and comply with all applicable privacy laws.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                <div className="text-center">
                  <Lock className="h-8 w-8 text-blue-400 mx-auto mb-3" />
                  <h4 className="text-lg font-semibold mb-2">Encrypted Storage</h4>
                  <p className="text-gray-400 text-sm">Bank-level encryption</p>
                </div>
                <div className="text-center">
                  <Shield className="h-8 w-8 text-green-400 mx-auto mb-3" />
                  <h4 className="text-lg font-semibold mb-2">Secure Processing</h4>
                  <p className="text-gray-400 text-sm">ISO compliant systems</p>
                </div>
                <div className="text-center">
                  <Award className="h-8 w-8 text-yellow-400 mx-auto mb-3" />
                  <h4 className="text-lg font-semibold mb-2">Regulatory Compliance</h4>
                  <p className="text-gray-400 text-sm">PMLA & FIU guidelines</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-green-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            💼 Ready to unlock the full Blynk experience?
          </h2>
          <p className="text-xl text-blue-100 mb-12 max-w-3xl mx-auto">
            Complete your KYC today and start trading with confidence. 
            Join thousands of verified traders on our secure platform.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 px-10 py-4 text-xl font-semibold rounded-xl shadow-lg"
              onClick={() => navigate('/website/kyc-form')}
            >
              <UserCheck className="mr-3 h-6 w-6" />
              Start KYC Verification
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl font-semibold rounded-xl bg-transparent backdrop-blur-sm"
              onClick={() => navigate('/website/contact')}
            >
              <HelpCircle className="mr-3 h-5 w-5" />
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
                <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-blue-100 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}