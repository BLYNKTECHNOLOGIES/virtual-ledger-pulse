
import { useState } from 'react';
import { Shield, Users, FileCheck, Globe, CheckCircle, ArrowRight, Download, Phone, Mail, MessageCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useNavigate } from 'react-router-dom';

export function VASPHomePage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const services = [
    {
      icon: Users,
      title: "P2P Trading Platform",
      description: "Secure peer-to-peer cryptocurrency trading with escrow protection"
    },
    {
      icon: Shield,
      title: "Crypto Wallet Infrastructure",
      description: "Enterprise-grade wallet solutions with multi-signature security"
    },
    {
      icon: FileCheck,
      title: "AML/KYC Compliance System",
      description: "Automated compliance checks with real-time risk assessment"
    },
    {
      icon: Globe,
      title: "Whitelabel VASP Integration",
      description: "Complete VASP solutions for businesses and financial institutions"
    }
  ];

  const trustIndicators = [
    "Government-registered company",
    "Audited smart contracts",
    "Dedicated KYC + Compliance Team",
    "24x7 human verification"
  ];

  const processSteps = [
    {
      step: 1,
      title: "Sign up with Email / Mobile",
      description: "Create your account with basic information"
    },
    {
      step: 2,
      title: "Upload PAN / Aadhar",
      description: "Submit government-issued identity documents"
    },
    {
      step: 3,
      title: "Video KYC Verification",
      description: "Complete live video verification with our team"
    },
    {
      step: 4,
      title: "Start Trading or API Use",
      description: "Access our full platform and API services"
    }
  ];

  const faqs = [
    {
      question: "What happens if my KYC gets rejected?",
      answer: "If your KYC is rejected, you'll receive detailed feedback on the reasons. You can resubmit with corrected documents or contact our support team for assistance."
    },
    {
      question: "Can I use third-party payment methods?",
      answer: "For security and compliance reasons, all payments must be made from verified bank accounts registered under your name. Third-party payments are not permitted."
    },
    {
      question: "How does your AML risk evaluation work?",
      answer: "Our AML system continuously monitors transactions using AI-powered risk scoring, checking against global sanctions lists, and flagging suspicious patterns for manual review."
    },
    {
      question: "What are the transaction limits per user?",
      answer: "Limits vary based on your KYC level. Basic KYC allows up to ₹50,000 per day, while full verification enables higher limits based on risk assessment."
    }
  ];

  const partners = [
    "Bybit", "Bitget", "Razorpay", "PayU", "NPCI", "Yes Bank"
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    // Handle form submission
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-600 via-red-600 to-orange-700 text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              India's Trusted Virtual Asset Service Provider
            </h1>
            <p className="text-xl md:text-2xl text-orange-100 mb-10 max-w-4xl mx-auto">
              KYC-powered, AML-compliant P2P and Digital Asset Services
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-orange-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/vasp/kyc')}
              >
                Start KYC
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-orange-600 px-10 py-4 text-xl rounded-full"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do / Services */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">What We Do</h2>
            <p className="text-xl text-gray-600">Comprehensive virtual asset services for the modern economy</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center">
                    <service.icon className="h-8 w-8 text-orange-600" />
                  </div>
                  <CardTitle className="text-xl">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-center">
                    {service.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Choose Us</h2>
            <p className="text-xl text-gray-600">Trust indicators that set us apart</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {trustIndicators.map((indicator, index) => (
              <div key={index} className="text-center">
                <div className="mx-auto mb-4 p-3 bg-green-100 rounded-full w-16 h-16 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-lg font-medium text-gray-900">{indicator}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Get Started in 4 Simple Steps</h2>
            <p className="text-xl text-gray-600">Your journey to compliant crypto services</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {processSteps.map((step, index) => (
              <div key={index} className="relative text-center">
                <div className="mx-auto mb-6 w-16 h-16 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
                {index < processSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full">
                    <ArrowRight className="h-6 w-6 text-orange-600 mx-auto" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliances & Registrations */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Compliances & Registrations</h2>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">MCA Registration</h3>
                <p className="text-gray-600">CIN: U62099MP2025PTC074915</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">GST Registration</h3>
                <p className="text-gray-600">GSTIN: Available on request</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Policy Documents</h3>
                <Button 
                  variant="outline" 
                  className="text-orange-600 border-orange-600 hover:bg-orange-50"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download AML Policy
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Partners</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center">
            {partners.map((partner, index) => (
              <div key={index} className="text-center">
                <div className="bg-gray-100 p-6 rounded-lg">
                  <span className="text-lg font-semibold text-gray-700">{partner}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-gray-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Get in Touch</h2>
            <p className="text-xl text-gray-600">Ready to start your VASP journey?</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Input
                    placeholder="Your Name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Input
                    type="email"
                    placeholder="Email Address"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Input
                    placeholder="Subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Textarea
                    placeholder="Your Message"
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    rows={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700">
                  Send Message
                </Button>
              </form>
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <Phone className="h-6 w-6 text-orange-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">Phone</h3>
                  <p className="text-gray-600">+91 9266712788</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <Mail className="h-6 w-6 text-orange-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">Email</h3>
                  <p className="text-gray-600">support@blynkex.com</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <MessageCircle className="h-6 w-6 text-orange-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">WhatsApp</h3>
                  <p className="text-gray-600">+91 9266712788</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <MapPin className="h-6 w-6 text-orange-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">Office Address</h3>
                  <p className="text-gray-600">
                    First Floor Balwant Arcade, Plot No. 15<br />
                    Maharana Pratap Nagar, Zone II<br />
                    Bhopal, 462011, Madhya Pradesh, India
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
