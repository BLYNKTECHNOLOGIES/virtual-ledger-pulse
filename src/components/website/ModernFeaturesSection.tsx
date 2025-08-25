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
      icon: Zap,
      title: 'Instant INR Settlements',
      description: 'Seamless and fast INR settlements for both retail and institutional clients, ensuring smooth cash flow.',
      color: 'text-green-600'
    },
    {
      icon: Shield,
      title: 'Escrow-Backed Secure Trading',
      description: 'All trades are protected through secure escrow systems, giving both buyers and sellers complete peace of mind.',
      color: 'text-blue-600'
    },
    {
      icon: Users,
      title: 'Dedicated Relationship Managers',
      description: 'Every institutional and high-volume client gets a personal Relationship Manager for faster resolutions and priority service.',
      color: 'text-purple-600'
    },
    {
      icon: Globe,
      title: 'Multi-Exchange Trust Integration',
      description: 'Trade confidently with support across Binance, Bybit, Bitget, while enjoying the personalized services of Blynk.',
      color: 'text-orange-600'
    },
    {
      icon: MessageCircle,
      title: '24/7 Human Support via WhatsApp',
      description: 'Round-the-clock real human support (not just chatbots) through WhatsApp, live chat, and email.',
      color: 'text-green-500'
    },
    {
      icon: CheckCircle,
      title: 'Strong Compliance & KYC/AML Framework',
      description: 'Strict adherence to regulatory norms, verified traders, and advanced fraud detection systems for maximum safety.',
      color: 'text-indigo-600'
    }
  ];

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything you need for crypto trading,{' '}
            <span className="text-muted-foreground">nothing you don't.</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Experience the future of digital finance with our comprehensive suite of cryptocurrency services.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature, index) => (
            <Card key={index} className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 p-3 rounded-lg bg-background border border-border group-hover:border-primary/20 transition-colors`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            onClick={() => navigate('/website/p2p-trading')}
          >
            Start Trading Now
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}