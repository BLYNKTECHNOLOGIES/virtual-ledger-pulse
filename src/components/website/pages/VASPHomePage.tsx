import { useState } from 'react';
import { Shield, Users, FileCheck, Globe, CheckCircle, ArrowRight, Download, Phone, Mail, MessageCircle, MapPin, TrendingUp, Clock, Zap, CreditCard, DollarSign, Activity } from 'lucide-react';
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

  const trustMetrics = [
    {
      icon: Users,
      title: "1,21,019",
      subtitle: "Active Users",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: DollarSign,
      title: "₹99 Cr+",
      subtitle: "Monthly Volume",
      color: "from-green-500 to-green-600"
    },
    {
      icon: Clock,
      title: "less than 5",
      subtitle: "Processing Time (minutes)",
      color: "from-purple-500 to-purple-600"
    },
    {
      icon: Activity,
      title: "57,894+",
      subtitle: "Transactions",
      color: "from-orange-500 to-orange-600"
    },
    {
      icon: Shield,
      title: "100%",
      subtitle: "Security Standard",
      color: "from-red-500 to-red-600"
    }
  ];

  const liveMarketData = [
    {
      pair: "USDT/INR Rate",
      rate: "₹92.70",
      change: "-0.4%",
      isPositive: false
    },
    {
      pair: "BTC/INR",
      rate: "₹42,15,000",
      change: "+2.1%",
      isPositive: true
    },
    {
      pair: "ETH/INR",
      rate: "₹3,25,450",
      change: "+1.8%",
      isPositive: true
    }
  ];

  const recentTransactions = [
    {
      amount: "₹97,200",
      crypto: "1,167.10 USDT",
      status: "Complete",
      time: "18 mins ago"
    },
    {
      amount: "₹2,50,000",
      crypto: "3,001.20 USDT",
      status: "Complete",
      time: "23 mins ago"
    },
    {
      amount: "₹32,500",
      crypto: "390.15 USDT",
      status: "Complete",
      time: "25 mins ago"
    }
  ];

  const whyChooseFeatures = [
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level security with 2FA authentication, advanced encryption and cold storage",
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600"
    },
    {
      icon: Clock,
      title: "24/7 Trading",
      description: "Buy and sell Crypto anytime, with instant matching and continuous order execution",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600"
    },
    {
      icon: Zap,
      title: "Lightning Transactions",
      description: "Industry-leading fast deposits and withdrawals directly to your bank account",
      bgColor: "bg-yellow-50",
      iconColor: "text-yellow-600"
    },
    {
      icon: TrendingUp,
      title: "Best Market Rates",
      description: "Get the most competitive Crypto exchange rates with low spreads and transparent fees",
      bgColor: "bg-green-50",
      iconColor: "text-green-600"
    },
    {
      icon: ArrowRight,
      title: "Seamless Conversions",
      description: "Effortless Crypto to INR and INR to Crypto conversions with minimal slippage",
      bgColor: "bg-indigo-50",
      iconColor: "text-indigo-600"
    },
    {
      icon: CreditCard,
      title: "Verified Partners",
      description: "Trade only with KYC-verified and trusted partners on our secure P2P network",
      bgColor: "bg-pink-50",
      iconColor: "text-pink-600"
    }
  ];

  const processSteps = [
    {
      step: 1,
      title: "Create an Account",
      description: "Complete our streamlined KYC process in minutes with Aadhaar and PAN verification.",
      icon: Users,
      color: "bg-blue-600"
    },
    {
      step: 2,
      title: "Add Funds",
      description: "Deposit INR directly using UPI, IMPS, or NEFT with zero deposit fees.",
      icon: CreditCard,
      color: "bg-green-600"
    },
    {
      step: 3,
      title: "Buy or Sell Crypto",
      description: "Trade Crypto at competitive rates with our high-liquidity order matching system.",
      icon: TrendingUp,
      color: "bg-purple-600"
    },
    {
      step: 4,
      title: "Withdraw Funds",
      description: "Fast withdrawals directly to your bank account, processed within minutes.",
      icon: Download,
      color: "bg-orange-600"
    }
  ];

  const escrowFeatures = [
    "Funds held in secure escrow until trade completion",
    "Dispute resolution system available 24/7",
    "Multi-signature wallet protection",
    "Real-time transaction monitoring"
  ];

  const paymentOptions = [
    "UPI, IMPS, NEFT, and bank transfers supported",
    "Instant INR deposits and withdrawals",
    "Zero deposit fees for all payment methods",
    "Support for all major Indian banks"
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Hero Section */}
      <section className="relative text-white py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 via-red-600/20 to-orange-700/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-blue-400 mr-3" />
              <span className="text-blue-300 font-medium">SECURE & RELIABLE</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              India's Trusted Virtual Asset Service Provider
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
              KYC-powered, AML-compliant P2P and Digital Asset Services by Blynk Virtual Technologies
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 px-10 py-4 text-xl rounded-full shadow-lg"
                onClick={() => navigate('/website/vasp/kyc')}
              >
                Start KYC
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-slate-900 px-10 py-4 text-xl rounded-full"
              >
                Learn More
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-2xl font-bold text-white">₹0</div>
                <div className="text-blue-200">Account Fee</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-2xl font-bold text-white">24/7</div>
                <div className="text-blue-200">Customer Support</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-2xl font-bold text-white">2 min</div>
                <div className="text-blue-200">KYC Processing</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Metrics Section */}
      <section className="py-16 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-6">Trusted by Thousands Across India</h2>
            <p className="text-xl text-slate-300">Our platform consistently delivers reliable performance and security</p>
          </div>
          <div className="grid md:grid-cols-5 gap-6">
            {trustMetrics.map((metric, index) => (
              <Card key={index} className="bg-slate-700 border-0 hover:bg-slate-600 transition-all duration-300">
                <CardContent className="p-6 text-center">
                  <div className={`mx-auto mb-4 p-3 bg-gradient-to-r ${metric.color} rounded-full w-16 h-16 flex items-center justify-center`}>
                    <metric.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">{metric.title}</div>
                  <div className="text-slate-300 text-sm">{metric.subtitle}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Live Market Insights */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-6">Live Market Insights</h2>
            <p className="text-xl text-slate-300">Real-time exchange rates and transaction metrics</p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Exchange Rates */}
            <Card className="bg-slate-800 border-0">
              <CardHeader>
                <CardTitle className="text-white text-xl">Exchange Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {liveMarketData.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
                    <div>
                      <div className="text-white font-medium">{item.pair}</div>
                      <div className="text-slate-300 text-sm">{item.rate}</div>
                    </div>
                    <div className={`px-2 py-1 rounded text-sm ${
                      item.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {item.change}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Transaction Speed */}
            <Card className="bg-slate-800 border-0">
              <CardHeader>
                <CardTitle className="text-white text-xl">Transaction Speed</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <div className="w-full h-full rounded-full border-8 border-slate-600"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-400">2.2</div>
                      <div className="text-slate-300 text-sm">minutes</div>
                    </div>
                  </div>
                </div>
                <p className="text-slate-300">Average confirmation time for all transactions</p>
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card className="bg-slate-800 border-0">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white text-xl">Recent Transactions</CardTitle>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-blue-400 text-sm">Live</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentTransactions.map((tx, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-slate-700 rounded-lg">
                    <div>
                      <div className="text-white font-medium">{tx.amount}</div>
                      <div className="text-slate-300 text-sm">{tx.crypto}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 text-sm">✓ {tx.status}</div>
                      <div className="text-slate-400 text-xs">{tx.time}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Choose Blynk Virtual Technologies</h2>
            <p className="text-xl text-gray-600">Experience unparalleled security and performance with our cutting-edge Crypto trading platform</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyChooseFeatures.map((feature, index) => (
              <Card key={index} className={`${feature.bgColor} border-0 hover:shadow-lg transition-all duration-300`}>
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-4 bg-white rounded-full w-20 h-20 flex items-center justify-center">
                    <feature.icon className={`h-10 w-10 ${feature.iconColor}`} />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-700 text-center leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-20 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">Get started with Blynk Virtual Technologies in a few simple steps</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {processSteps.map((step, index) => (
              <div key={index} className="relative text-center">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  {step.step}
                </div>
                <Card className="bg-slate-700 border-0 pt-8">
                  <CardContent className="text-center p-6">
                    <div className={`mx-auto mb-4 p-3 ${step.color} rounded-full w-16 h-16 flex items-center justify-center`}>
                      <step.icon className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                    <p className="text-slate-300">{step.description}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-0">
              <CardHeader>
                <div className="flex items-center mb-4">
                  <Shield className="h-8 w-8 text-blue-600 mr-3" />
                  <CardTitle className="text-2xl text-blue-900">Secure Escrow System</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-blue-800 mb-6">
                  Every transaction on Blynk Virtual Technologies is protected by our secure escrow system, ensuring both buyers and sellers are protected throughout the trading process.
                </p>
                <ul className="space-y-3">
                  {escrowFeatures.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0" />
                      <span className="text-blue-800">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-0">
              <CardHeader>
                <div className="flex items-center mb-4">
                  <CreditCard className="h-8 w-8 text-green-600 mr-3" />
                  <CardTitle className="text-2xl text-green-900">Multiple Payment Options</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-green-800 mb-6">
                  Blynk Virtual Technologies supports all major Indian payment methods, making it easy to buy and sell Crypto with your preferred payment method.
                </p>
                <ul className="space-y-3">
                  {paymentOptions.map((option, index) => (
                    <li key={index} className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                      <span className="text-green-800">{option}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
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

      {/* Ready to Start Trading CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-blue-300 mr-3" />
            <span className="text-blue-200 font-medium">SECURE & RELIABLE</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">Ready to Start Trading Crypto?</h2>
          <p className="text-xl mb-10">
            Join thousands of traders across India who trust Blynk Virtual Technologies for secure and instant Crypto transactions.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc')}
            >
              Create Free Account
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Get Support
            </Button>
          </div>

          {/* Bottom Stats */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center justify-center mb-3">
                <Shield className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Bank-Level Security</h3>
              <p className="text-blue-200 text-sm">Multi-signature wallets and advanced encryption to keep your assets safe</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-3">
                <Clock className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Instant Processing</h3>
              <p className="text-blue-200 text-sm">Fast deposit and withdrawal processing, with real-time transaction status</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-3">
                <CreditCard className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Multiple Payment Options</h3>
              <p className="text-blue-200 text-sm">Support for all major Indian payment methods, including UPI, IMPS, and NEFT</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section with enhanced design */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">Get in Touch</h2>
            <p className="text-xl text-slate-300">Ready to start your VASP journey?</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card className="bg-slate-800 border-0">
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Input
                      placeholder="Your Name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <Input
                      type="email"
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <Textarea
                      placeholder="Your Message"
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                      rows={6}
                      className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700">
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <div className="space-y-8">
              <Card className="bg-slate-800 border-0 p-6">
                <div className="flex items-start space-x-4">
                  <Phone className="h-6 w-6 text-orange-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white">Phone</h3>
                    <p className="text-slate-300">+91 9266712788</p>
                  </div>
                </div>
              </Card>
              
              <Card className="bg-slate-800 border-0 p-6">
                <div className="flex items-start space-x-4">
                  <Mail className="h-6 w-6 text-orange-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white">Email</h3>
                    <p className="text-slate-300">support@blynkex.com</p>
                  </div>
                </div>
              </Card>
              
              <Card className="bg-slate-800 border-0 p-6">
                <div className="flex items-start space-x-4">
                  <MessageCircle className="h-6 w-6 text-orange-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white">WhatsApp</h3>
                    <p className="text-slate-300">+91 9266712788</p>
                  </div>
                </div>
              </Card>
              
              <Card className="bg-slate-800 border-0 p-6">
                <div className="flex items-start space-x-4">
                  <MapPin className="h-6 w-6 text-orange-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white">Office Address</h3>
                    <p className="text-slate-300">
                      First Floor Balwant Arcade, Plot No. 15<br />
                      Maharana Pratap Nagar, Zone II<br />
                      Bhopal, 462011, Madhya Pradesh, India
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
