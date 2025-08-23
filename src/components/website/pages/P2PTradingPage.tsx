import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRightLeft, 
  Shield, 
  Zap, 
  Globe, 
  CheckCircle, 
  ArrowRight,
  TrendingUp,
  Building2,
  Users,
  Rocket,
  Star,
  Clock,
  CreditCard,
  HeadphonesIcon,
  UserCheck,
  Target,
  BarChart3,
  DollarSign,
  Award,
  Sparkles
} from 'lucide-react';

export function P2PTradingPage() {
  const benefits = [
    {
      icon: Shield,
      title: 'Trusted Platforms',
      description: 'Execute trades via Binance, Bybit & Bitget.'
    },
    {
      icon: Globe,
      title: 'Local Expertise',
      description: 'INR support with smooth UPI, bank transfers & more.'
    },
    {
      icon: BarChart3,
      title: 'High Liquidity',
      description: 'Bulk buy & bulk sell support for institutions & individuals.'
    },
    {
      icon: Zap,
      title: 'Faster Settlements',
      description: 'Instant release and quick banking confirmations.'
    },
    {
      icon: CheckCircle,
      title: 'Compliance-Ready',
      description: 'KYC and AML checks to keep your trades safe.'
    },
    {
      icon: UserCheck,
      title: 'Dedicated Relationship Managers',
      description: 'For corporate & high-volume traders.'
    }
  ];

  const steps = [
    {
      number: '1',
      title: 'Choose Your Platform',
      description: 'Binance / Bybit / Bitget',
      icon: Target
    },
    {
      number: '2',
      title: 'Place Your Order',
      description: 'Buy or Sell USDT in INR',
      icon: CreditCard
    },
    {
      number: '3',
      title: 'Blynk Assists You',
      description: 'From KYC to settlement',
      icon: HeadphonesIcon
    },
    {
      number: '4',
      title: 'Complete Trade Securely',
      description: 'Fast, compliant, and transparent',
      icon: CheckCircle
    }
  ];

  const traderTypes = [
    {
      icon: Users,
      title: 'Retail Traders',
      description: 'Quick INR ↔ USDT conversions',
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-800'
    },
    {
      icon: Building2,
      title: 'Corporate Clients',
      description: 'High-volume trades with bulk rates',
      color: 'bg-purple-50 border-purple-200 dark:bg-purple-950/10 dark:border-purple-800'
    },
    {
      icon: Rocket,
      title: 'Startups & MSMEs',
      description: 'Easy entry into digital assets',
      color: 'bg-green-50 border-green-200 dark:bg-green-950/10 dark:border-green-800'
    },
    {
      icon: Award,
      title: 'Investors & Institutions',
      description: 'Secure P2P access at scale',
      color: 'bg-orange-50 border-orange-200 dark:bg-orange-950/10 dark:border-orange-800'
    }
  ];

  const exchanges = [
    {
      name: 'Binance',
      logo: '🟡',
      description: 'World\'s largest crypto exchange',
      volume: '$76B+ Daily Volume'
    },
    {
      name: 'Bybit',
      logo: '🟠',
      description: 'Leading derivatives platform',
      volume: '$15B+ Daily Volume'
    },
    {
      name: 'Bitget',
      logo: '🔵',
      description: 'Fast-growing global exchange',
      volume: '$8B+ Daily Volume'
    }
  ];

  const advantages = [
    {
      global: 'Global liquidity',
      local: 'Local settlement'
    },
    {
      global: 'Secure escrow',
      local: 'Transparent pricing'
    },
    {
      global: '24/7 WhatsApp Support',
      local: 'Dedicated RM'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 text-sm bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            🔄 Global P2P Trading
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            P2P Trading Platform
          </h1>
          <p className="text-2xl text-primary font-medium mb-4">
            Trade Seamlessly. Trade Securely.
          </p>
          <p className="text-lg text-muted-foreground max-w-5xl mx-auto leading-relaxed mb-8">
            At Blynk Virtual Technologies Pvt. Ltd., we bring you the power of global P2P exchanges like Binance, 
            Bybit, and Bitget—combined with our unmatched customer service, compliance, and execution speed. 
            Whether you are a retail trader or a corporate client, Blynk makes buying and selling crypto in INR effortless.
          </p>

          {/* Exchange Badges */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {exchanges.map((exchange, index) => (
              <Card key={index} className="bg-card/50 border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{exchange.logo}</span>
                  <div className="text-left">
                    <div className="font-semibold text-sm">{exchange.name}</div>
                    <div className="text-xs text-muted-foreground">{exchange.volume}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Why Trade P2P with Blynk */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            🌍 Why Trade P2P with Blynk?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow border-0 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="h-6 w-6 text-primary" />
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

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            ⚡ How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="hover:shadow-lg transition-all duration-300 text-center">
                  <CardContent className="p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">
                      {step.number}
                    </div>
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                    <ArrowRight className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Who Can Trade */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            📊 Who Can Trade with Us?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {traderTypes.map((type, index) => (
              <Card key={index} className={`hover:shadow-lg transition-shadow ${type.color}`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center">
                      <type.icon className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground mb-2">{type.title}</h3>
                      <p className="text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Why Blynk + Exchanges */}
        <Card className="mb-16 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-foreground mb-4">
                🚀 Why Blynk + Binance/Bybit/Bitget?
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                With the trust of leading global exchanges and the local services of Blynk, you get the best of both worlds:
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {advantages.map((advantage, index) => (
                <Card key={index} className="text-center">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <p className="font-semibold text-primary">{advantage.global}</p>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground">+</div>
                      <div className="p-3 bg-secondary/50 rounded-lg">
                        <p className="font-semibold text-foreground">{advantage.local}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {[
            { icon: TrendingUp, value: '₹100Cr+', label: 'Monthly Volume' },
            { icon: Clock, value: '<5 mins', label: 'Avg Settlement' },
            { icon: Star, value: '4.9/5', label: 'User Rating' },
            { icon: Users, value: '25,000+', label: 'Active Users' }
          ].map((stat, index) => (
            <Card key={index} className="text-center shadow-md border-0">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Final CTA */}
        <Card className="shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-8 text-center">
            <ArrowRightLeft className="h-16 w-16 mx-auto mb-6 text-primary-foreground" />
            <h2 className="text-3xl font-bold mb-4">Ready to Start P2P Trading?</h2>
            <p className="text-primary-foreground/90 mb-8 max-w-2xl mx-auto text-lg">
              ⚡ Your trusted P2P partner. Backed by the world's top exchanges. Powered by Blynk.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 px-8 py-4 text-lg font-semibold rounded-xl shadow-lg"
              >
                <TrendingUp className="h-5 w-5 mr-2" />
                Start Trading Now
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
            
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-primary-foreground/80">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>100% Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span>Instant Settlement</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>Global Liquidity</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-4">
            Need help getting started with P2P trading?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline" size="sm">
              💬 WhatsApp Support
            </Button>
            <Button variant="outline" size="sm">
              📧 support@blynkvirtual.com
            </Button>
            <Button variant="outline" size="sm">
              🤝 Request Relationship Manager
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}