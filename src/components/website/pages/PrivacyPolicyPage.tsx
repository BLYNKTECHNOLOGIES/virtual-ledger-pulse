import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, 
  Lock, 
  Eye, 
  Users, 
  Database, 
  Globe, 
  Phone, 
  Mail, 
  MapPin, 
  AlertTriangle, 
  FileText, 
  Clock, 
  Brain, 
  CreditCard, 
  UserCheck,
  CheckCircle,
  Info,
  ArrowRight,
  Home,
  Download
} from 'lucide-react';

export function PrivacyPolicyPage() {
  const navigate = useNavigate();

  const sections = [
    { id: 'introduction', title: 'Introduction', icon: FileText },
    { id: 'data-collection', title: 'Data We Collect', icon: Database },
    { id: 'data-usage', title: 'How We Use Data', icon: Eye },
    { id: 'data-sharing', title: 'Data Sharing', icon: Users },
    { id: 'security', title: 'Data Security', icon: Shield },
    { id: 'user-rights', title: 'Your Rights', icon: UserCheck },
    { id: 'cookies', title: 'Cookies & Tracking', icon: Globe },
    { id: 'contact', title: 'Contact Us', icon: Mail }
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Shield className="w-4 h-4 mr-2" />
            Privacy & Data Protection
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Privacy Policy
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Your privacy is our priority. Learn how we collect, use, and protect your data 
            while providing secure cryptocurrency trading services.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mb-8">
            <Badge variant="outline" className="gap-2">
              <Clock className="w-4 h-4" />
              Last Updated: August 23, 2025
            </Badge>
            <Badge variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Version 2.0
            </Badge>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Button>
            <Button 
              variant="outline"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex gap-12">
          {/* Navigation Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-8">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  Table of Contents
                </h3>
                <nav className="space-y-2">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className="w-full flex items-center gap-3 text-left text-muted-foreground hover:text-foreground p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <Icon className="w-4 h-4 text-primary group-hover:text-primary" />
                        <span className="text-sm">{section.title}</span>
                        <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-8 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-1">
                        Quick Summary
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        We protect your data with bank-level security, only collect what's necessary, 
                        and give you full control over your information.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-16">
            {/* Introduction */}
            <section id="introduction">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Introduction</h2>
                    <p className="text-muted-foreground">Welcome to Blynk's Privacy Policy</p>
                  </div>
                </div>

                <div className="space-y-6 text-muted-foreground leading-relaxed">
                  <p className="text-lg">
                    Blynk Virtual Technologies Private Limited ("Blynk," "we," "us," or "our") is committed 
                    to protecting your privacy and ensuring the security of your personal data. This Privacy 
                    Policy explains how we collect, use, process, and protect your information when you use 
                    our cryptocurrency trading platform and related services.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Our Commitment to You
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">DPDP Act 2023 Compliant</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">Bank-Level Security</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">Transparent Practices</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">User Control</span>
                      </div>
                    </div>
                  </div>

                  <p>
                    As a Virtual Asset Service Provider (VASP) registered in India, we comply with all 
                    applicable data protection laws including the Digital Personal Data Protection Act 2023, 
                    Prevention of Money Laundering Act 2002, and FIU-IND guidelines.
                  </p>
                </div>
              </Card>
            </section>

            {/* Data Collection */}
            <section id="data-collection">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Database className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Data We Collect</h2>
                    <p className="text-muted-foreground">Information we gather to provide our services</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-blue-500">
                      <div className="flex items-center gap-3 mb-4">
                        <UserCheck className="w-6 h-6 text-blue-500" />
                        <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Full name and contact details</li>
                        <li>• Government-issued ID documents</li>
                        <li>• Date of birth and address</li>
                        <li>• PAN and Aadhaar information</li>
                        <li>• Bank account details</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-green-500">
                      <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="w-6 h-6 text-green-500" />
                        <h3 className="text-lg font-semibold text-foreground">Financial Data</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Transaction history</li>
                        <li>• Payment method information</li>
                        <li>• Trading patterns and volumes</li>
                        <li>• Cryptocurrency wallet addresses</li>
                        <li>• Risk assessment data</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-purple-500">
                      <div className="flex items-center gap-3 mb-4">
                        <Globe className="w-6 h-6 text-purple-500" />
                        <h3 className="text-lg font-semibold text-foreground">Technical Data</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• IP address and device information</li>
                        <li>• Browser and operating system</li>
                        <li>• Login and activity logs</li>
                        <li>• Cookies and tracking data</li>
                        <li>• Geolocation data</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-orange-500">
                      <div className="flex items-center gap-3 mb-4">
                        <Eye className="w-6 h-6 text-orange-500" />
                        <h3 className="text-lg font-semibold text-foreground">Usage Data</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Platform interaction patterns</li>
                        <li>• Feature usage statistics</li>
                        <li>• Support interactions</li>
                        <li>• Marketing engagement</li>
                        <li>• Preferences and settings</li>
                      </ul>
                    </Card>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          KYC Compliance Notice
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          As per RBI and FIU-IND guidelines, we are required to collect and verify your 
                          identity information before you can use our trading services. This helps us 
                          prevent fraud and comply with anti-money laundering regulations.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Data Usage */}
            <section id="data-usage">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">How We Use Your Data</h2>
                    <p className="text-muted-foreground">The purposes for which we process your information</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                      <UserCheck className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Identity Verification</h3>
                    <p className="text-sm text-muted-foreground">
                      Verify your identity as required by KYC regulations and prevent unauthorized access.
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                      <CreditCard className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Transaction Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Execute your trades, process payments, and maintain transaction records.
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                      <Shield className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Fraud Prevention</h3>
                    <p className="text-sm text-muted-foreground">
                      Detect and prevent fraudulent activities, money laundering, and security threats.
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
                      <Brain className="w-6 h-6 text-orange-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Platform Improvement</h3>
                    <p className="text-sm text-muted-foreground">
                      Analyze usage patterns to enhance our services and user experience.
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-6 h-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Regulatory Compliance</h3>
                    <p className="text-sm text-muted-foreground">
                      Report to regulatory authorities as required by law and maintain compliance records.
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-6 h-6 text-teal-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Communication</h3>
                    <p className="text-sm text-muted-foreground">
                      Send important updates, security alerts, and respond to your support requests.
                    </p>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Data Sharing */}
            <section id="data-sharing">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Data Sharing</h2>
                    <p className="text-muted-foreground">When and how we share your information</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    We do not sell, rent, or trade your personal information. We only share your data 
                    in specific circumstances as outlined below:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-950/20">
                      <h3 className="text-lg font-semibold text-foreground mb-3">✓ When We Share</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• With regulatory authorities (FIU-IND, IT Department)</li>
                        <li>• With payment processors for transactions</li>
                        <li>• With identity verification services</li>
                        <li>• During legal proceedings or court orders</li>
                        <li>• With your explicit consent</li>
                      </ul>
                    </div>

                    <div className="p-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                      <h3 className="text-lg font-semibold text-foreground mb-3">✗ When We Don't Share</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• For marketing purposes without consent</li>
                        <li>• With unauthorized third parties</li>
                        <li>• For commercial exploitation</li>
                        <li>• Outside of legal requirements</li>
                        <li>• Without appropriate safeguards</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Security */}
            <section id="security">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Data Security</h2>
                    <p className="text-muted-foreground">How we protect your information</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    We implement industry-leading security measures to protect your personal data 
                    from unauthorized access, use, or disclosure.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Encryption</h3>
                      <p className="text-sm text-muted-foreground">
                        End-to-end encryption for all data transmission and storage using AES-256.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <UserCheck className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Access Control</h3>
                      <p className="text-sm text-muted-foreground">
                        Multi-factor authentication and role-based access to your account.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <Eye className="w-8 h-8 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Monitoring</h3>
                      <p className="text-sm text-muted-foreground">
                        24/7 security monitoring and threat detection systems.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* User Rights */}
            <section id="user-rights">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Your Rights</h2>
                    <p className="text-muted-foreground">Control over your personal data</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    Under the Digital Personal Data Protection Act 2023, you have several rights 
                    regarding your personal data:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Access</h3>
                          <p className="text-sm text-muted-foreground">
                            Request a copy of your personal data we hold.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Correction</h3>
                          <p className="text-sm text-muted-foreground">
                            Request correction of inaccurate personal data.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Erasure</h3>
                          <p className="text-sm text-muted-foreground">
                            Request deletion of your personal data (subject to legal requirements).
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Portability</h3>
                          <p className="text-sm text-muted-foreground">
                            Request transfer of your data to another service provider.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Withdraw Consent</h3>
                          <p className="text-sm text-muted-foreground">
                            Withdraw consent for optional data processing activities.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                        <div>
                          <h3 className="font-semibold text-foreground">Right to Grievance Redressal</h3>
                          <p className="text-sm text-muted-foreground">
                            Lodge complaints with our Data Protection Officer or authorities.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Card className="p-6 bg-primary/5 border-primary/20">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      How to Exercise Your Rights
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      To exercise any of these rights, please contact our Data Protection Officer 
                      using the contact information below. We will respond to your request within 
                      30 days as required by law.
                    </p>
                    <Button 
                      onClick={() => navigate('/website/whatsapp-support')}
                      className="gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Contact DPO
                    </Button>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Cookies */}
            <section id="cookies">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Globe className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Cookies & Tracking</h2>
                    <p className="text-muted-foreground">How we use cookies and similar technologies</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    We use cookies and similar tracking technologies to improve your experience, 
                    analyze usage patterns, and provide personalized services.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 border-l-4 border-l-green-500">
                      <h3 className="text-lg font-semibold text-foreground mb-3">Essential Cookies</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Required for basic platform functionality and security.
                      </p>
                      <Badge variant="secondary">Always Active</Badge>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-blue-500">
                      <h3 className="text-lg font-semibold text-foreground mb-3">Analytics Cookies</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Help us understand how you use our platform to improve services.
                      </p>
                      <Badge variant="outline">Optional</Badge>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-purple-500">
                      <h3 className="text-lg font-semibold text-foreground mb-3">Marketing Cookies</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Used to deliver personalized content and advertisements.
                      </p>
                      <Badge variant="outline">Optional</Badge>
                    </Card>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Manage Your Cookie Preferences
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      You can control cookie settings through your browser or our cookie preference center.
                    </p>
                    <Button variant="outline" size="sm">
                      Cookie Settings
                    </Button>
                  </div>
                </div>
              </Card>
            </section>

            {/* Contact */}
            <section id="contact">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Contact Us</h2>
                    <p className="text-muted-foreground">Get in touch about privacy concerns</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Data Protection Officer</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      For privacy-related inquiries and data rights requests.
                    </p>
                    <p className="text-sm font-medium text-foreground">privacy@blynkvirtual.com</p>
                  </Card>

                  <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                      <Phone className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Support Team</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      24/7 support for general inquiries and assistance.
                    </p>
                    <p className="text-sm font-medium text-foreground">+91-XXXXXXXXXX</p>
                  </Card>

                  <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-6 h-6 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Registered Office</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Our official business address for legal correspondence.
                    </p>
                    <p className="text-sm font-medium text-foreground">Bhopal, Madhya Pradesh, India</p>
                  </Card>
                </div>

                <div className="mt-8 p-6 bg-muted/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Response Time Commitment
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div>
                      <strong>Privacy Inquiries:</strong> Within 48 hours
                    </div>
                    <div>
                      <strong>Data Rights Requests:</strong> Within 30 days
                    </div>
                    <div>
                      <strong>Security Incidents:</strong> Immediate acknowledgment
                    </div>
                    <div>
                      <strong>General Support:</strong> Within 24 hours
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Footer CTA */}
            <section className="text-center">
              <Card className="p-8 bg-gradient-to-r from-primary/5 to-secondary/5">
                <h2 className="text-2xl font-bold text-foreground mb-4">
                  Questions About Our Privacy Policy?
                </h2>
                <p className="text-muted-foreground mb-6">
                  We're here to help you understand how we protect your data and respect your privacy.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Button 
                    onClick={() => navigate('/website/whatsapp-support')}
                    className="gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    Contact Support
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => navigate('/website/help')}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Help Center
                  </Button>
                </div>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}