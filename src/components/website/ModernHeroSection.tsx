import { Button } from '@/components/ui/button';
import { ArrowRight, Bitcoin, Wallet, TrendingUp, DollarSign, Shield, Clock } from 'lucide-react';
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
              <span className="text-primary font-semibold">KYC Verified</span>
              <span>P2P Trading Platform</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                Buy & Sell Crypto Instantly with{' '}
                <span className="text-primary">INR in India</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Trusted P2P Crypto Platform | Instant INR Settlements | KYC Compliant
                <br />
                Trade Bitcoin, Ethereum, and USDT directly with verified users through our secure escrow system.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                onClick={() => navigate('/website/register')}
              >
                Start Trading Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/website/contact')}
              >
                Contact Sales
              </Button>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Escrow Protection</h3>
                    <p className="text-sm text-muted-foreground">Every P2P trade secured with escrow system</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-success/10 rounded-lg flex items-center justify-center">
                    <Clock className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Instant INR Settlement</h3>
                    <p className="text-sm text-muted-foreground">UPI, IMPS & NEFT transfers within minutes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="relative mx-auto max-w-lg">
              {/* Dashboard Mockup */}
              <div className="relative bg-card border border-border rounded-xl p-6 shadow-2xl">
                <div className="bg-gradient-to-br from-background to-muted rounded-lg p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">P2P Trading Dashboard</div>
                    <div className="flex gap-2">
                      <div className="px-2 py-1 bg-success/20 text-success text-xs rounded">Live</div>
                    </div>
                  </div>
                  
                  {/* Trading Pair */}
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">BTC/INR</div>
                    <div className="text-3xl font-bold text-foreground">₹84,15,420</div>
                    <div className="flex items-center gap-2">
                      <div className="text-success text-sm font-medium">+₹12,340</div>
                      <div className="text-sm text-muted-foreground">+1.49% today</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-primary/10 rounded-lg p-4 text-center border border-primary/20">
                      <div className="text-sm font-medium text-primary">Buy BTC</div>
                      <div className="text-xs text-muted-foreground mt-1">Via UPI/IMPS</div>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-4 text-center border border-destructive/20">
                      <div className="text-sm font-medium text-destructive">Sell BTC</div>
                      <div className="text-xs text-muted-foreground mt-1">Instant INR</div>
                    </div>
                  </div>

                  {/* Recent Orders */}
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Recent P2P Orders</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[hsl(var(--crypto-bitcoin))] rounded-full flex items-center justify-center">
                            <Bitcoin className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">Buy 0.001 BTC</div>
                            <div className="text-xs text-muted-foreground">Completed</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">₹8,415</div>
                          <div className="text-xs text-success">Success</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[hsl(var(--crypto-ethereum))] rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">E</span>
                          </div>
                          <div>
                            <div className="text-sm font-medium">Sell 0.05 ETH</div>
                            <div className="text-xs text-muted-foreground">Processing</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">₹14,250</div>
                          <div className="text-xs text-warning">Pending</div>
                        </div>
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
          <div className="text-sm text-muted-foreground mb-8">Supported Cryptocurrencies</div>
          <div className="flex justify-center items-center gap-8 flex-wrap">
            {[
              { name: 'Bitcoin', symbol: 'BTC', color: 'hsl(var(--crypto-bitcoin))', icon: Bitcoin },
              { name: 'Ethereum', symbol: 'ETH', color: 'hsl(var(--crypto-ethereum))', icon: null },
              { name: 'Litecoin', symbol: 'LTC', color: 'hsl(204, 100%, 50%)', icon: null },
              { name: 'Bitcoin Cash', symbol: 'BCH', color: 'hsl(120, 100%, 35%)', icon: null },
              { name: 'Dogecoin', symbol: 'DOGE', color: 'hsl(45, 100%, 50%)', icon: null },
              { name: 'USDT', symbol: 'USDT', color: 'hsl(120, 100%, 40%)', icon: DollarSign },
              { name: 'USD Coin', symbol: 'USDC', color: 'hsl(210, 100%, 50%)', icon: DollarSign }
            ].map((crypto) => (
              <div key={crypto.symbol} className="flex flex-col items-center gap-3 group hover:scale-105 transition-transform">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: crypto.color }}
                >
                  {crypto.icon ? (
                    <crypto.icon className="w-6 h-6 text-white" />
                  ) : (
                    <span className="text-white text-lg font-bold">
                      {crypto.symbol.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{crypto.name}</div>
                  <div className="text-xs text-muted-foreground">{crypto.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}