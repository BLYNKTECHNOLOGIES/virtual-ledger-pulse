
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Shield, Users, FileText, AlertTriangle, Lock, Monitor, Scale } from 'lucide-react';

export function VASPPage() {
  const complianceItems = [
    {
      title: 'AEML Guidelines Compliance',
      description: 'Full compliance with Anti-Money Laundering regulations',
      status: 'Implemented',
      icon: Shield
    },
    {
      title: 'RBI Advisory Adherence',
      description: 'Following Reserve Bank of India guidelines for virtual assets',
      status: 'Active',
      icon: Scale
    },
    {
      title: 'FIU Reporting',
      description: 'Financial Intelligence Unit reporting mechanisms',
      status: 'Automated',
      icon: FileText
    }
  ];

  const kycSteps = [
    {
      step: '1',
      title: 'Initial Registration',
      description: 'User provides basic information and contact details'
    },
    {
      step: '2',
      title: 'Document Collection',
      description: 'Manual collection of identity and address proofs'
    },
    {
      step: '3',
      title: 'Video KYC Verification',
      description: 'Real-time video verification as per RBI guidelines'
    },
    {
      step: '4',
      title: 'Risk Assessment',
      description: 'AI-powered risk scoring and profile evaluation'
    },
    {
      step: '5',
      title: 'Final Approval',
      description: 'Account activation after successful verification'
    }
  ];

  const techFeatures = [
    {
      icon: Monitor,
      title: 'Real-time Monitoring',
      description: '24/7 transaction monitoring and suspicious activity detection'
    },
    {
      icon: Lock,
      title: 'Secure Wallet Integration',
      description: 'Multi-signature wallets with advanced security protocols'
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'AI-powered risk scoring and automated compliance checks'
    },
    {
      icon: Users,
      title: 'User Management',
      description: 'Comprehensive user lifecycle management and KYC tracking'
    }
  ];

  const securityMeasures = [
    'End-to-end encryption for all transactions',
    'Multi-factor authentication (MFA)',
    'Cold storage for digital assets',
    'Regular security audits and penetration testing',
    'Compliance with international security standards',
    'Real-time fraud detection algorithms',
    'Secure API endpoints with rate limiting',
    'Advanced threat intelligence integration'
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-indigo-900/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-6 bg-blue-100 text-blue-700 hover:bg-blue-200">
              🔐 Virtual Asset Service Provider
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Compliant{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                P2P Services
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Professional Virtual Asset Service Provider solutions with full regulatory compliance, 
              advanced KYC processes, and enterprise-grade security for P2P transactions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
                Partnership Inquiry
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-2">
                Compliance Overview
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* P2P Services Overview */}
      <section className="py-20 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Our P2P Services
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive peer-to-peer virtual asset services with full regulatory compliance
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {techFeatures.map((feature, index) => (
              <Card key={index} className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardContent className="p-8 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-6">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Compliance & Legal Framework
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Full adherence to regulatory requirements and industry best practices
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {complianceItems.map((item, index) => (
              <Card key={index} className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <item.icon className="h-5 w-5 text-green-600" />
                    </div>
                    <Badge className="bg-green-100 text-green-700">{item.status}</Badge>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Regulatory Links */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              Regulatory Resources
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">AEML Guidelines</h4>
                <p className="text-sm text-gray-600 mb-3">Anti-Money Laundering compliance framework</p>
                <Button variant="outline" size="sm">View Guidelines</Button>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Scale className="h-8 w-8 text-white" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">RBI Advisory</h4>
                <p className="text-sm text-gray-600 mb-3">Reserve Bank of India virtual asset guidelines</p>
                <Button variant="outline" size="sm">View Advisory</Button>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="h-8 w-8 text-white" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">FIU Requirements</h4>
                <p className="text-sm text-gray-600 mb-3">Financial Intelligence Unit reporting</p>
                <Button variant="outline" size="sm">View Requirements</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KYC Process */}
      <section className="py-20 bg-gradient-to-r from-gray-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              KYC Process
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive Know Your Customer process ensuring regulatory compliance
            </p>
          </div>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-blue-600 to-purple-600 rounded-full hidden md:block"></div>
            
            <div className="space-y-12">
              {kycSteps.map((step, index) => (
                <div key={index} className={`flex items-center ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} flex-col`}>
                  <div className={`w-full md:w-1/2 ${index % 2 === 0 ? 'md:pr-12' : 'md:pl-12'}`}>
                    <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                      <CardContent className="p-8">
                        <div className="flex items-center mb-4">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                            {step.step}
                          </div>
                          <h3 className="text-xl font-bold text-gray-900">{step.title}</h3>
                        </div>
                        <p className="text-gray-600 leading-relaxed">{step.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Timeline Dot */}
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full border-4 border-white shadow-lg z-10 hidden md:block"></div>
                  
                  <div className="w-full md:w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security Measures */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
                Enterprise-Grade Security
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Multi-layered security approach to protect assets and ensure transaction integrity.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {securityMeasures.map((measure, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">{measure}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl text-white">
                  <Shield className="h-8 w-8 mb-4" />
                  <h3 className="font-bold text-lg mb-2">256-bit Encryption</h3>
                  <p className="text-sm opacity-90">Military-grade security</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-2xl text-white">
                  <Monitor className="h-8 w-8 mb-4" />
                  <h3 className="font-bold text-lg mb-2">24/7 Monitoring</h3>
                  <p className="text-sm opacity-90">Real-time surveillance</p>
                </div>
              </div>
              <div className="space-y-6 pt-12">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-2xl text-white">
                  <Lock className="h-8 w-8 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Multi-Sig Wallets</h3>
                  <p className="text-sm opacity-90">Enhanced protection</p>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-6 rounded-2xl text-white">
                  <AlertTriangle className="h-8 w-8 mb-4" />
                  <h3 className="font-bold text-lg mb-2">Risk Assessment</h3>
                  <p className="text-sm opacity-90">AI-powered analysis</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact for Partnership */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Partner with Us?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Contact us to discuss VASP registration, compliance setup, and partnership opportunities 
            in the virtual asset ecosystem.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Contact for Partnership
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Download Compliance Guide
            </Button>
          </div>
          <div className="mt-12 text-center text-blue-100">
            <p className="text-sm">
              For VASP registration and partnership inquiries: <strong>vasp@techflow.com</strong>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
