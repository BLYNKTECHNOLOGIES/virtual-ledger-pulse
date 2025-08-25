import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Eye, 
  Users, 
  CreditCard, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Building,
  UserCheck,
  MessageCircle,
  Mail,
  Phone,
  Lock,
  Key,
  Camera
} from 'lucide-react';

export function SafetyTipsPage() {
  const safetyFeatures = [
    {
      icon: <Shield className="h-8 w-8" />,
      title: 'Escrow Protection',
      description: 'All trades are protected by escrow, ensuring that your crypto is only released once payment is confirmed.'
    },
    {
      icon: <UserCheck className="h-8 w-8" />,
      title: 'Verified Buyers & Sellers',
      description: 'We enforce strict KYC/AML policies to ensure that only verified individuals and institutions can trade.'
    },
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: 'Secure Payment Channels',
      description: 'We support bank-verified payment methods only, minimizing fraud and unauthorized transactions.'
    },
    {
      icon: <Eye className="h-8 w-8" />,
      title: '24/7 Monitoring',
      description: 'Our compliance and risk management teams monitor transactions round the clock to detect and prevent suspicious activity.'
    }
  ];

  const traderTips = [
    'Always trade with verified users',
    'Double-check payment confirmation before releasing crypto',
    'Never share your passwords, OTPs, or private keys',
    'Use official communication channels only',
    'Report suspicious activity immediately'
  ];

  const institutionBenefits = [
    'Enjoy dedicated settlement channels for INR transactions',
    'Get custom risk assessment and compliance support',
    'Assigned Relationship Managers for priority handling',
    'Enhanced security protocols for large transactions'
  ];

  const generalSafetyTips = [
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Verify official communication channels'
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Enable 2FA (Two-Factor Authentication) on your account'
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Report any suspicious activity immediately'
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Keep your personal information confidential'
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Use strong, unique passwords for your account'
    },
    {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      text: 'Regularly review your transaction history'
    }
  ];

  const supportChannels = [
    {
      icon: <MessageCircle className="h-6 w-6" />,
      name: 'WhatsApp',
      description: 'Instant messaging support',
      available: '24/7'
    },
    {
      icon: <Mail className="h-6 w-6" />,
      name: 'Email',
      description: 'Detailed support queries',
      available: '24/7'
    },
    {
      icon: <MessageCircle className="h-6 w-6" />,
      name: 'Live Chat',
      description: 'Real-time assistance',
      available: '24/7'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              🛡️ Safety First
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Safety at{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                Blynk Virtual Technologies
              </span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              Your trust is our top priority. We ensure that every transaction on our P2P trading platform 
              is safe, secure, and transparent.
            </p>
          </div>
        </div>
      </section>

      {/* How We Keep You Safe Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              🔒 How We Keep You Safe
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Multiple layers of security to protect your assets and transactions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {safetyFeatures.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-blue-300 transition-colors">
                <CardHeader className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4 mx-auto">
                    <div className="text-blue-600 dark:text-blue-400">
                      {feature.icon}
                    </div>
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-300 text-center">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* For Traders Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-600" />
                👥 For Traders
              </h2>
              <div className="space-y-4">
                {traderTips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700 dark:text-gray-300">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <Building className="h-8 w-8 text-purple-600" />
                🏢 For Institutions
              </h2>
              <div className="space-y-4">
                {institutionBenefits.map((benefit, index) => (
                  <div key={index} className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700 dark:text-gray-300">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety Tips Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 flex items-center justify-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-600" />
              ⚠️ Safety Tips
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Essential guidelines to keep your account and transactions secure
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {generalSafetyTips.map((tip, index) => (
              <div key={index} className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                {tip.icon}
                <span className="text-gray-700 dark:text-gray-300">{tip.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features Highlight */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-2xl p-8 lg:p-12 text-white">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  Advanced Security Measures
                </h2>
                <p className="text-green-100 mb-6">
                  We employ industry-leading security technologies and practices to protect your assets and personal information.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-green-400" />
                    <span>End-to-end encryption for all transactions</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-green-400" />
                    <span>Multi-signature wallet technology</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Camera className="h-5 w-5 text-green-400" />
                    <span>Video KYC for enhanced verification</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-green-400" />
                    <span>Regular security audits and compliance checks</span>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <Shield className="h-32 w-32 mx-auto text-green-200 mb-4" />
                <p className="text-green-100">
                  Licensed Virtual Asset Service Provider (VASP) in India
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              📞 Need Help?
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Our 24/7 Support Team is available via multiple channels
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {supportChannels.map((channel, index) => (
              <Card key={index} className="text-center border-2 hover:border-blue-300 transition-colors">
                <CardHeader>
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4 mx-auto">
                    <div className="text-blue-600 dark:text-blue-400">
                      {channel.icon}
                    </div>
                  </div>
                  <CardTitle className="text-xl">{channel.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-300 mb-2">{channel.description}</p>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    {channel.available} Available
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Your Safety is Our Responsibility
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Trade with confidence at Blynk Virtual Technologies. Our comprehensive security measures 
            ensure your assets and personal information are always protected.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
              Start Trading Safely
            </Button>
            <Button variant="outline" size="lg" className="px-8">
              Contact Security Team
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
