import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RMApplicationForm } from '../RMApplicationForm';
import { 
  UserCheck2, 
  HeadphonesIcon, 
  TrendingUp, 
  Shield, 
  Clock, 
  Eye,
  Building2,
  Users,
  Crown,
  Zap,
  CheckCircle,
  ArrowRight,
  Phone,
  MessageCircle,
  Mail,
  BarChart3,
  Star,
  Target,
  FileCheck,
  AlertTriangle
} from 'lucide-react';

export function RelationshipManagerPage() {
  const [isApplicationOpen, setIsApplicationOpen] = useState(false);
  const benefits = [
    {
      icon: UserCheck2,
      title: 'Personalized Support',
      description: 'Get tailored guidance for your trading needs, from P2P transactions to corporate settlements.'
    },
    {
      icon: Zap,
      title: 'Priority Assistance',
      description: 'No waiting. Direct communication with your RM ensures faster resolutions.'
    },
    {
      icon: BarChart3,
      title: 'Market Insights',
      description: 'Stay ahead with curated market updates, analytics, and opportunity alerts.'
    },
    {
      icon: FileCheck,
      title: 'Compliance Guidance',
      description: 'Smooth KYC/AML processes with hands-on support for both individuals and corporates.'
    },
    {
      icon: Clock,
      title: '24x7 Accessibility',
      description: 'Reach your RM anytime via phone, WhatsApp, or email for urgent needs.'
    },
    {
      icon: Shield,
      title: 'Confidential & Secure',
      description: 'Your privacy and data security are our highest priority.'
    }
  ];

  const clientTypes = [
    {
      icon: TrendingUp,
      title: 'High-volume Traders',
      description: 'Seamless handling of bulk buy/sell operations',
      color: 'bg-green-50 border-green-200 dark:bg-green-950/10 dark:border-green-800'
    },
    {
      icon: Building2,
      title: 'Corporate Clients',
      description: 'Dedicated support for settlements, employee payouts, and compliance',
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-800'
    },
    {
      icon: Crown,
      title: 'HNWIs (High Net-Worth Individuals)',
      description: 'Personalized strategies for managing crypto wealth',
      color: 'bg-purple-50 border-purple-200 dark:bg-purple-950/10 dark:border-purple-800'
    }
  ];

  const exclusiveBenefits = [
    'Faster Transaction Approvals',
    'Customized Pricing Tiers',
    'Early Access to New Features',
    'End-to-End Assistance for Disputes & Appeals',
    'Dedicated Line for Settlement Support'
  ];

  const steps = [
    {
      number: '1',
      title: 'Apply Now',
      description: 'Submit a simple request form'
    },
    {
      number: '2',
      title: 'Assessment',
      description: 'Our team reviews your trading profile'
    },
    {
      number: '3',
      title: 'Onboarding',
      description: 'Get matched with your personal Relationship Manager'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 text-sm bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            🌐 Premium Service
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Dedicated Relationship Manager
          </h1>
          <p className="text-2xl text-primary font-medium mb-4">
            Your Personal Gateway to Seamless Crypto Trading
          </p>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            At Blynk Virtual Technologies Pvt. Ltd., we believe every premium client deserves personalized attention. 
            With a Dedicated Relationship Manager (RM), you get a single point of contact who understands your business, 
            trading preferences, and financial goals.
          </p>
        </div>

        {/* Why Choose Section */}
        <div className="mb-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              ✨ Why Choose a Dedicated Relationship Manager?
            </h2>
          </div>
          
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

        {/* Who Can Benefit Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            👔 Who Can Benefit?
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {clientTypes.map((type, index) => (
              <Card key={index} className={`hover:shadow-lg transition-shadow ${type.color}`}>
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center mx-auto mb-4">
                    <type.icon className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground">
                    {type.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-center text-muted-foreground">{type.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Exclusive Benefits Section */}
        <Card className="mb-16 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Star className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-foreground mb-4">
                🌟 Exclusive Benefits
              </h2>
              <p className="text-muted-foreground">
                Experience premium advantages with your dedicated relationship manager
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {exclusiveBenefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3 p-4 bg-background/80 rounded-lg">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                  <span className="font-medium text-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How to Get Started Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
            🚀 How to Get Started
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">
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

        {/* Contact Methods */}
        <Card className="mb-16 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/10 dark:to-purple-950/10 border-blue-200 dark:border-blue-800">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <HeadphonesIcon className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Multiple Ways to Connect
              </h3>
              <p className="text-muted-foreground">
                Your dedicated RM is available through your preferred communication channel
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Phone className="h-6 w-6 text-green-600" />
                </div>
                <p className="font-medium text-foreground">Phone Support</p>
                <p className="text-sm text-muted-foreground">Direct calling line</p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <MessageCircle className="h-6 w-6 text-green-600" />
                </div>
                <p className="font-medium text-foreground">WhatsApp</p>
                <p className="text-sm text-muted-foreground">Instant messaging</p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <p className="font-medium text-foreground">Email Support</p>
                <p className="text-sm text-muted-foreground">Detailed assistance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <Card className="shadow-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-8 text-center">
            <Target className="h-16 w-16 mx-auto mb-6 text-primary-foreground" />
            <h2 className="text-3xl font-bold mb-4">Ready to Experience Premium Support?</h2>
            <p className="text-primary-foreground/90 mb-8 max-w-2xl mx-auto text-lg">
              ⚡ Experience premium support tailored to your trading journey. With a Dedicated RM, every trade feels effortless.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90 px-8 py-4 text-lg font-semibold rounded-xl shadow-lg"
                onClick={() => setIsApplicationOpen(true)}
              >
                <UserCheck2 className="h-5 w-5 mr-2" />
                Apply for a Relationship Manager
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
            
            <div className="mt-6 text-sm text-primary-foreground/80">
              <p>📧 Email: support@blynkvirtual.com</p>
              <p>📞 Phone: +91-XXXXXXXXXX</p>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-800 dark:text-amber-200">
              Relationship Manager services are subject to eligibility criteria and approval
            </span>
          </div>
        </div>
      </div>
      
      {/* RM Application Form Modal */}
      <RMApplicationForm 
        isOpen={isApplicationOpen}
        onClose={() => setIsApplicationOpen(false)}
      />
    </div>
  );
}