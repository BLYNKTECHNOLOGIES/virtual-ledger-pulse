import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Clock, 
  Users, 
  DollarSign,
  CheckCircle,
  ArrowRight,
  Building2,
  Mail,
  Phone,
  Zap,
  Target,
  BarChart3,
  Award
} from 'lucide-react';

export function BulkTradingPage() {
  const [activeTab, setActiveTab] = useState('buy');

  const benefits = [
    {
      icon: Target,
      title: 'Personalized Rates',
      description: 'Get the best negotiated prices for large orders'
    },
    {
      icon: Users,
      title: 'Dedicated Relationship Manager',
      description: 'One-on-one support for seamless execution'
    },
    {
      icon: Zap,
      title: 'Instant Settlement',
      description: 'Faster INR ↔ USDT transactions'
    },
    {
      icon: BarChart3,
      title: 'High Liquidity',
      description: 'Deep liquidity pool to handle large transactions'
    },
    {
      icon: Shield,
      title: 'Secure & Compliant',
      description: '100% regulated framework, full KYC required'
    }
  ];

  const stats = [
    {
      value: '₹500Cr+',
      label: 'Total Liquidity',
      icon: DollarSign,
      color: 'text-green-600'
    },
    {
      value: '<2 mins',
      label: 'Avg. Settlement Time',
      icon: Clock,
      color: 'text-blue-600'
    },
    {
      value: '99.9%',
      label: 'Trust Score',
      icon: Award,
      color: 'text-purple-600'
    },
    {
      value: '24/7',
      label: 'Support Available',
      icon: Users,
      color: 'text-orange-600'
    }
  ];

  const steps = [
    {
      number: '1',
      title: 'Submit a Bulk Order Request',
      description: 'Fill the form with order amount & purpose'
    },
    {
      number: '2', 
      title: 'Get a Custom Quote',
      description: 'Our team provides best available rate'
    },
    {
      number: '3',
      title: 'Complete KYC & Compliance',
      description: 'Required for all large-volume trades'
    },
    {
      number: '4',
      title: 'Confirm & Settle',
      description: 'Instant execution and transfer'
    }
  ];

  const enterpriseFeatures = [
    'Recurring bulk orders (weekly/monthly)',
    'Hedging solutions against volatility',
    'Dedicated account management',
    'Custom API integration',
    'Priority support channel',
    'Regulatory compliance assistance'
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            🚀 Enterprise Trading Solution
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Bulk Buy & Sell USDT with INR
          </h1>
          <p className="text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed mb-8">
            Simplify Large-Volume Crypto Transactions. Our Bulk Trading Desk is designed for institutions, 
            enterprises, and high-net-worth individuals who need to trade large volumes of USDT securely with INR.
          </p>
          
          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <Card key={index} className="text-center border-0 shadow-md">
                <CardContent className="p-4">
                  <div className={`w-8 h-8 mx-auto mb-2 flex items-center justify-center`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            Why Choose Bulk Trading with Us?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Main Trading Cards */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            Bulk Buy / Bulk Sell Options
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Bulk Buy Card */}
            <Card className="shadow-xl border-0 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/10 dark:to-blue-950/10">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">
                  📈 Bulk Buy USDT
                </CardTitle>
                <p className="text-muted-foreground">Purchase large volumes with INR</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white/80 dark:bg-background/80 p-4 rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Minimum Order:</span>
                    <span className="font-semibold text-foreground">₹5,00,000</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Maximum Order:</span>
                    <span className="font-semibold text-foreground">Custom (On request)</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Instant INR → USDT settlement</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Locked-in negotiated rate</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Dedicated support throughout</span>
                  </div>
                </div>

                <Button className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white py-6 text-lg">
                  Request Bulk Buy Quote
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Bulk Sell Card */}
            <Card className="shadow-xl border-0 bg-gradient-to-br from-red-50 to-blue-50 dark:from-red-950/10 dark:to-blue-950/10">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingDown className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">
                  📉 Bulk Sell USDT
                </CardTitle>
                <p className="text-muted-foreground">Convert USDT to INR instantly</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white/80 dark:bg-background/80 p-4 rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Minimum Order:</span>
                    <span className="font-semibold text-foreground">5,000 USDT</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Maximum Order:</span>
                    <span className="font-semibold text-foreground">Custom (On request)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>USDT → INR directly to your bank</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Transparent rates & fees</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Same-day settlement available</span>
                  </div>
                </div>

                <Button className="w-full bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-700 hover:to-blue-700 text-white py-6 text-lg">
                  Request Bulk Sell Quote
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
                    {step.number}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Enterprise Section */}
        <Card className="mb-16 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/10 dark:to-blue-950/10 border-purple-200 dark:border-purple-800">
          <CardContent className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Building2 className="h-8 w-8 text-purple-600" />
                  <h2 className="text-2xl font-bold text-foreground">For Enterprises & Institutions</h2>
                </div>
                <p className="text-muted-foreground mb-6">
                  We provide comprehensive trading solutions tailored for institutional needs with enhanced features and dedicated support.
                </p>
                
                <div className="space-y-3 mb-6">
                  {enterpriseFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center lg:text-right">
                <div className="bg-white/80 dark:bg-background/80 p-6 rounded-xl">
                  <h3 className="text-xl font-semibold text-foreground mb-4">Ready to get started?</h3>
                  <div className="space-y-4">
                    <Button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                      <Mail className="h-4 w-4 mr-2" />
                      Contact Sales Team
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      📞 Call: +91-XXXXXXXXXX<br />
                      📧 Email: support@blynkvirtual.com
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Section */}
        <Card className="shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Need a Custom Solution?</h2>
            <p className="text-primary-foreground/90 mb-6 max-w-2xl mx-auto">
              Our team is ready to discuss your specific requirements and provide a tailored trading solution for your organization.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="secondary" size="lg" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Schedule a Call
              </Button>
              <Button variant="secondary" size="lg" className="flex items-center gap-2 bg-white text-primary hover:bg-white/90">
                <Mail className="h-4 w-4" />
                Send Inquiry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}