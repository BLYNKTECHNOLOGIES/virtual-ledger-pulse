
import { Building2, Users, Target, Shield, TrendingUp, ArrowRight, CheckCircle, Mail, Globe, Briefcase, Heart, Zap, Lock, Award, Code, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AboutPage() {
  const services = [
    {
      icon: TrendingUp,
      title: "P2P Crypto Trading",
      description: "Buy and sell USDT with INR via a secure peer-to-peer framework with 24x7 availability and high liquidity."
    },
    {
      icon: Zap,
      title: "Instant Buy/Sell Services", 
      description: "Access rapid trades with guaranteed INR settlement. Ideal for merchants, influencers, and small businesses."
    },
    {
      icon: Building2,
      title: "INR Gateway for Merchants",
      description: "Backend INR settlements for crypto platforms and service providers in compliance with FIU-IND standards."
    }
  ];

  const whyChooseUs = [
    "FIU-IND Registered VASP compliant with Indian legal requirements",
    "Zero hidden fees with transparent pricing and real-time rate matching",
    "Human-powered support teams available daily for assistance",
    "Fast INR settlements via UPI, IMPS, and bank transfers",
    "Custom tech built by Indian engineers for Indian banking systems",
    "Robust anti-fraud system with multi-layer security checks"
  ];

  const teamRoles = [
    "Blockchain Developers",
    "Legal Advisors", 
    "P2P Trading Experts",
    "Customer Experience Professionals",
    "Ex-Banking Specialists"
  ];

  const contactInfo = [
    { title: "Business Enquiries", email: "contact@blynkex.com" },
    { title: "Security Concerns", email: "support@blynkex.com" },
    { title: "Law Enforcement Support", email: "compliance@blynkex.com" },
    { title: "Careers", email: "hrdept@blynkex.com" }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-8 leading-tight">
            We see a <span className="text-blue-600">different future</span> for crypto in India
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12 leading-relaxed">
            Blynk builds powerful, enterprise-grade tools for secure P2P crypto trading and INR settlements, 
            making digital assets accessible to every Indian.
          </p>
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 px-8 py-3">
            Join Us
          </Button>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-16">
            {/* Our Beginnings */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Beginnings</h2>
              <p className="text-gray-600 leading-relaxed">
                Blynk Virtual Technologies was founded to bridge the gap between traditional finance and digital assets in India. 
                We saw the potential for crypto to revolutionize how Indians access and use digital currency, 
                making transactions faster, more secure, and fully compliant with local regulations.
              </p>
            </div>

            {/* Our Mission */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <Target className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Mission</h2>
              <p className="text-gray-600 leading-relaxed">
                We are pioneers building blockchain payment technology to transform how businesses and people trade crypto with INR. 
                Our mission is to create the most trusted, secure, and compliant P2P platform that serves the Indian market 
                with transparency and innovation.
              </p>
            </div>

            {/* Our Future */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Future</h2>
              <p className="text-gray-600 leading-relaxed">
                Cryptocurrency's future in India looks very bright, and we plan on remaining at the forefront of this technology, 
                creating more tools and services for everyone to use in innovative new ways while maintaining the highest 
                standards of compliance and security.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What We Do</h2>
            <p className="text-xl text-gray-600">Comprehensive crypto services designed for the Indian market</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {services.map((service, index) => (
              <div key={index} className="text-center">
                <service.icon className="h-12 w-12 text-blue-600 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-gray-900 mb-4">{service.title}</h3>
                <p className="text-gray-600 leading-relaxed">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Why Choose Blynk?</h2>
            <p className="text-xl text-gray-600">Built for India, trusted by thousands</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                <p className="text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Security */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Compliance & Security</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              As a registered VASP with the Financial Intelligence Unit – India (FIU-IND), 
              Blynk follows strict KYC, AML, and PMLA policies.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              "Automated KYC & vKYC review",
              "Risk scoring based on transaction behavior",
              "Blacklist checks & fraud detection algorithms",
              "Third-party transaction warnings & limitations",
              "30-day compliance log per user for traceability",
              "Multi-layer security with real-time monitoring"
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Meet the Team</h2>
            <p className="text-xl text-gray-600">
              Led by a mission-driven team with hands-on experience in real-time payment settlements, 
              OTC crypto markets, and financial services.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-8">
            {teamRoles.map((role, index) => (
              <div key={index} className="text-center">
                <Users className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900">{role}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Careers */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Careers @ Blynk</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
            We're always looking for passionate individuals who are excited about crypto, compliance, 
            and fintech in India. Join us to learn, grow, and lead.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {["Compliance Officers", "Backend Engineers", "UI/UX Designers", "Support Executives"].map((position, index) => (
              <div key={index} className="flex items-center justify-center gap-2 text-gray-700">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>{position}</span>
              </div>
            ))}
          </div>

          <Button className="bg-blue-600 hover:bg-blue-700">
            <Mail className="mr-2 h-4 w-4" />
            hrdept@blynkex.com
          </Button>
        </div>
      </section>

      {/* Contact */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Get in Touch</h2>
            <p className="text-xl text-gray-600">Connect with the right team for your needs</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {contactInfo.map((contact, index) => (
              <div key={index} className="text-center">
                <h3 className="font-semibold text-gray-900 mb-2">{contact.title}</h3>
                <a href={`mailto:${contact.email}`} className="text-blue-600 hover:text-blue-700">
                  {contact.email}
                </a>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <Globe className="h-5 w-5" />
              <span className="text-lg">www.blynkex.com</span>
            </div>
          </div>
        </div>
      </section>

      {/* Partner CTA */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Partner With Us</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Whether you're a Web3 startup, a fintech platform, or a crypto influencer — we offer custom APIs, 
            merchant INR support, and partner commissions.
          </p>
          <Button className="bg-blue-600 hover:bg-blue-700">
            Become a Partner
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>
    </div>
  );
}
