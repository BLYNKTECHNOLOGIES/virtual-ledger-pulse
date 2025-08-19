import { Shield, FileText, Users, CreditCard, Lock, Eye, AlertTriangle, Phone, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function CompliancePage() {
  const complianceAreas = [
    {
      icon: Lock,
      title: "KYC & Identity Verification",
      points: [
        "Mandatory Know Your Customer (KYC) verification for all users",
        "Accepted documents: Aadhaar, PAN, Passport, Driving License", 
        "Both Manual KYC and Video KYC are supported",
        "Risky accounts are flagged for Re-KYC verification"
      ]
    },
    {
      icon: Shield,
      title: "AML & Risk Monitoring", 
      points: [
        "Adherence to Anti-Money Laundering (AML) policies",
        "High-value or unusual transactions monitoring",
        "Frequent bank account changes detection",
        "Suspicious activity reporting to FIU-IND"
      ]
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      points: [
        "All payments routed via verified Indian bank accounts",
        "Third-party or anonymous transactions prohibited", 
        "Bank-grade encryption for payment security",
        "Real-time payment verification system"
      ]
    },
    {
      icon: Eye,
      title: "User Protection",
      points: [
        "Escrow Mechanism: Crypto held until payment verified",
        "Dedicated support for appeals and disputes",
        "Fraud Detection: Flagged users restricted",
        "24/7 transaction monitoring system"
      ]
    }
  ];

  const securityFeatures = [
    {
      icon: Lock,
      title: "Data Privacy & Security",
      description: "Full compliance with IT Act 2000 and Indian Data Protection laws. User data encrypted and stored securely."
    },
    {
      icon: FileText, 
      title: "Transparency & Reporting",
      description: "Regular compliance audits and suspicious transaction logging for regulatory reporting."
    },
    {
      icon: AlertTriangle,
      title: "Legal Disclaimer",
      description: "VDA trading subject to taxation. Users responsible for tax compliance and reporting obligations."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Shield className="h-20 w-20 mx-auto mb-6 text-primary-foreground/80" />
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Compliance & Security at<br />
              <span className="text-primary-foreground/90">Blynk Virtual Technologies Pvt. Ltd.</span>
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/90 mb-8 max-w-4xl mx-auto leading-relaxed">
              We are committed to full compliance with Indian regulations, ensuring every P2P crypto transaction is transparent, secure, and legally protected.
            </p>
          </div>
        </div>
      </section>

      {/* Why Compliance Matters */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">Why Compliance Matters</h2>
            <div className="max-w-4xl mx-auto space-y-6">
              <p className="text-lg text-muted-foreground leading-relaxed">
                We operate in accordance with Indian regulatory guidelines governing financial transactions and Virtual Digital Assets (VDAs).
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our framework ensures secure trading, AML/KYC compliance, and data privacy.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We strictly adhere to standards laid down by RBI, FIU-IND, and applicable IT Act provisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Compliance Areas */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            {complianceAreas.map((area, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <area.icon className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold">{area.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {area.points.map((point, pointIndex) => (
                      <li key={pointIndex} className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-muted-foreground leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Security Features */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {securityFeatures.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center">
                    <feature.icon className="h-10 w-10 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Legal Disclaimer */}
      <section className="py-20 bg-destructive/5 border-y border-destructive/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-6 text-destructive" />
            <h2 className="text-3xl font-bold text-foreground mb-8">Important Legal Disclaimer</h2>
            <div className="max-w-4xl mx-auto space-y-6 text-left">
              <div className="bg-background p-6 rounded-xl border-l-4 border-destructive">
                <p className="text-muted-foreground leading-relaxed mb-4">
                  <strong className="text-foreground">Tax Obligations:</strong> Trading of Virtual Digital Assets (VDAs) in India is subject to taxation and reporting under the Income Tax Act.
                </p>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  <strong className="text-foreground">User Responsibility:</strong> Users are solely responsible for complying with tax filing, TDS, and GST obligations.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Liability Limitation:</strong> Blynk Virtual Technologies Pvt. Ltd. shall not be held liable for user negligence, fraudulent third-party transactions, or non-compliance with individual tax responsibilities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Compliance Team */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Contact Our Compliance Team</h2>
          <p className="text-xl text-primary-foreground/90 mb-12">
            Have compliance questions? Our dedicated team is here to help with all regulatory inquiries.
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <Card className="bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/15 transition-colors">
              <CardContent className="p-8 text-center">
                <Mail className="h-12 w-12 mx-auto mb-4 text-primary-foreground" />
                <h3 className="text-xl font-semibold mb-2 text-primary-foreground">Email Us</h3>
                <p className="text-primary-foreground/90">compliance@blynkvirtual.com</p>
              </CardContent>
            </Card>
            
            <Card className="bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/15 transition-colors">
              <CardContent className="p-8 text-center">
                <Phone className="h-12 w-12 mx-auto mb-4 text-primary-foreground" />
                <h3 className="text-xl font-semibold mb-2 text-primary-foreground">Call Us</h3>
                <p className="text-primary-foreground/90">+91-XXXXXXXXXX</p>
              </CardContent>
            </Card>
          </div>

          <Button 
            variant="secondary" 
            size="lg" 
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            Get Compliance Support
          </Button>
        </div>
      </section>
    </div>
  );
}