
import { Shield, FileText, Globe, CheckCircle, AlertCircle, Users, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function VASPCompliancePage() {
  const complianceFeatures = [
    {
      icon: Shield,
      title: "AML/CFT Compliance",
      description: "Anti-Money Laundering and Counter-Financing of Terrorism measures"
    },
    {
      icon: FileText,
      title: "Regulatory Reporting",
      description: "Automated compliance reporting to regulatory authorities"
    },
    {
      icon: Users,
      title: "Customer Due Diligence",
      description: "Enhanced KYC and ongoing customer monitoring"
    },
    {
      icon: Globe,
      title: "International Standards",
      description: "Compliance with FATF recommendations and local regulations"
    }
  ];

  const regulations = [
    {
      title: "PMLA Compliance (India)",
      description: "Full adherence to Prevention of Money Laundering Act requirements",
      status: "Compliant"
    },
    {
      title: "FEMA Guidelines",
      description: "Foreign Exchange Management Act compliance for crypto operations",
      status: "Compliant"
    },
    {
      title: "FATF Standards",
      description: "Financial Action Task Force recommendations implementation",
      status: "Compliant"
    },
    {
      title: "RBI Guidelines",
      description: "Reserve Bank of India regulatory framework adherence",
      status: "Monitoring"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-600 to-red-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Shield className="h-20 w-20 mx-auto mb-6 text-orange-200" />
            <h1 className="text-6xl font-bold mb-6">VASP Compliance</h1>
            <p className="text-2xl text-orange-100 mb-8 max-w-3xl mx-auto">
              Ensuring regulatory compliance and maintaining the highest standards of operation
            </p>
          </div>
        </div>
      </section>

      {/* Compliance Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">Our Compliance Framework</h2>
            <p className="text-xl text-gray-600">Built on international standards and best practices</p>
          </div>

           <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {complianceFeatures.map((feature, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/20">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-muted rounded-full w-16 h-16 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                    <feature.icon className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <CardTitle className="text-xl text-foreground">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground text-center text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Regulatory Status */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Regulatory Compliance Status</h2>
            <p className="text-xl text-gray-600">Our commitment to regulatory excellence</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {regulations.map((regulation, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-xl">{regulation.title}</CardTitle>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      regulation.status === 'Compliant' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {regulation.status === 'Compliant' ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          {regulation.status}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          {regulation.status}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    {regulation.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Measures */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Lock className="h-16 w-16 mx-auto mb-6 text-orange-400" />
            <h2 className="text-4xl font-bold mb-6">Security & Risk Management</h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Multi-layered security approach to protect assets and ensure compliance
            </p>
          </div>

           <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center group">
              <div className="bg-muted p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                <Shield className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Data Protection</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                End-to-end encryption, secure data storage, and privacy protection measures
              </p>
            </div>
            <div className="text-center group">
              <div className="bg-muted p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                <AlertCircle className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Risk Assessment</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Continuous risk monitoring and assessment of all transactions and users
              </p>
            </div>
            <div className="text-center group">
              <div className="bg-muted p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                <FileText className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Audit Trail</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Complete audit trails and transaction records for regulatory reporting
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Compliance Inquiries</h2>
          <p className="text-xl text-gray-600 mb-8">
            For compliance-related questions or regulatory inquiries, contact our compliance team
          </p>
          <div className="bg-gray-50 p-8 rounded-lg">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Compliance Officer</h3>
                <p className="text-gray-600">compliance@blynkex.com</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Legal Department</h3>
                <p className="text-gray-600">legal@blynkex.com</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
