
import { Shield, Lock, Users, MessageSquare, CheckCircle, Eye, Fingerprint, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useNavigate } from 'react-router-dom';

export function VASPSecurityPage() {
  const navigate = useNavigate();

  const securityFeatures = [
    {
      icon: Shield,
      title: "Advanced Encryption",
      description: "End-to-end encryption for all sensitive data with industry-leading security protocols"
    },
    {
      icon: Lock,
      title: "Secure Escrow",
      description: "Multi-signature escrow system that holds funds until both parties confirm transaction completion"
    },
    {
      icon: Users,
      title: "KYC Verification",
      description: "Comprehensive Know Your Customer process with government ID verification and biometric validation"
    },
    {
      icon: MessageSquare,
      title: "24/7 Support",
      description: "Round-the-clock security monitoring and customer support for immediate assistance"
    }
  ];

  const protectionMeasures = [
    {
      icon: Lock,
      title: "Escrow Protection",
      description: "All trades are secured by our escrow service, ensuring funds are only released when both parties have fulfilled their obligations. This eliminates the risk of scams and fraud."
    },
    {
      icon: Users,
      title: "KYC Verification",
      description: "Our robust Know Your Customer process verifies all users, creating a trusted trading environment while maintaining compliance with Indian regulations."
    },
    {
      icon: MessageSquare,
      title: "Dispute Resolution",
      description: "In the rare event of a dispute, our dedicated team provides fair and efficient resolution, reviewing evidence from both parties to ensure justice."
    },
    {
      icon: Eye,
      title: "Fraud Prevention",
      description: "Advanced algorithms and monitoring systems detect and prevent suspicious activities, protecting our community from potential scams and fraud attempts."
    },
    {
      icon: Fingerprint,
      title: "Secure Authentication",
      description: "Multi-factor authentication, biometric validation, and device recognition work together to ensure only authorized users can access accounts."
    },
    {
      icon: Award,
      title: "Compliance Standards",
      description: "Blynk Virtual Technologies adheres to all relevant regulatory requirements in India, implementing AML and CTF policies to maintain a legal and secure trading environment."
    }
  ];

  const dataProtectionFeatures = [
    "End-to-end encryption for all sensitive data",
    "Regular security audits and penetration testing",
    "Strict data access controls and monitoring",
    "Transparent privacy policy with no hidden clauses",
    "Compliance with global data protection standards"
  ];

  const certifications = [
    {
      title: "ISO 27001",
      subtitle: "Information Security Management"
    },
    {
      title: "PCI DSS",
      subtitle: "Payment Card Industry Data Security Standard"
    },
    {
      title: "GDPR Compliant",
      subtitle: "General Data Protection Regulation"
    },
    {
      title: "SOC 2",
      subtitle: "Service Organization Control"
    }
  ];

  const securityFaqs = [
    {
      question: "How does Blynk Virtual Technologies protect my funds?",
      answer: "We use a secure escrow system that holds funds until both parties have confirmed the transaction is complete. This ensures neither buyer nor seller can be defrauded during the trading process."
    },
    {
      question: "Is my personal information safe?",
      answer: "Absolutely. We employ end-to-end encryption for all sensitive data and implement strict access controls. Your personal information is only used for KYC verification and regulatory compliance purposes."
    },
    {
      question: "What happens if there's a security breach?",
      answer: "Our multi-layered security architecture minimizes breach risks. In the unlikely event of an incident, we have immediate response protocols and will notify affected users promptly while taking corrective action."
    },
    {
      question: "How do you verify user identities?",
      answer: "Our KYC process includes government ID verification, biometric validation, video verification calls, and device recognition to ensure only legitimate users access our platform."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8">
            <Shield className="h-20 w-20 mx-auto mb-6 text-blue-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Security & Trust at Blynk Virtual Technologies
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
            Your security is our top priority. We've built our platform with industry-leading security measures to ensure your funds and data remain protected at all times.
          </p>
          
          {/* Security Feature Pills */}
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            <div className="bg-blue-900/50 border border-blue-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
              <span className="text-blue-200">Advanced Encryption</span>
            </div>
            <div className="bg-blue-900/50 border border-blue-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
              <span className="text-blue-200">Secure Escrow</span>
            </div>
            <div className="bg-blue-900/50 border border-blue-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
              <span className="text-blue-200">KYC Verification</span>
            </div>
            <div className="bg-blue-900/50 border border-blue-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
              <span className="text-blue-200">24/7 Support</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-blue-600 text-white hover:bg-blue-700 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc')}
            >
              Get Verified
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-slate-900 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Contact Security Team
            </Button>
          </div>
        </div>
      </section>

      {/* How We Protect Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              How We Protect Your <span className="text-blue-600">Assets & Data</span>
            </h2>
            <p className="text-xl text-gray-600">Comprehensive security measures designed to keep you safe</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {protectionMeasures.map((measure, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-600">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-4 bg-blue-100 rounded-full w-20 h-20 flex items-center justify-center">
                    <measure.icon className="h-10 w-10 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">{measure.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-center leading-relaxed">
                    {measure.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Data Protection Section */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">Data Protection & Privacy</h2>
              <p className="text-xl text-slate-300 mb-8">
                At Blynk Virtual Technologies, we implement the highest standards of data protection to ensure your personal and financial information remains confidential and secure.
              </p>
              <ul className="space-y-4">
                {dataProtectionFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-blue-400 flex-shrink-0" />
                    <span className="text-slate-200">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-600 to-blue-400 rounded-full w-64 h-64 mx-auto flex items-center justify-center mb-8">
                <Shield className="h-32 w-32 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Certifications Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Certifications & Standards</h2>
            <p className="text-xl text-gray-600">
              Blynk Virtual Technologies is committed to maintaining the highest security standards, validated by industry-leading certifications.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {certifications.map((cert, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mx-auto mb-4 p-4 bg-blue-100 rounded-full w-20 h-20 flex items-center justify-center">
                    <Award className="h-10 w-10 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl font-bold text-gray-900">{cert.title}</CardTitle>
                  <CardDescription className="text-gray-600">{cert.subtitle}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security FAQs */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Security FAQs</h2>
            <p className="text-xl text-gray-600">Common questions about our security measures</p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {securityFaqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-semibold">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600 text-base leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Experience Secure Trading?</h2>
          <p className="text-xl mb-10">
            Join thousands of users who trust Blynk Virtual Technologies for secure cryptocurrency trading.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc')}
            >
              Start KYC Process
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Contact Us
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
