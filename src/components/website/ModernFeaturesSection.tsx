import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Zap, 
  Shield, 
  Users, 
  Globe, 
  MessageCircle, 
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernFeaturesSection() {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: 'FIU-India Registered',
      description: 'Verified',
      subtitle: 'Registered with Financial Intelligence Unit of India for complete regulatory compliance',
      color: 'text-blue-600'
    },
    {
      icon: CheckCircle,
      title: 'KYC/AML Framework',
      description: 'Compliant',
      subtitle: 'Comprehensive Know Your Customer and Anti-Money Laundering procedures',
      color: 'text-green-600'
    },
    {
      icon: Users,
      title: 'Data Protection',
      description: 'Secure',
      subtitle: 'Advanced encryption and data security protocols to protect user information',
      color: 'text-gray-600'
    },
    {
      icon: CheckCircle,
      title: 'ISO Certified',
      description: 'Certified',
      subtitle: 'International Organization for Standardization certified operations',
      color: 'text-blue-600'
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Compliance Framework
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Comprehensive regulatory compliance ensuring safety and transparency
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {features.map((feature, index) => (
            <div key={index} className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <feature.icon className={`h-8 w-8 ${feature.color}`} />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wide">{feature.description}</div>
                <h3 className="font-semibold text-gray-900 text-lg">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.subtitle}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white hover:bg-gray-50 text-blue-600 px-8 py-3 rounded-lg font-medium border border-blue-200"
              onClick={() => navigate('/website/aml-policy')}
            >
              View AML Policy
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
              onClick={() => navigate('/website/contact')}
            >
              Contact Sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}