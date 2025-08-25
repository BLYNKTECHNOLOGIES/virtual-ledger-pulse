import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Users, 
  CheckCircle, 
  Lock, 
  FileText, 
  Award, 
  Phone, 
  Mail, 
  MessageCircle, 
  HelpCircle,
  MapPin,
  Send,
  ArrowRight,
  Building,
  Clock,
  Star
} from 'lucide-react';

export function CompliancePage() {
  const complianceFeatures = [
    {
      icon: Shield,
      title: 'FIU-India Registered',
      description: 'Officially registered with Financial Intelligence Unit of India for full regulatory compliance.',
      badge: 'Verified'
    },
    {
      icon: CheckCircle,
      title: 'KYC/AML Framework',
      description: 'Robust Know Your Customer and Anti-Money Laundering procedures following global standards.',
      badge: 'Compliant'
    },
    {
      icon: Lock,
      title: 'Data Protection',
      description: 'Advanced security measures with GDPR compliance and end-to-end encryption.',
      badge: 'Secure'
    },
    {
      icon: Award,
      title: 'ISO Certified',
      description: 'International security standards with SOC 2 Type II audited controls.',
      badge: 'Certified'
    }
  ];

  const regulatoryInfo = [
    {
      title: 'Indian Regulations',
      items: ['FIU-India Registration', 'RBI Guidelines Compliance', 'IT Act 2000 Adherence', 'PMLA Compliance']
    },
    {
      title: 'International Standards',
      items: ['GDPR Compliance', 'ISO 27001 Certification', 'SOC 2 Type II', 'EU Regulatory Framework']
    },
    {
      title: 'Security Protocols',
      items: ['Multi-Factor Authentication', 'Cold Storage (95% funds)', 'Regular Security Audits', '24/7 Monitoring']
    }
  ];

  const contactMethods = [
    {
      icon: Phone,
      title: 'Call Us',
      primary: '+91 9266712788',
      secondary: 'Mon-Fri 9am-6pm IST',
      action: () => window.open('tel:+919266712788')
    },
    {
      icon: Mail,
      title: 'Email Us',
      primary: 'compliance@blynkvirtual.com',
      secondary: '24-hour response time',
      action: () => window.location.href = 'mailto:compliance@blynkvirtual.com'
    },
    {
      icon: MessageCircle,
      title: 'Live Chat',
      primary: 'Instant support',
      secondary: 'Available 24/7',
      action: () => window.open('https://wa.me/918889923366', '_blank')
    },
    {
      icon: HelpCircle,
      title: 'Support',
      primary: 'Help Center',
      secondary: 'FAQs & Guides',
      action: () => window.open('/website/help-center', '_blank')
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="secondary" className="mb-6 bg-white/20 text-white border-white/30">
              🛡️ Regulatory Compliance
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Compliance & Security
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-4xl mx-auto">
              Fully compliant with Indian and international regulations, ensuring the highest standards 
              of security and transparency for your crypto trading experience.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-50 px-8">
                View Compliance Documents
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8">
                Contact Compliance Team
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Our Compliance Framework
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Comprehensive regulatory compliance ensuring safety and transparency
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {complianceFeatures.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-blue-300 transition-colors group">
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <Badge variant="secondary" className="mb-3 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                    {feature.badge}
                  </Badge>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Regulatory Information */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Regulatory Standards
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Meeting the highest standards of regulatory compliance and security
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {regulatoryInfo.map((section, index) => (
              <Card key={index} className="shadow-lg">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    {section.title}
                  </h3>
                  <ul className="space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-gray-600 dark:text-gray-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Get in Touch Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Get in Touch</h2>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto">
              Ready to ensure compliance? Our team of experts is here to help you 
              navigate regulatory requirements with cutting-edge compliance solutions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {contactMethods.map((method, index) => (
              <Card 
                key={index} 
                className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors cursor-pointer group"
                onClick={method.action}
              >
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <method.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{method.title}</h3>
                  <p className="text-blue-100 font-medium text-lg mb-1">{method.primary}</p>
                  <p className="text-blue-200 text-sm">{method.secondary}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Send us a Message */}
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <Send className="h-6 w-6 text-blue-300" />
                  <h3 className="text-2xl font-bold">Send us a Message</h3>
                </div>
                <form className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder="Your Name" 
                      className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:border-white/60"
                    />
                    <input 
                      type="email" 
                      placeholder="Your Email" 
                      className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:border-white/60"
                    />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Subject" 
                    className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:border-white/60"
                  />
                  <textarea 
                    rows={4} 
                    placeholder="Your Message" 
                    className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:outline-none focus:border-white/60 resize-none"
                  ></textarea>
                  <Button className="w-full bg-white text-blue-600 hover:bg-gray-50 font-medium py-3">
                    Send Message
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Our Office */}
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <MapPin className="h-6 w-6 text-blue-300" />
                  <h3 className="text-2xl font-bold">Our Office</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Head Office</h4>
                    <p className="text-blue-100">
                      BLYNK VIRTUAL TECHNOLOGIES PVT LTD<br />
                      First Floor Balwant Arcade, Plot No. 15<br />
                      Maharana Pratap Nagar, Zone II<br />
                      Bhopal, 462011, Madhya Pradesh, India
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-blue-300" />
                        <span className="font-medium">Business Hours</span>
                      </div>
                      <p className="text-blue-100 text-sm">
                        Mon-Fri: 9:00 AM - 6:00 PM IST<br />
                        Sat: 10:00 AM - 4:00 PM IST
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Building className="h-4 w-4 text-blue-300" />
                        <span className="font-medium">Compliance Team</span>
                      </div>
                      <p className="text-blue-100 text-sm">
                        Available for regulatory<br />
                        inquiries and support
                      </p>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full border-white text-white hover:bg-white/10">
                    <MapPin className="mr-2 h-4 w-4" />
                    View on Google Maps
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Thousands
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Join the growing community of traders who trust our platform
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">15,000+</div>
              <div className="text-gray-600 dark:text-gray-300">Active Users</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">₹5Cr+</div>
              <div className="text-gray-600 dark:text-gray-300">Monthly Volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">99.9%</div>
              <div className="text-gray-600 dark:text-gray-300">Success Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-600 mb-2">24/7</div>
              <div className="text-gray-600 dark:text-gray-300">Support</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}