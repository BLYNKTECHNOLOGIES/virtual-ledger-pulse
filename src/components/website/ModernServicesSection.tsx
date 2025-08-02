import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  TrendingUp, 
  CreditCard, 
  Building2, 
  Code, 
  ArrowRight,
  DollarSign,
  Gift,
  Smartphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernServicesSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Buy/Swap Crypto Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Buy or swap crypto at{' '}
              <span className="text-primary">competitive rates.</span> Every time.
            </h2>
            <p className="text-lg text-muted-foreground">
              We compare offers from the best providers so you always get the most crypto for your money, 
              with transparent pricing and multiple payment options.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90"
                onClick={() => navigate('/website/buy-crypto')}
              >
                Buy Crypto
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/swap-crypto')}
              >
                Swap Crypto
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <div className="bg-gradient-to-br from-primary/10 to-success/10 rounded-2xl p-8">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { symbol: 'BTC', name: 'Bitcoin', price: '$67,234', change: '+2.4%', positive: true },
                  { symbol: 'ETH', name: 'Ethereum', price: '$3,891', change: '+1.8%', positive: true },
                  { symbol: 'LTC', name: 'Litecoin', price: '$142', change: '-0.5%', positive: false },
                  { symbol: 'BCH', name: 'Bitcoin Cash', price: '$289', change: '+3.2%', positive: true }
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

        {/* Bill Pay Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="order-2 lg:order-1 relative">
            <div className="bg-gradient-to-br from-success/10 to-info/10 rounded-2xl p-8">
              <div className="bg-background rounded-lg p-6 border border-border">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">Pay Bills with Crypto</div>
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  
                  <div className="space-y-3">
                    {[
                      { name: 'Credit Card Payment', amount: '$1,250.00', status: 'Paid' },
                      { name: 'Mortgage Payment', amount: '$2,100.00', status: 'Pending' },
                      { name: 'Utility Bill', amount: '$185.50', status: 'Scheduled' }
                    ].map((bill, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{bill.name}</div>
                          <div className="text-xs text-muted-foreground">{bill.amount}</div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          bill.status === 'Paid' ? 'bg-success/20 text-success' :
                          bill.status === 'Pending' ? 'bg-warning/20 text-warning' :
                          'bg-info/20 text-info'
                        }`}>
                          {bill.status}
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
              Pay your bills with{' '}
              <span className="text-primary">crypto</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Make bill payments on everything from credit cards to mortgages, all with the convenience 
              and smooth experience that only blockchain payments can provide.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90"
                onClick={() => navigate('/website/download')}
              >
                Get the App to Start
                <Smartphone className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/bill-pay')}
              >
                Pay Bills on Web
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Geographic restrictions apply. See terms and conditions for more information.
            </p>
          </div>
        </div>

        {/* Service Categories */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">Trading & Exchange</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Advanced trading tools and instant exchanges across multiple cryptocurrencies.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Learn More <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-success/20 transition-colors">
                <DollarSign className="h-6 w-6 text-success" />
              </div>
              <CardTitle className="text-lg">Payment Solutions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Seamless crypto payments for bills, purchases, and everyday transactions.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Learn More <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-warning/20 transition-colors">
                <Gift className="h-6 w-6 text-warning" />
              </div>
              <CardTitle className="text-lg">Gift Cards</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Buy gift cards from hundreds of retailers using your cryptocurrency.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Learn More <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 border border-border hover:border-primary/20">
            <CardHeader className="pb-4">
              <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-info/20 transition-colors">
                <Building2 className="h-6 w-6 text-info" />
              </div>
              <CardTitle className="text-lg">Enterprise</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Comprehensive crypto solutions for businesses and financial institutions.
              </p>
              <Button variant="ghost" size="sm" className="p-0 h-auto text-primary hover:text-primary/80">
                Learn More <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}