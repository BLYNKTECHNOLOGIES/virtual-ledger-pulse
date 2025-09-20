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
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowRight,
  Home,
  Download,
  Scale,
  Search,
  UserCheck,
  Building,
  Flag,
  BookOpen,
  Gavel,
  Mail,
} from 'lucide-react';

export function AMLPolicyPage() {
  const navigate = useNavigate();

  const sections = [
    { id: 'purpose', title: 'Purpose & Objective', icon: FileText },
    { id: 'scope', title: 'Scope', icon: Eye },
    { id: 'regulatory', title: 'Regulatory Framework', icon: Scale },
    { id: 'kyc', title: 'KYC Policy', icon: UserCheck },
    { id: 'monitoring', title: 'Transaction Monitoring', icon: Search },
    { id: 'record-keeping', title: 'Record Keeping', icon: Database },
    { id: 'reporting', title: 'Reporting Obligations', icon: Flag },
    { id: 'compliance-officer', title: 'AML Compliance Officer', icon: Shield },
    { id: 'training', title: 'Employee Training', icon: BookOpen },
    { id: 'risk-management', title: 'Risk Management', icon: AlertTriangle },
    { id: 'prohibited', title: 'Prohibited Activities', icon: Lock },
    { id: 'audit', title: 'Independent Review', icon: Building },
    { id: 'policy-review', title: 'Policy Review', icon: Gavel }
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta Tags */}
      <title>Anti-Money Laundering (AML) Policy - Blynk Virtual Technologies</title>
      <meta name="description" content="Comprehensive AML policy of Blynk Virtual Technologies Pvt Ltd ensuring compliance with PMLA, RBI guidelines and international standards for cryptocurrency trading." />
      <meta name="keywords" content="AML policy, anti-money laundering, PMLA compliance, cryptocurrency regulations, KYC, suspicious transaction reporting" />

      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Shield className="w-4 h-4 mr-2" />
            Anti-Money Laundering Policy
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            AML Policy
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Comprehensive Anti-Money Laundering framework ensuring regulatory compliance 
            and financial system integrity for cryptocurrency operations.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mb-8">
            <Badge variant="outline" className="gap-2">
              <Clock className="w-4 h-4" />
              Last Updated: September 20, 2025
            </Badge>
            <Badge variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Version 1.0
            </Badge>
            <Badge variant="outline" className="gap-2">
              <Scale className="w-4 h-4" />
              PMLA Compliant
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
                        Key Highlights
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        PMLA 2002 compliant, risk-based KYC approach, continuous transaction 
                        monitoring, and strict reporting to FIU-IND.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-16">
            {/* Company Header */}
            <section className="text-center mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Blynk Virtual Technologies Pvt. Ltd.
              </h2>
              <p className="text-muted-foreground">
                Anti-Money Laundering (AML) Policy
              </p>
            </section>

            {/* Purpose & Objective */}
            <section id="purpose">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">1. Purpose & Objective</h2>
                    <p className="text-muted-foreground">Foundation of our AML framework</p>
                  </div>
                </div>

                <div className="space-y-6 text-muted-foreground leading-relaxed">
                  <p className="text-lg">
                    The purpose of this Anti-Money Laundering ("AML") Policy is to ensure that Blynk Virtual Technologies Pvt Ltd 
                    complies with applicable laws, rules, and regulations regarding the prevention of money laundering, 
                    terrorist financing, and other illicit financial activities.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      The company is committed to:
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Detecting and deterring suspicious activities</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Promoting a transparent and compliant financial ecosystem</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>Protecting the company, its customers, and the financial system from misuse</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Scope */}
            <section id="scope">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">2. Scope</h2>
                    <p className="text-muted-foreground">Coverage and applicability</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    This policy applies to:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 border-l-4 border-l-blue-500">
                      <div className="flex items-center gap-3 mb-4">
                        <Users className="w-6 h-6 text-blue-500" />
                        <h3 className="text-lg font-semibold text-foreground">Personnel</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        All directors, officers, employees, and contractors of Blynk Virtual Technologies Pvt Ltd.
                      </p>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-green-500">
                      <div className="flex items-center gap-3 mb-4">
                        <Building className="w-6 h-6 text-green-500" />
                        <h3 className="text-lg font-semibold text-foreground">Services</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        All products and services offered, including crypto exchange, P2P trading, and financial transactions.
                      </p>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-purple-500">
                      <div className="flex items-center gap-3 mb-4">
                        <UserCheck className="w-6 h-6 text-purple-500" />
                        <h3 className="text-lg font-semibold text-foreground">Customers</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        All customers (individuals and entities) interacting with the platform.
                      </p>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* Regulatory Framework */}
            <section id="regulatory">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Scale className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">3. Regulatory Framework</h2>
                    <p className="text-muted-foreground">Legal and regulatory compliance</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    Blynk Virtual Technologies Pvt Ltd will adhere to:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Scale className="w-6 h-6 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">Domestic Regulations</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Prevention of Money Laundering Act, 2002 (PMLA), India</li>
                        <li>• Reserve Bank of India (RBI) guidelines</li>
                        <li>• Financial Intelligence Unit – India (FIU-IND) guidelines</li>
                      </ul>
                    </Card>

                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Shield className="w-6 h-6 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">International Standards</h3>
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• FATF (Financial Action Task Force) recommendations</li>
                        <li>• Other applicable crypto and financial compliance frameworks</li>
                      </ul>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* KYC Policy */}
            <section id="kyc">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">4. Know Your Customer (KYC) Policy</h2>
                    <p className="text-muted-foreground">Risk-based customer identification approach</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <p className="text-muted-foreground leading-relaxed">
                    Blynk Virtual Technologies Pvt Ltd adopts a risk-based approach to KYC:
                  </p>

                  {/* Customer Identification */}
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">4.1 Customer Identification</h3>
                    <Card className="p-6 bg-muted/20">
                      <ul className="space-y-2 text-muted-foreground">
                        <li>• Collection of official identity proof (Aadhaar, PAN, Passport, Voter ID, or equivalent)</li>
                        <li>• Address verification</li>
                        <li>• Biometric or video KYC (where applicable)</li>
                        <li>• Enhanced checks for high-value customers</li>
                      </ul>
                    </Card>
                  </div>

                  {/* Customer Due Diligence */}
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">4.2 Customer Due Diligence (CDD)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="p-6">
                        <h4 className="font-semibold text-foreground mb-3">Standard Due Diligence (SDD)</h4>
                        <p className="text-sm text-muted-foreground">For normal transactions and low-risk customers.</p>
                      </Card>
                      <Card className="p-6">
                        <h4 className="font-semibold text-foreground mb-3">Enhanced Due Diligence (EDD)</h4>
                        <div className="text-sm text-muted-foreground">
                          Required for:
                          <ul className="mt-2 space-y-1">
                            <li>• Politically Exposed Persons (PEPs)</li>
                            <li>• High-risk jurisdictions</li>
                            <li>• Large/unusual transactions</li>
                          </ul>
                        </div>
                      </Card>
                    </div>
                  </div>

                  {/* Ongoing Monitoring */}
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-4">4.3 Ongoing Monitoring</h3>
                    <Card className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <ul className="space-y-2 text-muted-foreground">
                        <li>• Continuous monitoring of customer transactions</li>
                        <li>• Identification of unusual patterns (e.g., large deposits, multiple bank accounts, frequent reversals)</li>
                        <li>• Periodic KYC revalidation</li>
                      </ul>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* Transaction Monitoring */}
            <section id="monitoring">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">5. Transaction Monitoring</h2>
                    <p className="text-muted-foreground">Automated and manual surveillance systems</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Monitoring Tools</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Use of automated and manual monitoring tools for comprehensive transaction surveillance.
                      </p>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-red-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Red Flags</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Frequent large cash/crypto transactions</li>
                        <li>• Sudden changes in trading patterns</li>
                        <li>• Use of third-party accounts for payments</li>
                      </ul>
                    </Card>
                  </div>

                  <div className="bg-red-50 dark:bg-red-950/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          Suspicious Transaction Reporting
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Suspicious transactions are immediately escalated to the AML Compliance Officer for review and potential reporting to authorities.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Record Keeping */}
            <section id="record-keeping">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Database className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">6. Record Keeping</h2>
                    <p className="text-muted-foreground">Data retention and accessibility standards</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    Blynk Virtual Technologies Pvt Ltd will:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">KYC Records</h3>
                      <p className="text-sm text-muted-foreground">
                        Maintain for at least 5 years after account closure
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                        <Database className="w-6 h-6 text-green-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Transaction Data</h3>
                      <p className="text-sm text-muted-foreground">
                        Retain for at least 10 years
                      </p>
                    </Card>

                    <Card className="p-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
                        <Eye className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Accessibility</h3>
                      <p className="text-sm text-muted-foreground">
                        Ensure records availability for regulatory and audit purposes
                      </p>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* Reporting Obligations */}
            <section id="reporting">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Flag className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">7. Reporting Obligations</h2>
                    <p className="text-muted-foreground">Statutory reporting requirements</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-6 border-l-4 border-l-orange-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">FIU-IND Reporting</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• Suspicious Transaction Reports (STRs)</li>
                        <li>• Cash Transaction Reports (CTRs)</li>
                        <li>• As per PMLA requirements</li>
                      </ul>
                    </Card>

                    <Card className="p-6 border-l-4 border-l-red-500">
                      <h3 className="text-lg font-semibold text-foreground mb-4">Internal Escalation</h3>
                      <p className="text-sm text-muted-foreground">
                        Immediate escalation of suspicious activities to the AML Compliance Officer for review and action.
                      </p>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* AML Compliance Officer */}
            <section id="compliance-officer">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">8. AML Compliance Officer</h2>
                    <p className="text-muted-foreground">Designated MLRO responsibilities</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    A designated AML Compliance Officer (MLRO – Money Laundering Reporting Officer) will oversee compliance.
                  </p>

                  <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                      Key Responsibilities:
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="text-muted-foreground">Implementing AML framework</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="text-muted-foreground">Reviewing and escalating suspicious transactions</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="text-muted-foreground">Acting as a liaison with regulators and law enforcement</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Employee Training */}
            <section id="training">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">9. Employee Training & Awareness</h2>
                    <p className="text-muted-foreground">Building compliance culture</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                      <BookOpen className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Regular Training</h3>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive AML training for all employees
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Red Flag Awareness</h3>
                    <p className="text-sm text-muted-foreground">
                      Training on identifying suspicious activities and reporting channels
                    </p>
                  </Card>

                  <Card className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
                      <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Confidentiality</h3>
                    <p className="text-sm text-muted-foreground">
                      Confidentiality of internal reporting guaranteed
                    </p>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Risk Management Framework */}
            <section id="risk-management">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">10. Risk Management Framework</h2>
                    <p className="text-muted-foreground">Systematic risk assessment approach</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    Risk assessment of products, services, delivery channels, and customer types.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6 border-2 border-green-200 dark:border-green-800">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-3">Low Risk</h3>
                        <p className="text-sm text-muted-foreground">
                          Standard monitoring and verification procedures
                        </p>
                      </div>
                    </Card>

                    <Card className="p-6 border-2 border-amber-200 dark:border-amber-800">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-3">Medium Risk</h3>
                        <p className="text-sm text-muted-foreground">
                          Enhanced monitoring and periodic reviews
                        </p>
                      </div>
                    </Card>

                    <Card className="p-6 border-2 border-red-200 dark:border-red-800">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                          <Flag className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-3">High Risk</h3>
                        <p className="text-sm text-muted-foreground">
                          Continuous monitoring and enhanced due diligence
                        </p>
                      </div>
                    </Card>
                  </div>
                </div>
              </Card>
            </section>

            {/* Prohibited Activities */}
            <section id="prohibited">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">11. Prohibited Activities</h2>
                    <p className="text-muted-foreground">Strictly forbidden practices</p>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-950/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    Blynk Virtual Technologies Pvt Ltd strictly prohibits:
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-500" />
                        Anonymous accounts
                      </li>
                      <li className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-500" />
                        Shell banks or unregulated financial entities
                      </li>
                    </ul>
                    <ul className="space-y-2 text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-500" />
                        Transactions linked to terrorism
                      </li>
                      <li className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-500" />
                        Narcotics or other criminal activities
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            </section>

            {/* Independent Review & Audit */}
            <section id="audit">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">12. Independent Review & Audit</h2>
                    <p className="text-muted-foreground">External validation and assessment</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Periodic Audits</h3>
                    <p className="text-sm text-muted-foreground">
                      Independent audits of AML processes conducted by qualified external auditors to ensure compliance 
                      and identify areas for improvement.
                    </p>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Reporting</h3>
                    <p className="text-sm text-muted-foreground">
                      Audit findings reported to senior management and regulatory authorities as required, 
                      with remediation plans implemented promptly.
                    </p>
                  </Card>
                </div>
              </Card>
            </section>

            {/* Policy Review */}
            <section id="policy-review">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gavel className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-foreground">13. Policy Review</h2>
                    <p className="text-muted-foreground">Continuous improvement and updates</p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-blue-600" />
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Regular Updates
                      </h3>
                      <p className="text-muted-foreground">
                        This AML Policy will be reviewed annually or as required by changes in laws/regulations 
                        to ensure continued effectiveness and regulatory compliance.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* Contact Section */}
            <section className="text-center py-16">
              <Card className="p-8 bg-gradient-to-br from-primary/5 to-secondary/5">
                <h2 className="text-2xl font-bold text-foreground mb-4">
                  Questions about our AML Policy?
                </h2>
                <p className="text-muted-foreground mb-6">
                  Contact our compliance team for clarifications or concerns
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Button className="gap-2">
                    <Mail className="w-4 h-4" />
                    compliance@blynkvirtual.com
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/website/contact')} className="gap-2">
                    <Info className="w-4 h-4" />
                    Contact Us
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
