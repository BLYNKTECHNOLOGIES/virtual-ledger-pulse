import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LiveChat } from '../LiveChat';
import { 
  Search, 
  User, 
  CreditCard, 
  ArrowRightLeft, 
  Shield, 
  BarChart3, 
  Users,
  Mail,
  MessageCircle,
  Phone,
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
  HelpCircle
} from 'lucide-react';

export function HelpCentrePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);

  const categories = [
    {
      icon: User,
      title: 'Account & KYC',
      description: 'How to sign up, complete KYC, manage your profile.',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-950/20'
    },
    {
      icon: CreditCard,
      title: 'Payments & Bank Transfers',
      description: 'Adding INR, UPI/IMPS/NEFT, failed transactions.',
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-950/20'
    },
    {
      icon: ArrowRightLeft,
      title: 'Buying & Selling Crypto',
      description: 'Step-by-step guides to buy/sell USDT, BTC, ETH.',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-950/20'
    },
    {
      icon: Shield,
      title: 'Security & Compliance',
      description: 'AML/KYC rules, avoiding fraud, reporting issues.',
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-950/20'
    },
    {
      icon: BarChart3,
      title: 'Analytics & Reports',
      description: 'Transaction history, P&L, tax reports.',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-950/20'
    },
    {
      icon: Users,
      title: 'For Employees (Internal)',
      description: 'Interviews, payroll, CRM usage guides.',
      color: 'text-teal-600',
      bgColor: 'bg-teal-100 dark:bg-teal-950/20',
      internal: true
    }
  ];

  const popularArticles = [
    {
      title: 'How do I buy USDT with INR?',
      views: '1.2K views',
      category: 'Buying & Selling'
    },
    {
      title: 'Why was my KYC rejected?',
      views: '892 views',
      category: 'Account & KYC'
    },
    {
      title: 'How do I withdraw INR to my bank?',
      views: '756 views',
      category: 'Payments'
    },
    {
      title: 'Can I use a third-party payment account?',
      views: '643 views',
      category: 'Payments'
    },
    {
      title: 'What are crypto tax rules in India?',
      views: '589 views',
      category: 'Compliance'
    },
    {
      title: 'How to complete Video KYC verification?',
      views: '512 views',
      category: 'Account & KYC'
    },
    {
      title: 'Transaction failed but money debited - what to do?',
      views: '445 views',
      category: 'Payments'
    }
  ];

  const supportOptions = [
    {
      icon: Mail,
      title: 'Email Support',
      description: 'Get help via email within 24 hours',
      contact: 'support@blynkvirtual.com',
      action: 'Send Email',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/10'
    },
    {
      icon: MessageCircle,
      title: 'Live Chat (24x7)',
      description: 'Chat with our support team instantly',
      contact: 'Available 24/7',
      action: 'Start Chat',
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/10'
    },
    {
      icon: Phone,
      title: 'Phone Support',
      description: 'Speak directly with our team',
      contact: '+91-XXXXXXXXXX',
      action: 'Call Now',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/10'
    },
    {
      icon: BookOpen,
      title: 'Knowledge Base',
      description: 'Browse our comprehensive guides',
      contact: '100+ articles',
      action: 'Browse Articles',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/10'
    }
  ];

  const footerLinks = [
    { title: 'Terms & Conditions', icon: FileText },
    { title: 'Privacy Policy', icon: Lock },
    { title: 'Compliance', icon: Shield },
    { title: 'Contact Support', icon: HelpCircle }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Welcome to the Help Centre
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Find answers to common questions, learn how to use our platform, or reach out to our support team 24x7.
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-lg rounded-full border-2 shadow-lg"
            />
            <Button className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-full">
              Search
            </Button>
          </div>
        </div>

        {/* Quick Categories */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">How can we help you?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 cursor-pointer group">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 ${category.bgColor} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <category.icon className={`h-6 w-6 ${category.color}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {category.title}
                    {category.internal && (
                      <Badge variant="secondary" className="ml-2 text-xs">Internal</Badge>
                    )}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {category.description}
                  </p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-4 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Articles */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-foreground">Popular Articles</h2>
            <Button variant="outline" className="flex items-center gap-2">
              View All
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {popularArticles.map((article, index) => (
              <Card key={index} className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-2 hover:text-primary transition-colors">
                        {article.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {article.category}
                        </Badge>
                        <span>{article.views}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-4 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Support Options */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">Still need help?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {supportOptions.map((option, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 text-center">
                <CardContent className="p-6">
                  <div className={`w-16 h-16 ${option.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <option.icon className={`h-8 w-8 ${option.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {option.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    {option.description}
                  </p>
                  <p className="text-sm font-medium text-foreground mb-4">
                    {option.contact}
                  </p>
                  <Button 
                    className="w-full" 
                    variant={index === 1 ? 'default' : 'outline'}
                    onClick={index === 1 ? () => setIsChatOpen(true) : undefined}
                  >
                    {option.action}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Emergency Contact */}
        <Card className="mb-16 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/10 dark:to-pink-950/10 border-red-200 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">
              Urgent Security Issue?
            </h3>
            <p className="text-muted-foreground mb-4">
              If you suspect unauthorized access to your account or need immediate help with a security concern.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="destructive" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Emergency Hotline
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                security@blynkvirtual.com
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="border-t pt-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {footerLinks.map((link, index) => (
              <Button key={index} variant="ghost" className="flex items-center gap-2 justify-start">
                <link.icon className="h-4 w-4" />
                {link.title}
              </Button>
            ))}
          </div>
          
          <div className="text-center mt-8 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              © 2024 Blynk Virtual Technologies Pvt. Ltd. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Live Chat Component */}
      <LiveChat 
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
}