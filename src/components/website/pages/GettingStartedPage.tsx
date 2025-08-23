import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlus, 
  Shield, 
  CreditCard, 
  TrendingUp, 
  BarChart3, 
  HeadphonesIcon,
  CheckCircle,
  Users,
  Globe,
  Zap,
  ArrowRight
} from 'lucide-react';

export function GettingStartedPage() {
  const navigate = useNavigate();

  const steps = [
    {
      number: "01",
      title: "Create Your Account",
      icon: UserPlus,
      details: [
        "Sign up with your email / mobile number",
        "Verify your contact details",
        "Set up a strong password for security"
      ]
    },
    {
      number: "02", 
      title: "Complete KYC Verification",
      icon: Shield,
      details: [
        "Upload your Aadhaar / PAN (for individuals)",
        "For corporates: Submit Company Registration + GST + Bank Proofs",
        "Quick approval through our Compliance Team"
      ]
    },
    {
      number: "03",
      title: "Add Your Payment Method", 
      icon: CreditCard,
      details: [
        "Link your UPI ID or Bank Account",
        "Verified instantly for smooth settlements",
        "Corporate clients can request Current Account integration"
      ]
    },
    {
      number: "04",
      title: "Start Trading",
      icon: TrendingUp,
      details: [
        "Choose from Buy or Sell options",
        "Get the best live rates powered by Binance, Bybit, Bitget",
        "Secure trades backed by Blynk's P2P escrow protection"
      ]
    },
    {
      number: "05",
      title: "Track & Manage Your Orders",
      icon: BarChart3,
      details: [
        "Real-time order tracking",
        "Easy history view for completed trades",
        "Access profit & loss reports directly in your dashboard"
      ]
    },
    {
      number: "06",
      title: "Get Support Anytime",
      icon: HeadphonesIcon,
      details: [
        "24/7 WhatsApp Support for quick help",
        "Dedicated Relationship Manager for high-volume traders",
        "Active Help Centre with FAQs & guides"
      ]
    }
  ];

  const benefits = [
    { icon: Users, text: "Trusted by 1000+ traders" },
    { icon: Globe, text: "Backed by Binance, Bybit, Bitget integrations" },
    { icon: Shield, text: "Secure, compliant, and transparent" },
    { icon: Zap, text: "Fast payments via UPI & Bank Transfers" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Zap className="w-4 h-4 mr-2" />
            Getting Started Guide
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Getting Started with <span className="text-primary">Blynk</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Trading crypto with Blynk Virtual Technologies Pvt. Ltd. is simple, secure, and fast.
            Follow these steps to start your journey today.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => navigate('/website/kyc-form')}
              className="gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Start Your KYC Now
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/website/whatsapp-support')}
              className="gap-2"
            >
              <HeadphonesIcon className="w-5 h-5" />
              Get Help
            </Button>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Your Journey in 6 Simple Steps
            </h2>
            <p className="text-lg text-muted-foreground">
              From account creation to your first trade – we guide you every step
            </p>
          </div>

          <div className="grid gap-8 md:gap-12">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              
              return (
                <div key={step.number} className={`flex flex-col md:flex-row items-center gap-8 ${!isEven ? 'md:flex-row-reverse' : ''}`}>
                  {/* Step Content */}
                  <div className="flex-1">
                    <Card className="p-8 h-full hover:shadow-lg transition-all duration-300">
                      <CardContent className="p-0">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Icon className="w-8 h-8 text-primary" />
                          </div>
                          <div>
                            <Badge variant="outline" className="mb-2">
                              Step {step.number}
                            </Badge>
                            <h3 className="text-2xl font-bold text-foreground">
                              {step.title}
                            </h3>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          {step.details.map((detail, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                              <p className="text-muted-foreground">{detail}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Step Number */}
                  <div className="flex-shrink-0">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                      {step.number}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Blynk Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Why Choose <span className="text-primary">Blynk</span>?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <div key={index} className="flex items-center gap-4 p-6 bg-background rounded-lg border">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-foreground font-medium">{benefit.text}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <Button 
              size="lg" 
              onClick={() => navigate('/website/kyc-form')}
              className="w-full md:w-auto gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Sign Up & Start Trading
              <ArrowRight className="w-4 h-4" />
            </Button>
            
            <p className="text-sm text-muted-foreground">
              Your crypto journey starts here — safe, fast, and reliable with Blynk.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-foreground mb-8">
            Quick Access Links
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/website/p2p-trading')}>
              <CardContent className="p-0 text-center">
                <TrendingUp className="w-12 h-12 text-primary mx-auto mb-4" />
                <h4 className="font-semibold text-foreground mb-2">P2P Trading</h4>
                <p className="text-sm text-muted-foreground">Learn about our trading platform</p>
              </CardContent>
            </Card>
            
            <Card className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/website/payment-methods')}>
              <CardContent className="p-0 text-center">
                <CreditCard className="w-12 h-12 text-primary mx-auto mb-4" />
                <h4 className="font-semibold text-foreground mb-2">Payment Methods</h4>
                <p className="text-sm text-muted-foreground">See all supported payment options</p>
              </CardContent>
            </Card>
            
            <Card className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate('/website/whatsapp-support')}>
              <CardContent className="p-0 text-center">
                <HeadphonesIcon className="w-12 h-12 text-primary mx-auto mb-4" />
                <h4 className="font-semibold text-foreground mb-2">24/7 Support</h4>
                <p className="text-sm text-muted-foreground">Get help anytime via WhatsApp</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}