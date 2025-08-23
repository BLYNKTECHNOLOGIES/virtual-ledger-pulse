import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Users, CheckCircle, Lock, FileText, Award } from 'lucide-react';

export function CompliancePage() {
  const complianceFeatures = [
    {
      icon: Shield,
      title: 'Safe and insured funds',
      description: 'None of your assets or funds are used without your permission.',
      gradient: 'from-purple-500 to-blue-500'
    },
    {
      icon: CheckCircle,
      title: '100% compliant',
      description: 'Registered with FIU-India and fully compliant by Indian and European standards',
      gradient: 'from-green-500 to-teal-500'
    },
    {
      icon: Users,
      title: '1/1 expert support',
      description: 'The easiest investment you\'ll ever make, with expert support just one call away',
      gradient: 'from-purple-500 to-pink-500'
    }
  ];

  const regulatoryCompliance = [
    {
      icon: FileText,
      title: 'KYC/AML Compliance',
      description: 'Robust Know Your Customer and Anti-Money Laundering procedures to ensure regulatory compliance.',
      points: ['Identity verification', 'Document validation', 'Risk assessment', 'Ongoing monitoring']
    },
    {
      icon: Lock,
      title: 'Data Protection',
      description: 'Advanced security measures to protect your personal and financial information.',
      points: ['End-to-end encryption', 'Secure data storage', 'GDPR compliant', 'Regular security audits']
    },
    {
      icon: Award,
      title: 'Regulatory Approvals',
      description: 'Licensed and approved by relevant financial authorities and regulatory bodies.',
      points: ['FIU-India registration', 'EU compliance', 'ISO certifications', 'Regular compliance reviews']
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-6">
            Compliant with Global and Indian Regulations
          </h1>
          <p className="text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Our platform is fully compliant with Indian and EU regulations, ensuring you have a 
            platform where you can invest your hard-earned money without sacrificing your peace of mind.
          </p>
        </div>

        {/* Main Compliance Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {complianceFeatures.map((feature, index) => (
            <Card key={index} className="border-0 shadow-xl bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
              <CardContent className="p-8 text-center">
                <div className={`w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r ${feature.gradient} flex items-center justify-center`}>
                  <feature.icon className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detailed Compliance Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {regulatoryCompliance.map((item, index) => (
            <Card key={index} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{item.title}</h3>
                </div>
                <p className="text-muted-foreground mb-6">{item.description}</p>
                <ul className="space-y-3">
                  {item.points.map((point, pointIndex) => (
                    <li key={pointIndex} className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Regulatory Information */}
        <Card className="mb-16 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-4">Regulatory Framework</h2>
              <p className="text-muted-foreground max-w-3xl mx-auto">
                We operate under strict regulatory guidelines to ensure the highest standards of security and compliance.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-6 bg-background/80 rounded-xl">
                <h4 className="font-semibold text-foreground mb-2">FIU-India</h4>
                <p className="text-sm text-muted-foreground">Registered with Financial Intelligence Unit</p>
              </div>
              <div className="text-center p-6 bg-background/80 rounded-xl">
                <h4 className="font-semibold text-foreground mb-2">EU Compliant</h4>
                <p className="text-sm text-muted-foreground">Adheres to European regulations</p>
              </div>
              <div className="text-center p-6 bg-background/80 rounded-xl">
                <h4 className="font-semibold text-foreground mb-2">ISO Certified</h4>
                <p className="text-sm text-muted-foreground">International security standards</p>
              </div>
              <div className="text-center p-6 bg-background/80 rounded-xl">
                <h4 className="font-semibold text-foreground mb-2">SOC 2 Type II</h4>
                <p className="text-sm text-muted-foreground">Audited security controls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Measures */}
        <Card className="mb-16 shadow-lg">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-4">Security Measures</h2>
              <p className="text-muted-foreground">
                Multi-layered security approach to protect your investments and personal data.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Lock className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Bank-Grade Security</h4>
                    <p className="text-sm text-muted-foreground">256-bit SSL encryption and secure data transmission</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Cold Storage</h4>
                    <p className="text-sm text-muted-foreground">95% of funds stored in offline cold storage wallets</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Multi-Factor Authentication</h4>
                    <p className="text-sm text-muted-foreground">Additional security layers for account protection</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Regular Audits</h4>
                    <p className="text-sm text-muted-foreground">Third-party security audits and penetration testing</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">24/7 Monitoring</h4>
                    <p className="text-sm text-muted-foreground">Round-the-clock security monitoring and incident response</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">Insurance Protection</h4>
                    <p className="text-sm text-muted-foreground">Digital asset insurance coverage for added protection</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white">
            <h3 className="text-2xl font-bold mb-4">Questions about our compliance?</h3>
            <p className="mb-6 opacity-90">
              Our compliance team is here to help. Get in touch for detailed information about our regulatory framework.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-purple-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                Contact Compliance Team
              </button>
              <button className="px-8 py-3 border border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 transition-colors">
                Download Compliance Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}