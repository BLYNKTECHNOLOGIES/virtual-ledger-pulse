import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  Clock, 
  Shield, 
  Users, 
  Zap, 
  CheckCircle, 
  ArrowRight,
  Globe,
  CreditCard,
  UserCheck,
  Building2,
  Settings,
  HelpCircle,
  Smartphone,
  Star,
  Heart,
  Lock
} from 'lucide-react';

export function WhatsAppSupportPage() {
  const benefits = [
    {
      icon: Zap,
      title: 'Instant Responses',
      description: 'No waiting in ticket queues, get help in real-time.'
    },
    {
      icon: Heart,
      title: 'Personalized Conversations',
      description: 'Chat with our support team just like you would with a friend.'
    },
    {
      icon: Clock,
      title: '24/7 Availability',
      description: 'Day or night, weekday or weekend, our team is just a message away.'
    },
    {
      icon: Lock,
      title: 'Secure & Confidential',
      description: 'All conversations are private and protected.'
    },
    {
      icon: Globe,
      title: 'Multi-Language Support',
      description: 'Communicate in a language you\'re comfortable with.'
    }
  ];

  const supportServices = [
    {
      icon: CreditCard,
      title: 'Transaction & Settlement Queries',
      description: 'Get instant help with your payments and settlements'
    },
    {
      icon: Users,
      title: 'P2P Trading Assistance',
      description: 'Step-by-step guidance for peer-to-peer transactions'
    },
    {
      icon: UserCheck,
      title: 'KYC / Verification Support',
      description: 'Complete your verification process smoothly'
    },
    {
      icon: Building2,
      title: 'Corporate & Bulk Orders',
      description: 'Dedicated support for business clients'
    },
    {
      icon: Settings,
      title: 'Technical Issue Resolution',
      description: 'Quick fixes for platform and technical problems'
    },
    {
      icon: HelpCircle,
      title: 'General Guidance',
      description: 'Any questions about crypto trading and our services'
    }
  ];

  const steps = [
    {
      number: '1',
      title: 'Click the WhatsApp Button Below',
      description: 'Instant access to our support team'
    },
    {
      number: '2',
      title: 'Start a Chat with Our Support Team',
      description: 'Begin your conversation immediately'
    },
    {
      number: '3',
      title: 'Get Instant Assistance',
      description: 'Anytime, Anywhere'
    }
  ];

  const handleWhatsAppClick = () => {
    // Replace with actual WhatsApp business number
    const whatsappNumber = '+911234567890';
    const message = 'Hi! I need support with Blynk Virtual Technologies. Please help me.';
    const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 text-sm bg-green-100 text-green-800 border-green-200">
            💬 Instant Support
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            24/7 WhatsApp Support
          </h1>
          <p className="text-2xl text-green-600 font-medium mb-4">
            Always Available. Always Connected.
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            At Blynk Virtual Technologies Pvt. Ltd., we understand that crypto trading never sleeps — and neither do we. 
            That's why we offer round-the-clock WhatsApp support, ensuring you get instant help, anytime, anywhere.
          </p>
        </div>

        {/* Main WhatsApp CTA */}
        <div className="text-center mb-16">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/10 dark:to-emerald-950/10 border-green-200 dark:border-green-800">
            <CardContent className="p-8">
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                  <MessageCircle className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Connect Instantly on WhatsApp
              </h2>
              <p className="text-muted-foreground mb-6">
                ⚡ Trading is 24/7, so is our support. Connect with us on WhatsApp and experience effortless assistance.
              </p>
              <Button 
                onClick={handleWhatsAppClick}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg"
                size="lg"
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                Chat on WhatsApp Now
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Available 24/7 • Average response time: 2 minutes
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Why WhatsApp Support */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            ⚡ Why WhatsApp Support?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow border-0 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* What We Can Help You With */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            🛠️ What We Can Help You With
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {supportServices.map((service, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <service.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{service.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            📱 How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">
                      {step.number}
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
                {index < steps.length - 1 && (
                  <div className="hidden md:block">
                    <ArrowRight className="h-6 w-6 text-muted-foreground mx-auto mt-8" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Live Status */}
            <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/10 dark:to-emerald-950/10 border-green-200 dark:border-green-800">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <h3 className="text-xl font-bold text-foreground">Live Support Status</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Status:</span>
                    <Badge className="bg-green-100 text-green-800 border-green-200">Online</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average Response:</span>
                    <span className="font-semibold text-foreground">2 minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Languages:</span>
                    <span className="font-semibold text-foreground">English, Hindi</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Availability:</span>
                    <span className="font-semibold text-foreground">24/7/365</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Tips */}
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/10 dark:to-indigo-950/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-8">
                <h3 className="text-xl font-bold text-foreground mb-4">💡 Quick Tips for Better Support</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                    <span className="text-sm text-muted-foreground">Share your transaction ID when reporting issues</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                    <span className="text-sm text-muted-foreground">Include screenshots for technical problems</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                    <span className="text-sm text-muted-foreground">Provide complete order details for faster resolution</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                    <span className="text-sm text-muted-foreground">Be specific about your query to get precise help</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Final CTA */}
        <Card className="shadow-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white">
          <CardContent className="p-8 text-center">
            <Smartphone className="h-16 w-16 mx-auto mb-6 text-white" />
            <h2 className="text-3xl font-bold mb-4">Ready to Get Instant Help?</h2>
            <p className="text-green-50 mb-8 max-w-2xl mx-auto text-lg">
              Join thousands of satisfied customers who trust our WhatsApp support for quick, reliable assistance with all their crypto trading needs.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-green-600 hover:bg-green-50 px-8 py-4 text-lg font-semibold"
                onClick={handleWhatsAppClick}
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                Start WhatsApp Chat
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
            
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-green-100">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-current" />
                <span>4.8/5 Rating</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>10,000+ Satisfied Users</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>2 min Avg Response</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alternative Contact */}
        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-4">
            Prefer other contact methods?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline" size="sm">
              📧 support@blynkvirtual.com
            </Button>
            <Button variant="outline" size="sm">
              📞 +91-XXXXXXXXXX
            </Button>
            <Button variant="outline" size="sm">
              💬 Live Chat on Website
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}