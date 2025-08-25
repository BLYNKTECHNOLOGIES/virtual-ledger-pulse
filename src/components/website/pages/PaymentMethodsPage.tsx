import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Smartphone, 
  Building2, 
  Wallet, 
  Shield, 
  Zap, 
  FileText, 
  CheckCircle, 
  ArrowRight,
  Clock,
  AlertTriangle,
  Star,
  Users,
  Globe,
  TrendingUp,
  Lock,
  Receipt,
  Banknote,
  QrCode
} from 'lucide-react';

export function PaymentMethodsPage() {
  const paymentMethods = [
    {
      id: 1,
      icon: Smartphone,
      title: 'UPI (Unified Payments Interface)',
      subtitle: 'Instant Digital Payments',
      features: [
        'Instant payments via leading apps (GPay, PhonePe, Paytm, BHIM, etc.)',
        '24/7 availability',
        'No extra charges',
        'Real-time transaction confirmations'
      ],
      apps: ['💳 Google Pay', '📱 PhonePe', '💰 Paytm', '🏛️ BHIM', '🔵 Cred'],
      color: 'bg-green-50 border-green-200 dark:bg-green-950/10 dark:border-green-800',
      iconColor: 'text-green-600'
    },
    {
      id: 2,
      icon: Building2,
      title: 'Bank Transfers (IMPS / NEFT / RTGS)',
      subtitle: 'Traditional Banking Solutions',
      features: [
        'Direct to your linked bank account',
        'Suitable for larger volumes',
        'Same-day settlements (subject to bank timings)',
        'Full transaction traceability'
      ],
      apps: ['⚡ IMPS (Instant)', '🏦 NEFT (Same Day)', '💎 RTGS (High Value)', '📋 Bank Statement'],
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-800',
      iconColor: 'text-blue-600'
    },
    {
      id: 3,
      icon: Building2,
      title: 'Current Account Transfers',
      subtitle: 'Corporate & High-Volume Solutions',
      features: [
        'For corporates & high-volume traders',
        'Direct settlement via Vertex Shift Solutions (Blynk Group) current account',
        'High liquidity support with transparent invoicing',
        'Dedicated relationship manager support'
      ],
      apps: ['🏢 Corporate Account', '📊 High Volume', '📜 GST Invoice', '👤 Dedicated RM'],
      color: 'bg-purple-50 border-purple-200 dark:bg-purple-950/10 dark:border-purple-800',
      iconColor: 'text-purple-600'
    },
    {
      id: 4,
      icon: Wallet,
      title: 'Wallet-to-Wallet Settlements',
      subtitle: 'For Selected Institutional Partners',
      features: [
        'Direct crypto settlements',
        'Available only for verified institutional partners',
        'Blockchain-verified transactions',
        'Enterprise-grade security protocols'
      ],
      apps: ['🔐 Verified Partners', '⚡ Direct Crypto', '🔗 Blockchain', '🛡️ Enterprise Security'],
      color: 'bg-orange-50 border-orange-200 dark:bg-orange-950/10 dark:border-orange-800',
      iconColor: 'text-orange-600'
    }
  ];

  const benefits = [
    {
      icon: Shield,
      title: 'Secure Transactions',
      description: 'Fully verified accounts & AML checks'
    },
    {
      icon: Zap,
      title: 'Instant Processing',
      description: 'UPI & IMPS for real-time trades'
    },
    {
      icon: Building2,
      title: 'Bulk Support',
      description: 'Bank & Current Account solutions for corporates'
    },
    {
      icon: Receipt,
      title: 'Transparent Records',
      description: 'Every trade documented with receipts'
    }
  ];

  const importantNotes = [
    {
      icon: CheckCircle,
      title: 'KYC Verification Required',
      description: 'Payments accepted only from KYC-verified accounts'
    },
    {
      icon: AlertTriangle,
      title: 'No Third-Party Payments',
      description: 'Third-party payments are strictly prohibited'
    },
    {
      icon: Users,
      title: 'Name Matching Required',
      description: 'Ensure your registered name matches your bank / UPI ID'
    },
    {
      icon: FileText,
      title: 'GST Invoices Available',
      description: 'For corporate accounts, GST invoices are provided on request'
    }
  ];

  const stats = [
    { icon: TrendingUp, value: '₹5Cr+', label: 'Monthly Processed' },
    { icon: Clock, value: '<30 min', label: 'Avg Processing Time' },
    { icon: Star, value: '99.9%', label: 'Success Rate' },
    { icon: Users, value: '15,000+', label: 'Active Users' }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 text-sm bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            💳 Multiple Payment Options
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Payment Methods
          </h1>
          <p className="text-2xl text-primary font-medium mb-4">
            Fast. Secure. Convenient.
          </p>
          <p className="text-lg text-muted-foreground max-w-5xl mx-auto leading-relaxed">
            At Blynk Virtual Technologies Pvt. Ltd., we make trading crypto seamless with multiple payment options 
            designed to suit both retail traders and corporate clients. Every method is compliance-checked, verified, 
            and secure for smooth transactions.
          </p>
        </div>

        {/* Payment Methods Grid */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            ✅ Supported Payment Methods
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {paymentMethods.map((method) => (
              <Card key={method.id} className={`hover:shadow-lg transition-all duration-300 ${method.color}`}>
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-background rounded-xl flex items-center justify-center shadow-sm">
                      <method.icon className={`h-8 w-8 ${method.iconColor}`} />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-foreground">{method.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">{method.subtitle}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {method.features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="pt-4 border-t border-border/50">
                      <div className="flex flex-wrap gap-2">
                        {method.apps.map((app, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {app}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Why Pay with Blynk */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            ⚡ Why Pay with Blynk?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow text-center">
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

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {stats.map((stat, index) => (
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

        {/* Important Notes */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            📌 Important Notes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {importantNotes.map((note, index) => (
              <Card key={index} className="bg-amber-50 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <note.icon className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">{note.title}</h3>
                      <p className="text-sm text-muted-foreground">{note.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Payment Process Flow */}
        <Card className="mb-16 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <QrCode className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-foreground mb-4">
                How Payment Processing Works
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { step: '1', title: 'Select Payment Method', desc: 'Choose your preferred option' },
                { step: '2', title: 'Verify Account Details', desc: 'KYC & name matching check' },
                { step: '3', title: 'Process Payment', desc: 'Secure transaction execution' },
                { step: '4', title: 'Receive Confirmation', desc: 'Instant receipt & crypto credit' }
              ].map((step, index) => (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">
                    {step.step}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Security Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/10 dark:to-emerald-950/10 border-green-200 dark:border-green-800">
            <CardContent className="p-8">
              <Lock className="h-12 w-12 text-green-600 mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-4">Advanced Security</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>256-bit SSL encryption</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Multi-factor authentication</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Real-time fraud monitoring</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Regulatory compliance</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/10 dark:to-indigo-950/10 border-blue-200 dark:border-blue-800">
            <CardContent className="p-8">
              <Globe className="h-12 w-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-4">24/7 Support</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span>WhatsApp support available</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span>Payment issue resolution</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span>Transaction status tracking</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span>Dedicated relationship managers</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Final CTA */}
        <Card className="shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-8 text-center">
            <CreditCard className="h-16 w-16 mx-auto mb-6 text-primary-foreground" />
            <h2 className="text-3xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="text-primary-foreground/90 mb-8 max-w-2xl mx-auto text-lg">
              ⚡ Multiple payment methods. One trusted partner – Blynk.
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
                <span>Instant Processing</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>KYC Verified</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground mb-4">
            Have questions about payment methods?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="outline" size="sm">
              💬 WhatsApp Support
            </Button>
            <Button variant="outline" size="sm">
              📧 support@blynkvirtual.com
            </Button>
            <Button variant="outline" size="sm">
              📞 Payment Helpline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}