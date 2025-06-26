
import { Shield, FileCheck, Users, Clock, CheckCircle, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export function KYCServicesPage() {
  const navigate = useNavigate();

  const kycSteps = [
    {
      step: 1,
      title: "Identity Verification",
      description: "Upload government-issued ID documents (Aadhaar, PAN, Passport)",
      icon: FileCheck
    },
    {
      step: 2,
      title: "Address Verification",
      description: "Provide proof of address documents for verification",
      icon: Users
    },
    {
      step: 3,
      title: "Biometric Verification",
      description: "Complete facial recognition and liveness detection",
      icon: Shield
    },
    {
      step: 4,
      title: "Final Review",
      description: "Our compliance team reviews and approves your application",
      icon: CheckCircle
    }
  ];

  const features = [
    {
      icon: Zap,
      title: "Quick Processing",
      description: "Most KYC applications processed within 24-48 hours"
    },
    {
      icon: Shield,
      title: "Bank-Grade Security",
      description: "Your documents are encrypted and stored securely"
    },
    {
      icon: FileCheck,
      title: "Compliance Ready",
      description: "Meets all regulatory requirements for VASP operations"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8">
            <Shield className="h-20 w-20 mx-auto mb-6 text-blue-200" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            KYC Services by Blynk Virtual Technologies
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
            Secure, compliant, and efficient Know Your Customer verification services for cryptocurrency trading and financial services.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc-form')}
            >
              Begin KYC Process
              <ArrowRight className="ml-2 h-6 w-6" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Contact Support
            </Button>
          </div>
        </div>
      </section>

      {/* KYC Process Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">KYC Verification Process</h2>
            <p className="text-xl text-gray-600">Simple steps to complete your verification</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {kycSteps.map((step, index) => (
              <Card key={index} className="relative hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold">
                    {step.step}
                  </div>
                  <div className="mx-auto mb-4 mt-4 p-3 bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-orange-600" />
                  </div>
                  <CardTitle className="text-xl">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-center">
                    {step.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Our KYC Process?</h2>
            <p className="text-xl text-gray-600">Designed for security, speed, and compliance</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mx-auto mb-4 p-4 bg-orange-100 rounded-full w-20 h-20 flex items-center justify-center">
                    <feature.icon className="h-10 w-10 text-orange-600" />
                  </div>
                  <CardTitle className="text-2xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-lg">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Required Documents</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg">
                  <FileCheck className="h-6 w-6 text-orange-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Identity Proof</h3>
                    <p className="text-gray-600">Aadhaar Card, PAN Card, Passport, or Driving License</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg">
                  <FileCheck className="h-6 w-6 text-orange-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Address Proof</h3>
                    <p className="text-gray-600">Utility Bill, Bank Statement, or Rent Agreement</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg">
                  <FileCheck className="h-6 w-6 text-orange-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Bank Details</h3>
                    <p className="text-gray-600">Bank account statement or cancelled cheque</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Important Notes</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-blue-600 mt-1" />
                  <p className="text-gray-700">All documents must be clear and readable</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-blue-600 mt-1" />
                  <p className="text-gray-700">Documents should not be older than 3 months</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600 mt-1" />
                  <p className="text-gray-700">Processing time: 24-48 hours for most applications</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
                  <p className="text-gray-700">Your data is encrypted and stored securely</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Complete Your KYC?</h2>
          <p className="text-xl mb-10">
            Start your verification process today and gain access to secure cryptocurrency trading.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc-form')}
            >
              Start KYC Verification
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Get Help
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
