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
      description: "Instant execution for large buy/sell orders at competitive prices.",
      accent: "from-blue-600 to-blue-700"
    },
    {
      icon: Users,
      title: "Personalized Support", 
      description: "Dedicated relationship managers to assist at every step.",
      accent: "from-blue-600 to-blue-700"
    },
    {
      icon: Shield,
      title: "Secure & Compliant",
      description: "Fully FIU-IND Registered (VA00293094) ensuring AML/KYC compliance.",
      accent: "from-blue-600 to-blue-700"
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
    { name: "USDT", symbol: "USDT", color: "bg-blue-600" },
    { name: "Bitcoin", symbol: "BTC", color: "bg-blue-700" },
    { name: "Ethereum", symbol: "ETH", color: "bg-blue-500" },
    { name: "Indian Rupee", symbol: "INR", color: "bg-slate-600" }
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
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-black">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(34,197,94,0.1),transparent_50%)]" />
        
        {/* Crypto Icons Background */}
        <div className="absolute inset-0 opacity-5">
          <Bitcoin className="absolute top-20 left-10 h-24 w-24 text-white animate-pulse" />
          <DollarSign className="absolute top-40 right-20 h-16 w-16 text-white animate-pulse delay-1000" />
          <TrendingUp className="absolute bottom-40 left-20 h-20 w-20 text-white animate-pulse delay-500" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="secondary" className="mb-8 px-6 py-3 text-lg bg-gradient-to-r from-blue-600/20 to-green-600/20 border border-blue-500/30">
            <Briefcase className="w-5 h-5 mr-2" />
            Institutional Trading
          </Badge>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-8 bg-gradient-to-r from-white via-blue-100 to-green-100 bg-clip-text text-transparent leading-tight">
            Blynk OTC Desk
          </h1>
          
          <p className="text-2xl md:text-3xl mb-6 text-blue-100 font-light">
            Tailored Crypto Solutions for High-Value Trades
          </p>
          
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Trade large volumes with discretion, security, and personalized service.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-10 py-4 text-xl rounded-xl shadow-2xl shadow-blue-500/25"
              onClick={() => document.getElementById('quote-form')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Start OTC Trade
              <ArrowRight className="ml-3 h-6 w-6" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-2 border-green-500 text-green-400 hover:bg-green-500 hover:text-white px-10 py-4 text-xl rounded-xl bg-transparent backdrop-blur-sm"
              onClick={() => navigate('/website/contact')}
            >
              <Phone className="mr-3 h-5 w-5" />
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
                <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Blynk OTC Desk */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Why Choose Blynk OTC Desk?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Premium institutional trading with unmatched liquidity and compliance
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-white">
                <CardContent className="relative p-8 text-center">
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br ${feature.accent} mb-6 shadow-lg`}>
                    <feature.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How Our OTC Desk Works */}
      <section className="py-24 bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              How Our OTC Desk Works
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Simple, secure, and transparent process for institutional trades
            </p>
          </div>

          <div className="relative">
            {/* Connection Line */}
            <div className="hidden md:block absolute top-20 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600" />
            
            <div className="grid md:grid-cols-5 gap-8">
              {processSteps.map((step, index) => (
                <div key={index} className="relative text-center">
                  {/* Step Number */}
                  <div className="relative mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold mb-6 shadow-lg">
                    {step.step}
                  </div>
                  
                  {/* Icon */}
                  <div className="mb-4">
                    <step.icon className="h-8 w-8 text-blue-400 mx-auto" />
                  </div>
                  
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Supported Assets */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Supported Assets
            </h2>
            <p className="text-xl text-gray-600">
              Trade major cryptocurrencies and fiat currencies
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {supportedAssets.map((asset, index) => (
              <Card key={index} className="text-center border-2 hover:border-blue-500 transition-all duration-300 hover:shadow-lg">
                <CardContent className="p-8">
                  <div className={`w-16 h-16 ${asset.color} rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                    <span className="text-white text-2xl font-bold">
                      {asset.symbol.charAt(0)}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{asset.name}</h3>
                  <p className="text-gray-600">{asset.symbol}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-lg text-gray-600">
              <strong>INR & major fiat settlement supported</strong><br />
              Contact us for additional asset support
            </p>
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Key Benefits
            </h2>
            <p className="text-xl text-gray-600">
              Institutional-grade trading advantages
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="text-center border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <benefit.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                  <div className="text-2xl font-bold text-blue-600 mb-1">{benefit.value}</div>
                  <p className="text-gray-600 text-sm">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance & Trust */}
      <section className="py-24 bg-gradient-to-br from-gray-900 to-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Compliance & Trust
            </h2>
            <p className="text-xl text-gray-300">
              Fully regulated and compliant institutional trading
            </p>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-12 text-center">
              <div className="flex items-center justify-center gap-4 mb-8">
                <Shield className="h-12 w-12 text-blue-400" />
                <Lock className="h-12 w-12 text-slate-300" />
                <CheckCircle className="h-12 w-12 text-blue-400" />
              </div>
              
              <h3 className="text-3xl font-bold mb-6 text-white">
                🔒 Registered with Financial Intelligence Unit – India (FIU-IND)
              </h3>
              
              <div className="bg-blue-600/20 rounded-xl p-6 mb-6 border border-blue-500/30">
                <p className="text-2xl font-bold text-blue-300 mb-2">
                  FIU Registration Number: VA00293094
                </p>
              </div>
              
              <p className="text-lg text-gray-300 max-w-3xl mx-auto">
                All trades are conducted under strict AML & KYC guidelines, ensuring complete regulatory compliance 
                and the highest standards of institutional security.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quote Request Form */}
      <section id="quote-form" className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              💼 Ready to trade big with confidence?
            </h2>
            <p className="text-xl text-gray-600">
              Contact our OTC Desk today for personalized assistance
            </p>
          </div>

          <Card className="border-0 shadow-2xl bg-white">
            <CardContent className="p-12">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-lg font-semibold">Full Name *</Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="h-12 text-lg"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-lg font-semibold">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="h-12 text-lg"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-lg font-semibold">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="h-12 text-lg"
                      placeholder="+91 XXXXX XXXXX"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="asset" className="text-lg font-semibold">Preferred Asset *</Label>
                    <Select onValueChange={(value) => handleInputChange('asset', value)} required>
                      <SelectTrigger className="h-12 text-lg">
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
                  <Label htmlFor="tradeSize" className="text-lg font-semibold">Trade Size *</Label>
                  <Select onValueChange={(value) => handleInputChange('tradeSize', value)} required>
                    <SelectTrigger className="h-12 text-lg">
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
                  <Label htmlFor="message" className="text-lg font-semibold">Additional Requirements</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleInputChange('message', e.target.value)}
                    className="min-h-24 text-lg"
                    placeholder="Tell us about your trading requirements, timeline, or any specific needs..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-6">
                  <Button 
                    type="submit"
                    size="lg" 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 text-lg font-semibold"
                  >
                    <FileText className="mr-3 h-5 w-5" />
                    Request OTC Quote
                  </Button>
                  <Button 
                    type="button"
                    size="lg" 
                    variant="outline"
                    className="flex-1 border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white h-14 text-lg font-semibold"
                    onClick={() => navigate('/website/contact')}
                  >
                    <Phone className="mr-3 h-5 w-5" />
                    Schedule a Call
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-3xl font-bold mb-4">
            Join the Elite Crypto Trading Experience
          </h3>
          <p className="text-xl text-blue-100 mb-8">
            Get started with institutional-grade OTC trading today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 text-lg font-semibold"
              onClick={() => navigate('/website/contact')}
            >
              <Mail className="mr-2 h-5 w-5" />
              Contact OTC Desk
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 text-lg font-semibold"
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