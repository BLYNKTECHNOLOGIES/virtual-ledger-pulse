import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle, 
  Lock, 
  FileText,
  Building,
  Users,
  IndianRupee,
  Verified
} from 'lucide-react';

export function SecurityComplianceSection() {
  const trustFeatures = [
    {
      icon: Building,
      title: "FIU-IND Registered (VA00293094)",
      description: "Officially registered with Financial Intelligence Unit - India ensuring complete AML compliance"
    },
    {
      icon: CheckCircle,
      title: "PMLA 2002 Compliant",
      description: "Full compliance with Prevention of Money Laundering Act and FIU-IND guidelines"
    },
    {
      icon: Shield,
      title: "Secure Escrow Protection",
      description: "Every P2P transaction secured through our automated escrow system"
    },
    {
      icon: IndianRupee,
      title: "100% INR Transparency",
      description: "All bank transfers are direct between users with full transaction visibility"
    },
    {
      icon: Lock,
      title: "No Third-Party Payments",
      description: "Direct peer-to-peer transfers only - no intermediary payment processors"
    },
    {
      icon: Verified,
      title: "Verified User Network",
      description: "All traders undergo strict verification to ensure a trusted community"
    }
  ];

  const trustBadges = [
    { label: "FIU-IND Registered", variant: "default" as const },
    { label: "PMLA Compliant", variant: "secondary" as const },
    { label: "Indian Regulation Aligned", variant: "outline" as const },
    { label: "VASP Registered", variant: "outline" as const }
  ];

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Why Trust <span className="text-primary">VASPCorp</span>?
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            We are committed to providing the highest level of security, compliance, and transparency 
            for cryptocurrency trading in India.
          </p>
          
          {/* Trust Badges */}
          <div className="flex flex-wrap justify-center gap-3">
            {trustBadges.map((badge, index) => (
              <Badge key={index} variant={badge.variant} className="px-4 py-2 text-sm">
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Trust Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {trustFeatures.map((feature, index) => (
            <Card key={index} className="border border-border bg-background/50 backdrop-blur-sm hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Compliance Details */}
        <div className="bg-gradient-to-br from-primary/5 to-success/5 rounded-2xl p-8 border border-border">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-foreground">
                Regulatory Compliance & Security
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-success/20 rounded-full flex items-center justify-center mt-0.5">
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">VASP Registration</h4>
                    <p className="text-sm text-muted-foreground">
                      Registered Virtual Asset Service Provider complying with Indian cryptocurrency regulations
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-success/20 rounded-full flex items-center justify-center mt-0.5">
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">KYC/AML Framework</h4>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive Know Your Customer and Anti-Money Laundering procedures
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-success/20 rounded-full flex items-center justify-center mt-0.5">
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">Data Protection</h4>
                    <p className="text-sm text-muted-foreground">
                      Advanced encryption and secure storage of all user data and transaction records
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-background rounded-lg p-6 border border-border">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Compliance Documents</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">VASP Registration Certificate</span>
                    <Badge variant="secondary">Verified</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">KYC Policy Framework</span>
                    <Badge variant="secondary">Updated</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Privacy Policy</span>
                    <Badge variant="secondary">Current</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">Terms of Service</span>
                    <Badge variant="secondary">Latest</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}