
import { Shield, Users, TrendingUp, CheckCircle, ArrowRight, Zap, Lock, Globe, CreditCard, Clock, Star, DollarSign, Activity, MessageCircle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useNavigate } from 'react-router-dom';

export function P2PTradingPage() {
  const navigate = useNavigate();

  const trustMetrics = [
    {
      icon: Users,
      title: "50,000+",
      subtitle: "Active Traders",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: DollarSign,
      title: "₹200 Cr+",
      subtitle: "Monthly Volume",
      color: "from-green-500 to-green-600"
    },
    {
      icon: Clock,
      title: "15-30",
      subtitle: "Minutes Avg Trade Time",
      color: "from-purple-500 to-purple-600"
    },
    {
      icon: Activity,
      title: "99.9%",
      subtitle: "Success Rate",
      color: "from-orange-500 to-orange-600"
    }
  ];

  const tradingProcess = [
    {
      step: 1,
      title: "Initiate Trade",
      description: "Browse available offers and select one that matches your requirements, or create your own offer.",
      icon: TrendingUp,
      details: [
        "Browse offers with competitive rates",
        "Filter by payment method and price",
        "Select amount you want to trade",
        "Create custom offers if needed"
      ],
      color: "bg-blue-600"
    },
    {
      step: 2,
      title: "Make Payment",
      description: "Complete the payment using your preferred method (UPI, IMPS, NEFT) within the specified time frame.",
      icon: CreditCard,
      details: [
        "Use UPI, IMPS, NEFT or bank transfers",
        "Secure payment gateway integration",
        "Real-time payment confirmation",
        "Multiple banking partners supported"
      ],
      color: "bg-green-600"
    },
    {
      step: 3,
      title: "Verification",
      description: "The seller confirms the payment has been received and our system verifies the transaction.",
      icon: Shield,
      details: [
        "Automatic payment verification",
        "Secure escrow protection",
        "Real-time transaction monitoring",
        "Dispute resolution available"
      ],
      color: "bg-purple-600"
    },
    {
      step: 4,
      title: "Completion",
      description: "The USDT is automatically transferred to the buyer's wallet, completing the transaction.",
      icon: CheckCircle,
      details: [
        "Instant crypto transfer",
        "Transaction confirmation",
        "Receipt generation",
        "Rating system for traders"
      ],
      color: "bg-orange-600"
    }
  ];

  const tradingTips = [
    {
      title: "Check Trader Reputation",
      description: "Always verify the trader's reputation score and transaction history before initiating a trade."
    },
    {
      title: "Use Secure Payment Methods",
      description: "Stick to the payment methods specified in the offer and never use methods outside the platform."
    },
    {
      title: "Complete Trades Quickly",
      description: "Process payments and confirm trades promptly to maintain a good reputation score."
    },
    {
      title: "Keep Communication Clear",
      description: "Maintain clear communication with your trading partner through our secure messaging system."
    },
    {
      title: "Start with Small Trades",
      description: "If you're new, begin with smaller transactions to build your reputation score."
    },
    {
      title: "Use Two-Factor Authentication",
      description: "Always enable 2FA to add an extra layer of security to your account."
    }
  ];

  const faqs = [
    {
      question: "How long does it take to complete a trade?",
      answer: "Most trades are completed within 15-30 minutes, depending on payment confirmation speed."
    },
    {
      question: "What if the seller doesn't release the USDT after payment?",
      answer: "Our dedicated support team can help resolve disputes, and our escrow system ensures fair transactions."
    },
    {
      question: "What payment methods are supported?",
      answer: "We support UPI, IMPS, NEFT, and bank transfers for seamless transactions."
    },
    {
      question: "Are there any fees for trading?",
      answer: "We charge a small fee of 0.5% for sellers. Buyers do not pay any fees."
    },
    {
      question: "How secure is trading on our platform?",
      answer: "We use bank-level encryption, secure escrow services, and strict KYC verification to ensure safe trading."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Hero Section */}
      <section className="relative text-white py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 via-red-600/20 to-orange-700/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <TrendingUp className="h-8 w-8 text-blue-400 mr-3" />
              <span className="text-blue-300 font-medium">P2P TRADING PLATFORM</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              Trade Crypto Directly with Verified Users
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
              Your step-by-step guide to buying and selling USDT securely on India's most trusted P2P platform
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 px-10 py-4 text-xl rounded-full shadow-lg"
                onClick={() => navigate('/website/login')}
              >
                Start Trading
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-slate-900 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/vasp/kyc')}
              >
                Complete KYC
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-4 gap-4">
              {trustMetrics.map((metric, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className={`mx-auto mb-2 p-2 bg-gradient-to-r ${metric.color} rounded-full w-12 h-12 flex items-center justify-center`}>
                    <metric.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-white">{metric.title}</div>
                  <div className="text-blue-200 text-sm">{metric.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trading Process Section */}
      <section className="py-20 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">The P2P Trading Process</h2>
            <p className="text-xl text-slate-300">Our streamlined process makes buying and selling USDT simple, secure, and fast</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {tradingProcess.map((step, index) => (
              <div key={index} className="relative">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                  {step.step}
                </div>
                <Card className="bg-slate-700 border-0 pt-8 hover:bg-slate-600 transition-all duration-300">
                  <CardContent className="text-center p-6">
                    <div className={`mx-auto mb-4 p-3 ${step.color} rounded-full w-16 h-16 flex items-center justify-center`}>
                      <step.icon className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                    <p className="text-slate-300 mb-4">{step.description}</p>
                    <ul className="text-left space-y-2">
                      {step.details.map((detail, idx) => (
                        <li key={idx} className="flex items-center text-sm text-slate-400">
                          <CheckCircle className="h-4 w-4 text-green-400 mr-2 flex-shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detailed Guide Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">Detailed Guide to Trading</h2>
            <p className="text-xl text-slate-300">Follow these detailed steps for a smooth trading experience</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Account Creation */}
            <Card className="bg-slate-800 border-0">
              <CardHeader>
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">1</div>
                  <CardTitle className="text-2xl text-white">Creating an Account</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-400 mr-3" />
                    <span className="text-slate-300">Sign up using your email or phone number</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-400 mr-3" />
                    <span className="text-slate-300">Complete the KYC verification with your Aadhaar and PAN</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-400 mr-3" />
                    <span className="text-slate-300">Add your bank details for seamless transactions</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-400 mr-3" />
                    <span className="text-slate-300">Enable 2FA for enhanced security</span>
                  </div>
                </div>
                <Button 
                  className="w-full mt-6 bg-blue-600 hover:bg-blue-700"
                  onClick={() => navigate('/website/vasp/kyc')}
                >
                  Learn More About KYC
                </Button>
              </CardContent>
            </Card>

            {/* Finding Trades */}
            <Card className="bg-slate-800 border-0">
              <CardHeader>
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-bold mr-4">2</div>
                  <CardTitle className="text-2xl text-white">Finding and Making Trades</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                    <span className="text-slate-300">Browse available offers with competitive rates</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                    <span className="text-slate-300">Filter offers by payment method, price, or trader reputation</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                    <span className="text-slate-300">Select an offer and enter the amount you want to trade</span>
                  </div>
                  <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                    <span className="text-slate-300">Confirm the trade details and initiate the transaction</span>
                  </div>
                </div>
                <Button 
                  className="w-full mt-6 bg-green-600 hover:bg-green-700"
                  onClick={() => navigate('/website/login')}
                >
                  View Available Payment Methods
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Security Section */}
          <div className="mt-12">
            <Card className="bg-slate-800 border-0">
              <CardHeader>
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-4">3</div>
                  <CardTitle className="text-2xl text-white">Completing Transactions Safely</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-purple-400 mr-3" />
                      <span className="text-slate-300">Use our secure escrow service for all transactions</span>
                    </div>
                    <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-purple-400 mr-3" />
                      <span className="text-slate-300">Communicate with trading partners via built-in messaging</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-purple-400 mr-3" />
                      <span className="text-slate-300">Mark payment as complete only after confirmation</span>
                    </div>
                    <div className="flex items-center p-3 bg-slate-700 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-purple-400 mr-3" />
                      <span className="text-slate-300">Rate your trading partner after successful transactions</span>
                    </div>
                  </div>
                </div>
                <Button 
                  className="w-full mt-6 bg-purple-600 hover:bg-purple-700"
                  onClick={() => navigate('/website/vasp/security')}
                >
                  Learn About Our Security
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trading Tips Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Trading Tips for Success</h2>
            <p className="text-xl text-gray-600">Follow these best practices for a seamless trading experience</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tradingTips.map((tip, index) => (
              <Card key={index} className="bg-slate-800 border-0 hover:bg-slate-700 transition-all duration-300">
                <CardContent className="p-6 text-center">
                  <h3 className="text-lg font-semibold text-white mb-3">{tip.title}</h3>
                  <p className="text-slate-300">{tip.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-gray-600">Common questions about P2P trading on our platform</p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-gray-600 text-base">
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
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-blue-300 mr-3" />
            <span className="text-blue-200 font-medium">SECURE & RELIABLE P2P TRADING</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">Ready to Start P2P Trading?</h2>
          <p className="text-xl mb-10">
            Join thousands of traders who trust our platform for secure and instant crypto transactions.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/login')}
            >
              Start Trading Now
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

          {/* Bottom Features */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center justify-center mb-3">
                <Shield className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Secure Escrow</h3>
              <p className="text-blue-200 text-sm">Every transaction protected by our secure escrow system</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-3">
                <Clock className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Fast Transactions</h3>
              <p className="text-blue-200 text-sm">Complete trades in 15-30 minutes with instant confirmations</p>
            </div>
            <div>
              <div className="flex items-center justify-center mb-3">
                <Users className="h-8 w-8 text-blue-300 mr-2" />
              </div>
              <h3 className="font-semibold text-white mb-2">Verified Traders</h3>
              <p className="text-blue-200 text-sm">Trade only with KYC-verified and trusted users</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
