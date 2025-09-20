import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { FIUTrustBanner } from '../FIUTrustBanner';
import { 
  Shield, 
  Users, 
  Zap, 
  ArrowRight, 
  Phone, 
  Mail, 
  CheckCircle, 
  Star,
  TrendingUp,
  Lock,
  Clock,
  DollarSign,
  Bitcoin,
  Globe,
  FileText,
  UserCheck,
  CreditCard,
  Briefcase
} from 'lucide-react';

export function OTCDeskPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    asset: '',
    tradeSize: '',
    message: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log('OTC Quote Request:', formData);
  };

  const features = [
    {
      icon: TrendingUp,
      title: "Deep Liquidity",
      description: "Instant execution for large buy/sell orders at competitive prices."
    },
    {
      icon: Users,
      title: "Personalized Support", 
      description: "Dedicated relationship managers to assist at every step."
    },
    {
      icon: Shield,
      title: "Secure & Compliant",
      description: "Fully FIU-IND Registered (VA00293094) ensuring AML/KYC compliance."
    }
  ];

  const processSteps = [
    {
      step: "01",
      title: "Request a Quote",
      description: "Submit your order size & preferred asset.",
      icon: FileText
    },
    {
      step: "02", 
      title: "Receive Pricing",
      description: "Get competitive rates from our desk.",
      icon: DollarSign
    },
    {
      step: "03",
      title: "KYC Verification", 
      description: "Smooth & compliant onboarding.",
      icon: UserCheck
    },
    {
      step: "04",
      title: "Trade Execution",
      description: "Settle securely via bank/crypto.",
      icon: CreditCard
    },
    {
      step: "05",
      title: "Post-Trade Support",
      description: "Reports, reconciliations & future deals.",
      icon: Briefcase
    }
  ];

  const supportedAssets = [
    { name: "USDT", symbol: "USDT", color: "bg-gray-600" },
    { name: "Bitcoin", symbol: "BTC", color: "bg-gray-700" },
    { name: "Ethereum", symbol: "ETH", color: "bg-gray-500" },
    { name: "Indian Rupee", symbol: "INR", color: "bg-gray-800" }
  ];

  const benefits = [
    {
      icon: DollarSign,
      title: "Minimum Trade Size",
      value: "₹25 Lakhs / $30,000",
      description: "equivalent"
    },
    {
      icon: Globe,
      title: "Settlement Options",
      value: "Bank & Crypto",
      description: "Customized solutions"
    },
    {
      icon: Zap,
      title: "Execution Speed",
      value: "Instant",
      description: "Discreet & fast"
    },
    {
      icon: Clock,
      title: "Support",
      value: "24/7",
      description: "Always available"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags */}
      <title>OTC Desk - High-Value Crypto Trading | Blynk Virtual Technologies</title>
      <meta name="description" content="Trade large crypto volumes with Blynk's institutional OTC desk. Deep liquidity, personalized support, and FIU-IND registered compliance for high-value trades." />
      <meta name="keywords" content="OTC desk, institutional crypto trading, high-value trades, deep liquidity, FIU registered" />

      {/* FIU Trust Badge - Top Right */}
      <div className="fixed top-24 right-4 z-50">
        <FIUTrustBanner variant="compact" />
      </div>

      {/* Hero Section */}
      <section className="relative bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full text-sm text-gray-600 border mb-6">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span className="text-blue-600 font-semibold">Institutional Trading</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-gray-900">
              Blynk OTC Desk
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-4xl mx-auto">
              Tailored Crypto Solutions for High-Value Trades
            </p>
            <p className="text-lg text-gray-600 mb-12 max-w-3xl mx-auto">
              Trade large volumes with discretion, security, and personalized service.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
                onClick={() => document.getElementById('quote-form')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Start OTC Trade
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3 rounded-lg font-medium"
                onClick={() => navigate('/website/contact')}
              >
                <Phone className="mr-2 h-5 w-5" />
                Talk to Desk Manager
              </Button>
            </div>

            {/* Stats Bar */}
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: "₹500Cr+", label: "OTC Volume" },
                { value: "1500+", label: "Institutional Clients" },
                { value: "<1min", label: "Execution Time" },
                { value: "24/7", label: "Desk Support" }
              ].map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</div>
                  <div className="text-gray-600 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Blynk OTC Desk */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Why Choose Blynk OTC Desk?
            </h2>
            <p className="text-lg text-gray-600">
              Premium institutional trading with unmatched liquidity and compliance
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <feature.icon className="h-8 w-8 text-gray-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900 text-lg">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Our OTC Desk Works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              How Our OTC Desk Works
            </h2>
            <p className="text-lg text-gray-600">
              Simple, secure, and transparent process for institutional trades
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-8">
            {processSteps.map((step, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-xl font-bold text-blue-600">
                  {step.step}
                </div>
                <div className="mb-4">
                  <step.icon className="h-6 w-6 text-gray-600 mx-auto" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Assets */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Supported Assets
            </h2>
            <p className="text-lg text-gray-600">
              Trade major cryptocurrencies and fiat currencies
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {supportedAssets.map((asset, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 text-center hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 ${asset.color} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <span className="text-white text-lg font-bold">
                    {asset.symbol.charAt(0)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{asset.name}</h3>
                <p className="text-gray-600 text-sm">{asset.symbol}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600">
              <strong>INR & major fiat settlement supported</strong><br />
              Contact us for additional asset support
            </p>
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Key Benefits
            </h2>
            <p className="text-lg text-gray-600">
              Institutional-grade trading advantages
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                  <benefit.icon className="h-8 w-8 text-gray-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{benefit.title}</h3>
                <div className="text-2xl font-bold text-gray-900">{benefit.value}</div>
                <p className="text-gray-600 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Trust */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Compliance & Trust
            </h2>
            <p className="text-lg text-gray-600">
              Fully regulated and compliant institutional trading
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <div className="flex items-center justify-center gap-4 mb-8">
              <Shield className="h-10 w-10 text-gray-600" />
              <Lock className="h-10 w-10 text-gray-600" />
              <CheckCircle className="h-10 w-10 text-gray-600" />
            </div>
            
            <h3 className="text-2xl font-bold mb-6 text-gray-900">
              🔒 Registered with Financial Intelligence Unit – India (FIU-IND)
            </h3>
            
            <div className="bg-blue-50 rounded-lg p-6 mb-6 border border-blue-200">
              <p className="text-xl font-bold text-blue-600 mb-2">
                FIU Registration Number: VA00293094
              </p>
            </div>
            
            <p className="text-gray-600 max-w-3xl mx-auto">
              All trades are conducted under strict AML & KYC guidelines, ensuring complete regulatory compliance 
              and the highest standards of institutional security.
            </p>
          </div>
        </div>
      </section>

      {/* Quote Request Form */}
      <section id="quote-form" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Ready to trade big with confidence?
            </h2>
            <p className="text-lg text-gray-600">
              Contact our OTC Desk today for personalized assistance
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-base font-medium">Full Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="h-12"
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-base font-medium">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="h-12"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-base font-medium">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="h-12"
                    placeholder="+91 XXXXX XXXXX"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="asset" className="text-base font-medium">Preferred Asset *</Label>
                  <Select onValueChange={(value) => handleInputChange('asset', value)} required>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USDT">USDT (Tether)</SelectItem>
                      <SelectItem value="BTC">BTC (Bitcoin)</SelectItem>
                      <SelectItem value="ETH">ETH (Ethereum)</SelectItem>
                      <SelectItem value="Other">Other (specify in message)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tradeSize" className="text-base font-medium">Trade Size *</Label>
                <Select onValueChange={(value) => handleInputChange('tradeSize', value)} required>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select trade size range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25L-50L">₹25 Lakhs - ₹50 Lakhs</SelectItem>
                    <SelectItem value="50L-1Cr">₹50 Lakhs - ₹1 Crore</SelectItem>
                    <SelectItem value="1Cr-5Cr">₹1 Crore - ₹5 Crore</SelectItem>
                    <SelectItem value="5Cr+">₹5 Crore+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-base font-medium">Additional Requirements</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => handleInputChange('message', e.target.value)}
                  className="min-h-24"
                  placeholder="Tell us about your trading requirements, timeline, or any specific needs..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button 
                  type="submit"
                  size="lg" 
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 font-medium"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Request OTC Quote
                </Button>
                <Button 
                  type="button"
                  size="lg" 
                  variant="outline"
                  className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 h-12 font-medium"
                  onClick={() => navigate('/website/contact')}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Schedule a Call
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-2xl font-bold mb-4">
            Join the Elite Crypto Trading Experience
          </h3>
          <p className="text-lg text-blue-100 mb-8">
            Get started with institutional-grade OTC trading today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 font-medium"
              onClick={() => navigate('/website/contact')}
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact OTC Desk
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 font-medium"
              onClick={() => navigate('/website/about')}
            >
              Learn More About Blynk
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}