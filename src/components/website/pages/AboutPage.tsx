
import { Building2, Users, Target, Shield, TrendingUp, MapPin, Calendar, User, ArrowRight, CheckCircle, Mail, Phone, Globe, Briefcase, Heart, Zap, Lock, UserCheck, DollarSign, AlertTriangle, Award, Code, HeadphonesIcon, Search, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function AboutPage() {
  const services = [
    {
      icon: TrendingUp,
      title: "P2P Crypto Trading",
      description: "Buy and sell USDT with INR via a secure peer-to-peer framework. Transparent order management with live support and 24x7 availability with high liquidity.",
      features: ["Live order matching", "Secure escrow system", "Real-time INR settlement"]
    },
    {
      icon: Zap,
      title: "Instant Buy/Sell Services", 
      description: "Access rapid trades with guaranteed INR settlement. Ideal for merchants, influencers, and small businesses.",
      features: ["Instant settlement", "Competitive rates", "Multiple payment methods"]
    },
    {
      icon: Building2,
      title: "INR Gateway for Merchants",
      description: "We provide backend INR settlements for crypto platforms and service providers in compliance with FIU-IND standards.",
      features: ["API integration", "Bulk processing", "Compliance support"]
    },
    {
      icon: DollarSign,
      title: "OTC Trading Desk",
      description: "High-value buyers/sellers can connect directly with our OTC team for bulk crypto transactions and better pricing.",
      features: ["Dedicated managers", "Custom pricing", "Large volume support"]
    }
  ];

  const whyChooseUs = [
    {
      icon: Shield,
      title: "FIU-IND Registered VASP",
      description: "Compliant with Indian legal requirements. We work closely with authorities to ensure clean, traceable, and regulated operations."
    },
    {
      icon: CheckCircle,
      title: "Zero Hidden Fees",
      description: "Transparent pricing and real-time rate matching across multiple exchanges and P2P platforms."
    },
    {
      icon: Users,
      title: "Human-Powered Support",
      description: "No bots. Our compliance and support teams are available daily to assist with onboarding, KYC, and order support."
    },
    {
      icon: Zap,
      title: "Fast INR Settlements",
      description: "From UPI to IMPS, we support lightning-fast payouts and INR transfers for completed trades."
    },
    {
      icon: Award,
      title: "Custom Tech, Built in India",
      description: "Our platform is 100% custom-built by Indian engineers, designed for Indian banking systems and user flows."
    },
    {
      icon: Lock,
      title: "Robust Anti-Fraud System",
      description: "We run multi-layer fraud checks, real-time AML screening, and vKYC processes to keep users safe."
    }
  ];

  const teamRoles = [
    "Blockchain Developers",
    "Legal Advisors", 
    "P2P Trading Experts",
    "Customer Experience Professionals",
    "Ex-Banking Specialists"
  ];

  const openPositions = [
    { role: "Compliance Officers", available: true },
    { role: "Backend Engineers", available: true },
    { role: "UI/UX Designers", available: true },
    { role: "Support Executives", available: true }
  ];

  const contactInfo = [
    { 
      icon: Briefcase,
      title: "Business Enquiries",
      email: "contact@blynkcrypto.in",
      description: "Partnership and business opportunities"
    },
    {
      icon: Lock,
      title: "Security Concerns", 
      email: "security@blynkcrypto.in",
      description: "Report security issues and vulnerabilities"
    },
    {
      icon: FileText,
      title: "Law Enforcement Support",
      email: "compliance@blynkcrypto.in", 
      description: "Regulatory and compliance inquiries"
    },
    {
      icon: Users,
      title: "Careers",
      email: "hr@blynkcrypto.in",
      description: "Join our growing team"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-800/50 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Shield className="h-4 w-4" />
              FIU-IND Registered VASP
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              India's Trusted Bridge Between 
              <span className="text-blue-300"> Crypto & INR</span>
            </h1>
            <p className="text-xl text-blue-100 max-w-4xl mx-auto mb-8">
              Blynk Virtual Technologies Private Limited is India's forward-thinking Virtual Asset Service Provider (VASP), 
              offering fast, secure, and compliant crypto-to-INR and INR-to-crypto exchange services.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-blue-900 hover:bg-blue-50">
                Start Trading Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Vision Statement */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Target className="h-16 w-16 text-blue-600 mx-auto mb-8" />
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Vision</h2>
          <blockquote className="text-2xl text-gray-700 font-medium max-w-5xl mx-auto italic">
            "To be India's most trusted bridge between crypto and fiat — making secure, regulated, 
            and efficient access to digital assets a reality for every Indian."
          </blockquote>
          <p className="text-lg text-gray-600 max-w-4xl mx-auto mt-8">
            We envision a future where digital currency transactions are as seamless and safe as traditional banking. 
            Through continuous innovation and regulatory alignment, we aim to make crypto adoption accessible to all.
          </p>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What We Do</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive crypto services designed for the Indian market
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="hover:shadow-xl transition-all duration-300 group">
                <CardHeader>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                      <service.icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-xl">{service.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{service.description}</p>
                  <ul className="space-y-2">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
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
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose Blynk?</h2>
            <p className="text-xl text-gray-600">Built for India, trusted by thousands</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="text-center group">
                <div className="p-4 bg-white rounded-lg shadow-md group-hover:shadow-lg transition-shadow mb-4">
                  <item.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Security */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Compliance & Security</h2>
              <p className="text-lg text-gray-700 mb-8">
                We take compliance seriously. As a registered VASP with the Financial Intelligence Unit – India (FIU-IND), 
                Blynk follows strict KYC, AML, and PMLA policies.
              </p>
              <div className="space-y-4">
                {[
                  "Automated KYC & vKYC review",
                  "Risk scoring based on transaction behavior", 
                  "Blacklist checks & fraud detection algorithms",
                  "Third-party transaction warnings & limitations",
                  "30-day compliance log per user for traceability"
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-2xl text-white">
              <Lock className="h-16 w-16 mb-6" />
              <h3 className="text-2xl font-bold mb-4">Enterprise-Grade Security</h3>
              <p className="text-blue-100">
                Multi-layer security architecture with real-time monitoring, 
                advanced encryption, and regulatory compliance built into every transaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Meet the Team</h2>
            <p className="text-xl text-gray-600">
              Led by a mission-driven founding team with hands-on experience in real-time payment settlements, 
              OTC crypto markets, and financial services.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {teamRoles.map((role, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <Users className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900">{role}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Careers Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Careers @ Blynk</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We're always looking for passionate individuals who are excited about crypto, compliance, 
              and fintech in India. Join us to learn, grow, and lead.
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-2xl font-bold mb-6">Open Positions</h3>
                <div className="space-y-4">
                  {openPositions.map((position, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <span className="text-lg">{position.role}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center md:text-right">
                <Heart className="h-16 w-16 text-red-400 mx-auto md:ml-auto mb-4" />
                <h4 className="text-xl font-semibold mb-4">Ready to Join Us?</h4>
                <Button className="bg-white text-blue-600 hover:bg-blue-50">
                  <Mail className="mr-2 h-4 w-4" />
                  hr@blynkcrypto.in
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Get in Touch</h2>
            <p className="text-xl text-gray-600">Connect with the right team for your needs</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactInfo.map((contact, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <contact.icon className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                  <CardTitle className="text-lg">{contact.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">{contact.description}</p>
                  <Button variant="outline" size="sm" className="text-blue-600">
                    <Mail className="mr-2 h-4 w-4" />
                    {contact.email}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <div className="inline-flex items-center gap-2 text-gray-600">
              <Globe className="h-5 w-5" />
              <span className="text-lg font-medium">www.blynkcrypto.in</span>
            </div>
          </div>
        </div>
      </section>

      {/* Partner CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Partner With Us</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Whether you're a Web3 startup, a fintech platform, or a crypto influencer — we offer custom APIs, 
            merchant INR support, and partner commissions. Reach out today to become a verified Blynk partner.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">
              Become a Partner
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
