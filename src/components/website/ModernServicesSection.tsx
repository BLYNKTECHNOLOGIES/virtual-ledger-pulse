import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  TrendingUp, 
  CreditCard, 
  Building2, 
  Shield, 
  ArrowRight,
  DollarSign,
  Users,
  CheckCircle,
  Clock,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernServicesSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* P2P Trading Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Trade crypto with{' '}
              <span className="text-primary">verified users</span> across India
            </h2>
            <p className="text-lg text-muted-foreground">
              Our secure P2P platform connects you with trusted traders. Every transaction is protected 
              by escrow and completed with instant INR bank transfers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90"
                onClick={() => navigate('/website/p2p-trading')}
              >
                Start P2P Trading
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/bulk-orders')}
              >
                Bulk Orders
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <div className="bg-gradient-to-br from-primary/10 to-success/10 rounded-2xl p-8">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { symbol: 'BTC', name: 'Bitcoin', price: '₹84,15,420', change: '+2.4%', positive: true },
                  { symbol: 'ETH', name: 'Ethereum', price: '₹2,85,910', change: '+1.8%', positive: true },
                  { symbol: 'USDT', name: 'Tether', price: '₹83.45', change: '+0.02%', positive: true },
                  { symbol: 'BNB', name: 'BNB', price: '₹25,289', change: '+3.2%', positive: true }
                ].map((crypto) => (
                  <div key={crypto.symbol} className="bg-background rounded-lg p-4 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-primary text-xs font-bold">{crypto.symbol[0]}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{crypto.symbol}</div>
                        <div className="text-xs text-muted-foreground">{crypto.name}</div>
                      </div>
                    </div>
                    <div className="text-lg font-bold">{crypto.price}</div>
                    <div className={`text-sm ${crypto.positive ? 'text-success' : 'text-destructive'}`}>
                      {crypto.change}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* KYC Compliance Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="order-2 lg:order-1 relative">
            <div className="bg-gradient-to-br from-success/10 to-info/10 rounded-2xl p-8">
              <div className="bg-background rounded-lg p-6 border border-border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">KYC Verification Process</div>
                    <CheckCircle className="h-6 w-6 text-success" />
                  </div>
                  
                  <div className="space-y-3">
                    {[
                      { step: 'Personal Details', time: '2 minutes', status: 'Complete' },
                      { step: 'Document Upload', time: '5 minutes', status: 'Complete' },
                      { step: 'Bank Verification', time: '1-2 hours', status: 'In Progress' },
                      { step: 'Final Approval', time: '24 hours', status: 'Pending' }
                    ].map((step, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{step.step}</div>
                          <div className="text-xs text-muted-foreground">{step.time}</div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          step.status === 'Complete' ? 'bg-success/20 text-success' :
                          step.status === 'In Progress' ? 'bg-warning/20 text-warning' :
                          'bg-info/20 text-info'
                        }`}>
                          {step.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Fully{' '}
              <span className="text-primary">KYC Compliant</span> Platform
            </h2>
            <p className="text-lg text-muted-foreground">
              We follow all regulatory guidelines with comprehensive KYC verification. 
              Trade with confidence knowing all users are identity-verified and trusted.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90"
                onClick={() => navigate('/website/kyc-verification')}
              >
                Complete KYC Now
                <CheckCircle className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/compliance')}
              >
                View Compliance
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              KYC completion is mandatory for all trading activities as per Indian regulations.
            </p>
          </div>
        </div>

        {/* Our Crypto Services */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Our Crypto Services</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Complete cryptocurrency trading solutions designed for the Indian market
          </p>
        </div>

        {/* Service Categories */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">P2P Trading Desk</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Buy & sell crypto directly from verified users with full escrow security and instant settlements.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Start Trading <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-success/20 transition-colors">
                <Building2 className="h-6 w-6 text-success" />
              </div>
              <CardTitle className="text-lg">Bulk Buy/Sell Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                For institutions or high-volume clients, with instant INR settlement and dedicated support.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Contact Sales <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-warning/20 transition-colors">
                <Shield className="h-6 w-6 text-warning" />
              </div>
              <CardTitle className="text-lg">Secure Escrow System</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Every transaction is protected with our secure escrow mechanism until both parties confirm.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Learn More <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-info/20 transition-colors">
                <Clock className="h-6 w-6 text-info" />
              </div>
              <CardTitle className="text-lg">Instant INR Settlements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Fast payments via UPI, IMPS, NEFT with 100% transparency and no third-party involvement.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                View Methods <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}