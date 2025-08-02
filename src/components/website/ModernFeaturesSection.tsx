import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Wallet, 
  RefreshCw, 
  ShoppingCart, 
  CreditCard, 
  Shield, 
  Zap,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernFeaturesSection() {
  const navigate = useNavigate();

  const features = [
    {
      icon: Wallet,
      title: 'Self-Custody Wallet',
      description: 'Store your assets with complete control. Your keys, your crypto.',
      color: 'text-primary'
    },
    {
      icon: RefreshCw,
      title: 'Multi-Network Support',
      description: 'Manage multiple wallets across the top blockchain networks.',
      color: 'text-success'
    },
    {
      icon: Zap,
      title: 'Instant Trading',
      description: 'Buy BTC and hundreds of other cryptocurrencies instantly.',
      color: 'text-warning'
    },
    {
      icon: RefreshCw,
      title: 'Crypto Exchange',
      description: 'Exchange thousands of crypto pairs with a single tap.',
      color: 'text-info'
    },
    {
      icon: ShoppingCart,
      title: 'Spend Crypto',
      description: 'Use crypto for purchases, gift cards, and bill payments.',
      color: 'text-primary'
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-grade security with advanced encryption and protection.',
      color: 'text-destructive'
    }
  ];

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything you need in a crypto app,{' '}
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

        {/* CTA Section */}
        <div className="text-center">
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            onClick={() => navigate('/website/download')}
          >
            Get the App
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>

        {/* App Store Buttons */}
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button variant="outline" size="lg" className="h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
                <span className="text-background text-xs font-bold">A</span>
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Download on the</div>
                <div className="text-sm font-semibold">App Store</div>
              </div>
            </div>
          </Button>
          
          <Button variant="outline" size="lg" className="h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-foreground rounded-md flex items-center justify-center">
                <span className="text-background text-xs font-bold">G</span>
              </div>
              <div className="text-left">
                <div className="text-xs text-muted-foreground">Get it on</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </div>
          </Button>
        </div>
      </div>
    </section>
  );
}