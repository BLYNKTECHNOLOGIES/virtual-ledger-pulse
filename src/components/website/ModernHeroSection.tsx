import { Button } from '@/components/ui/button';
import { ArrowRight, Bitcoin, Wallet, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernHeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-20 pb-16 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-full text-sm text-muted-foreground">
              <span className="text-primary font-semibold">Over 1 million</span>
              <span>wallets created</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Take back control of{' '}
                <span className="text-primary">your crypto.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Buy, store, swap, sell, and spend your assets. All from one powerful crypto app. 
                No centralized exchange, no excessive markups, just true control across the top chains.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                onClick={() => navigate('/website/download')}
              >
                Get the App
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/features')}
              >
                Learn More
              </Button>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">HODL Pay</h3>
                    <p className="text-sm text-muted-foreground">Unlock spending power without selling your crypto</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-success/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Multi-Chain Support</h3>
                    <p className="text-sm text-muted-foreground">Arbitrum, Optimism & Base now supported</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - App Preview */}
          <div className="relative">
            <div className="relative mx-auto max-w-md">
              {/* Phone Mockup */}
              <div className="relative bg-card border border-border rounded-3xl p-2 shadow-2xl">
                <div className="bg-gradient-to-br from-background to-muted rounded-2xl p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Portfolio Balance</div>
                    <div className="flex gap-1">
                      <div className="w-3 h-3 bg-success rounded-full"></div>
                      <div className="w-3 h-3 bg-warning rounded-full"></div>
                      <div className="w-3 h-3 bg-destructive rounded-full"></div>
                    </div>
                  </div>
                  
                  {/* Balance */}
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-foreground">$98,140.12</div>
                    <div className="flex items-center gap-2">
                      <div className="text-success text-sm font-medium">+2.4%</div>
                      <div className="text-sm text-muted-foreground">24h</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-4 gap-3">
                    {['Buy', 'Sell', 'Send', 'Swap'].map((action) => (
                      <div key={action} className="bg-muted rounded-lg p-3 text-center">
                        <div className="text-xs text-muted-foreground">{action}</div>
                      </div>
                    ))}
                  </div>

                  {/* Crypto Holdings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[hsl(var(--crypto-bitcoin))] rounded-full flex items-center justify-center">
                          <Bitcoin className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Bitcoin</div>
                          <div className="text-xs text-muted-foreground">0.00320 BTC</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">$2,139.04</div>
                        <div className="text-xs text-success">+2.7%</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[hsl(var(--crypto-ethereum))] rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">E</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium">Ethereum</div>
                          <div className="text-xs text-muted-foreground">0.245 ETH</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">$10,245.32</div>
                        <div className="text-xs text-success">+3.2%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/20 rounded-full blur-xl"></div>
              <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-success/20 rounded-full blur-xl"></div>
            </div>
          </div>
        </div>

        {/* Supported Cryptocurrencies */}
        <div className="mt-20 text-center">
          <div className="text-sm text-muted-foreground mb-6">Supported Cryptocurrencies</div>
          <div className="flex justify-center items-center gap-8 opacity-60">
            {['Bitcoin', 'Ethereum', 'Litecoin', 'Bitcoin Cash', 'Dogecoin'].map((crypto, index) => (
              <div key={crypto} className="flex items-center gap-2">
                <div className="w-6 h-6 bg-muted rounded-full"></div>
                <span className="text-sm text-muted-foreground hidden sm:inline">{crypto}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}