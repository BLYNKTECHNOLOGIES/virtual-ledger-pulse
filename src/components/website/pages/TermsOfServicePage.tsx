import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Scale, 
  Shield, 
  Users, 
  CreditCard, 
  AlertTriangle, 
  Lock, 
  Globe, 
  Phone, 
  Mail, 
  MapPin, 
  CheckCircle,
  Info,
  ArrowRight,
  Home,
  Download,
  Clock,
  Gavel,
  UserCheck,
  Ban,
  DollarSign,
  Eye
} from 'lucide-react';

export function TermsOfServicePage() {
  const navigate = useNavigate();

  const sections = [
    { id: 'introduction', title: 'Introduction', icon: FileText },
    { id: 'definitions', title: 'Definitions', icon: Info },
    { id: 'acceptance', title: 'Acceptance of Terms', icon: CheckCircle },
    { id: 'services', title: 'Our Services', icon: CreditCard },
    { id: 'user-obligations', title: 'User Obligations', icon: UserCheck },
    { id: 'kyc-compliance', title: 'KYC & Compliance', icon: Shield },
    { id: 'prohibited-activities', title: 'Prohibited Activities', icon: Ban },
    { id: 'fees-payments', title: 'Fees & Payments', icon: DollarSign },
    { id: 'privacy-data', title: 'Privacy & Data', icon: Lock },
    { id: 'limitation-liability', title: 'Limitation of Liability', icon: Scale },
    { id: 'dispute-resolution', title: 'Dispute Resolution', icon: Gavel },
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
            <Scale className="w-4 h-4 mr-2" />
            Legal Terms & Conditions
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Terms of Service
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            These terms govern your use of Blynk's cryptocurrency trading platform. 
            Please read carefully before using our services.
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
                        Important Notice
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        By using our platform, you agree to these terms. 
                        Contact us if you have any questions.
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
                    <p className="text-muted-foreground">Welcome to Blynk's Terms of Service</p>
                  </div>
                </div>

                <div className="space-y-6 text-muted-foreground leading-relaxed">
                  <p className="text-lg">
                    Welcome to Blynk Virtual Technologies Private Limited ("Blynk," "we," "us," or "our"). 
                    These Terms of Service ("Terms") constitute a legally binding agreement between you 
                    ("User," "you," or "your") and Blynk regarding your access to and use of our 
                    cryptocurrency trading platform, website, mobile applications, and related services 
                    (collectively, the "Services").
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Key Legal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">Registered under MCA, India</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">CIN: U62099MP2025PTC074915</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">PMLA 2002 Compliant</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">FIU-IND Guidelines</span>
                      </div>
                    </div>
                  </div>

                  <p>
                    As a Virtual Asset Service Provider (VASP) operating in India, we are committed to 
                    maintaining the highest standards of regulatory compliance, user protection, and 
                    service excellence. These Terms are designed to protect both your interests and ours 
                    while ensuring full compliance with applicable laws.
                  </p>
                </div>
              </Card>
            </section>

            {/* Definitions */}
            <section id="definitions">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Info className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Definitions</h2>
                    <p className="text-muted-foreground">Key terms used throughout these Terms</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-6 border-l-4 border-l-blue-500">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Platform Terms</h3>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div>
                        <strong className="text-foreground">Services:</strong> Our P2P cryptocurrency trading platform, 
                        website, mobile apps, and related services.
                      </div>
                      <div>
                        <strong className="text-foreground">Account:</strong> Your registered user account on our platform 
                        with verified identity and payment methods.
                      </div>
                      <div>
                        <strong className="text-foreground">Transaction:</strong> Any buy, sell, or transfer of cryptocurrency 
                        executed through our platform.
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 border-l-4 border-l-green-500">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Legal Terms</h3>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div>
                        <strong className="text-foreground">VASP:</strong> Virtual Asset Service Provider as defined 
                        under Indian and international regulations.
                      </div>
                      <div>
                        <strong className="text-foreground">KYC:</strong> Know Your Customer procedures mandated 
                        under Indian law for identity verification.
                      </div>
                      <div>
                        <strong className="text-foreground">AML:</strong> Anti-Money Laundering measures required 
                        under PMLA 2002 and FIU-IND guidelines.
                      </div>
                    </div>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Acceptance of Terms */}
            <section id="acceptance">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Acceptance of Terms</h2>
                    <p className="text-muted-foreground">How these Terms become binding</p>
                  </div>
                </div>

                <div className="space-y-6 text-muted-foreground leading-relaxed">
                  <p className="text-lg">
                    By accessing or using our Services, you acknowledge that you have read, understood, 
                    and agree to be bound by these Terms and our Privacy Policy.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <UserCheck className="w-8 h-8 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Eligibility</h3>
                      <p className="text-sm text-muted-foreground">
                        You must be 18+ years old and legally capable of entering into contracts.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Compliance</h3>
                      <p className="text-sm text-muted-foreground">
                        You must comply with all applicable laws in your jurisdiction.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Agreement</h3>
                      <p className="text-sm text-muted-foreground">
                        Using our Services constitutes acceptance of these Terms.
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Important Notice
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          If you do not agree to these Terms, you must not access or use our Services. 
                          We reserve the right to modify these Terms at any time with appropriate notice.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Our Services */}
            <section id="services">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Our Services</h2>
                    <p className="text-muted-foreground">What we offer through our platform</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-6 border-l-4 border-l-blue-500">
                    <div className="flex items-center gap-3 mb-4">
                      <CreditCard className="w-6 h-6 text-blue-500" />
                      <h3 className="text-lg font-semibold text-foreground">P2P Trading</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• Peer-to-peer cryptocurrency trading</li>
                      <li>• Integration with major exchanges</li>
                      <li>• Secure escrow services</li>
                      <li>• Real-time market rates</li>
                      <li>• Multi-payment method support</li>
                    </ul>
                  </Card>

                  <Card className="p-6 border-l-4 border-l-green-500">
                    <div className="flex items-center gap-3 mb-4">
                      <Shield className="w-6 h-6 text-green-500" />
                      <h3 className="text-lg font-semibold text-foreground">Security & Compliance</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• KYC and identity verification</li>
                      <li>• AML monitoring and reporting</li>
                      <li>• Fraud detection systems</li>
                      <li>• Secure fund management</li>
                      <li>• Regulatory compliance</li>
                    </ul>
                  </Card>

                  <Card className="p-6 border-l-4 border-l-purple-500">
                    <div className="flex items-center gap-3 mb-4">
                      <Users className="w-6 h-6 text-purple-500" />
                      <h3 className="text-lg font-semibold text-foreground">Customer Support</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• 24/7 WhatsApp support</li>
                      <li>• Dedicated relationship managers</li>
                      <li>• Dispute resolution services</li>
                      <li>• Technical assistance</li>
                      <li>• Educational resources</li>
                    </ul>
                  </Card>

                  <Card className="p-6 border-l-4 border-l-orange-500">
                    <div className="flex items-center gap-3 mb-4">
                      <Globe className="w-6 h-6 text-orange-500" />
                      <h3 className="text-lg font-semibold text-foreground">Additional Services</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• Corporate trading solutions</li>
                      <li>• Bulk transaction processing</li>
                      <li>• API access for developers</li>
                      <li>• Advanced analytics tools</li>
                      <li>• Market insights and reports</li>
                    </ul>
                  </Card>
                </div>
              </Card>
            </section>

            {/* User Obligations */}
            <section id="user-obligations">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">User Obligations</h2>
                    <p className="text-muted-foreground">Your responsibilities when using our platform</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-950/20">
                      <h3 className="text-lg font-semibold text-foreground mb-3">✓ You Must</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Provide accurate and complete information</li>
                        <li>• Complete KYC verification as required</li>
                        <li>• Maintain account security and confidentiality</li>
                        <li>• Comply with all applicable laws</li>
                        <li>• Report suspicious activities</li>
                        <li>• Keep your contact information updated</li>
                        <li>• Use only your own verified payment methods</li>
                      </ul>
                    </div>

                    <div className="p-6 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
                      <h3 className="text-lg font-semibold text-foreground mb-3">✗ You Must Not</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Provide false or misleading information</li>
                        <li>• Share your account with others</li>
                        <li>• Engage in market manipulation</li>
                        <li>• Use our Services for illegal activities</li>
                        <li>• Circumvent our security measures</li>
                        <li>• Create multiple accounts</li>
                        <li>• Use third-party payment methods</li>
                      </ul>
                    </div>
                  </div>

                  <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Account Security Responsibilities
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      You are responsible for maintaining the security of your account and all activities 
                      that occur under your account. This includes using strong passwords, enabling 
                      two-factor authentication, and promptly notifying us of any unauthorized access.
                    </p>
                    <div className="flex items-center gap-3 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-muted-foreground">
                        We recommend using 2FA and regular password updates for enhanced security.
                      </span>
                    </div>
                  </Card>
                </div>
              </Card>
            </section>

            {/* KYC & Compliance */}
            <section id="kyc-compliance">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">KYC & Compliance</h2>
                    <p className="text-muted-foreground">Identity verification and regulatory requirements</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    As required by Indian law and international standards, all users must complete 
                    Know Your Customer (KYC) verification before accessing our Services.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Document Verification</h3>
                      <p className="text-sm text-muted-foreground">
                        Submit valid government-issued ID, address proof, and PAN card for verification.
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <Eye className="w-6 h-6 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Biometric Verification</h3>
                      <p className="text-sm text-muted-foreground">
                        Complete live selfie verification to confirm your identity and prevent fraud.
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Payment Verification</h3>
                      <p className="text-sm text-muted-foreground">
                        Link and verify your bank accounts and UPI IDs for secure transactions.
                      </p>
                    </Card>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Compliance Requirements
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          We are required by law to verify the identity of all users and monitor 
                          transactions for compliance with PMLA, FIU-IND guidelines, and other 
                          applicable regulations. Failure to complete KYC will result in account restrictions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Prohibited Activities */}
            <section id="prohibited-activities">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Ban className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Prohibited Activities</h2>
                    <p className="text-muted-foreground">Activities that are strictly forbidden</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-red-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Financial Crimes</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Money laundering or terrorist financing</li>
                        <li>• Tax evasion or avoidance</li>
                        <li>• Fraud or misrepresentation</li>
                        <li>• Market manipulation</li>
                        <li>• Insider trading</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-orange-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Platform Abuse</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Creating multiple accounts</li>
                        <li>• Circumventing security measures</li>
                        <li>• Automated trading without permission</li>
                        <li>• Exploiting system vulnerabilities</li>
                        <li>• Reverse engineering our platform</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-purple-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Legal Violations</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Violating applicable laws or regulations</li>
                        <li>• Engaging in illegal gambling</li>
                        <li>• Trading in prohibited jurisdictions</li>
                        <li>• Using proceeds from illegal activities</li>
                        <li>• Violating sanctions or embargoes</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-yellow-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Harmful Conduct</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Harassment or abuse of other users</li>
                        <li>• Spreading false information</li>
                        <li>• Impersonating others</li>
                        <li>• Interfering with platform operations</li>
                        <li>• Violating intellectual property rights</li>
                      </ul>
                    </Card>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-3">
                      <Ban className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Consequences of Violations
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Engaging in prohibited activities may result in account suspension, 
                          termination, forfeiture of funds, and reporting to law enforcement 
                          authorities. We have zero tolerance for illegal activities.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Fees & Payments */}
            <section id="fees-payments">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Fees & Payments</h2>
                    <p className="text-muted-foreground">Our fee structure and payment terms</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    We maintain transparent and competitive pricing for all our services. 
                    Fees may vary based on transaction volume, payment method, and user type.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="w-6 h-6 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Trading Fees</h3>
                      <p className="text-sm text-muted-foreground">
                        Competitive trading fees starting from 0.5% with volume-based discounts.
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <Globe className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Payment Processing</h3>
                      <p className="text-sm text-muted-foreground">
                        Standard payment processing fees as charged by banks and payment providers.
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <Users className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Premium Services</h3>
                      <p className="text-sm text-muted-foreground">
                        Additional fees for premium features like dedicated relationship managers.
                      </p>
                    </Card>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Fee Transparency
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      All applicable fees will be clearly displayed before you confirm any transaction. 
                      We do not charge hidden fees, and you can always review our current fee 
                      schedule in your account dashboard.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate('/website/fees')}
                    >
                      View Fee Schedule
                    </Button>
                  </div>
                </div>
              </Card>
            </section>

            {/* Privacy & Data */}
            <section id="privacy-data">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Privacy & Data Protection</h2>
                    <p className="text-muted-foreground">How we handle your personal information</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    Your privacy is paramount to us. We collect, use, and protect your data in accordance 
                    with our Privacy Policy and applicable data protection laws including the DPDP Act 2023.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-blue-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Data Collection</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• KYC and identity information</li>
                        <li>• Transaction and trading data</li>
                        <li>• Device and usage information</li>
                        <li>• Communication records</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-green-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Data Protection</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Bank-level encryption</li>
                        <li>• Secure data storage</li>
                        <li>• Regular security audits</li>
                        <li>• Limited access controls</li>
                      </ul>
                    </Card>
                  </div>

                  <Card className="p-6 bg-primary/5 border-primary/20">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Your Data Rights
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Under the DPDP Act 2023, you have rights to access, correct, and delete your 
                      personal data. You can also withdraw consent for certain data processing activities.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate('/website/privacy')}
                    >
                      Read Privacy Policy
                    </Button>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Limitation of Liability */}
            <section id="limitation-liability">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Scale className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Limitation of Liability</h2>
                    <p className="text-muted-foreground">Understanding our liability limitations</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    While we strive to provide secure and reliable services, cryptocurrency trading 
                    involves inherent risks. This section outlines the limitations of our liability.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-amber-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Market Risks</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Cryptocurrency price volatility</li>
                        <li>• Market manipulation by third parties</li>
                        <li>• Liquidity risks</li>
                        <li>• Regulatory changes</li>
                        <li>• Technical disruptions in blockchain networks</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-red-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Service Limitations</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Temporary service interruptions</li>
                        <li>• Third-party service dependencies</li>
                        <li>• Force majeure events</li>
                        <li>• Regulatory compliance requirements</li>
                        <li>• Security measures that may delay transactions</li>
                      </ul>
                    </Card>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Important Disclaimer
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          To the maximum extent permitted by law, Blynk shall not be liable for any 
                          indirect, incidental, special, consequential, or punitive damages, including 
                          but not limited to loss of profits, data, or business opportunities arising 
                          from your use of our Services.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Dispute Resolution */}
            <section id="dispute-resolution">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gavel className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">Dispute Resolution</h2>
                    <p className="text-muted-foreground">How we handle disputes and conflicts</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    We are committed to resolving disputes fairly and efficiently through a 
                    structured process that prioritizes communication and mutual understanding.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Step 1: Direct Contact</h3>
                      <p className="text-sm text-muted-foreground">
                        Contact our support team through WhatsApp, email, or phone for immediate assistance.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Step 2: Mediation</h3>
                      <p className="text-sm text-muted-foreground">
                        If direct resolution fails, we'll engage in good faith mediation to find a solution.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <Gavel className="w-8 h-8 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Step 3: Arbitration</h3>
                      <p className="text-sm text-muted-foreground">
                        Final disputes will be resolved through binding arbitration under Indian law.
                      </p>
                    </div>
                  </div>

                  <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Governing Law and Jurisdiction
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      These Terms are governed by the laws of India. Any disputes that cannot be 
                      resolved through our internal process will be subject to the exclusive 
                      jurisdiction of the courts in Bhopal, Madhya Pradesh, India.
                    </p>
                  </Card>
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
                    <p className="text-muted-foreground">Get in touch for legal and compliance matters</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Legal Team</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      For terms, compliance, and legal inquiries.
                    </p>
                    <p className="text-sm font-medium text-foreground">legal@blynkvirtual.com</p>
                  </Card>

                  <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                      <Phone className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Support Team</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      24/7 support for urgent matters and assistance.
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
              </Card>
            </section>

            {/* Footer CTA */}
            <section className="text-center">
              <Card className="p-8 bg-gradient-to-r from-primary/5 to-secondary/5">
                <h2 className="text-2xl font-bold text-foreground mb-4">
                  Have Questions About These Terms?
                </h2>
                <p className="text-muted-foreground mb-6">
                  Our legal and support teams are here to help you understand your rights and obligations.
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
                    onClick={() => navigate('/website/privacy')}
                    className="gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    Privacy Policy
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