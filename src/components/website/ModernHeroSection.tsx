import { Button } from '@/components/ui/button';
import { ArrowRight, Bitcoin, Wallet, TrendingUp, DollarSign, Shield, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ModernHeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-20 pb-16 overflow-hidden bg-gray-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 via-white to-gray-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* FIU Registration Trust Badge */}
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-50 to-green-50 px-6 py-3 rounded-full text-sm border border-blue-200">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-semibold">🔒 FIU-IND Registered</span>
                <span className="text-gray-600">•</span>
                <span className="text-green-600 font-medium">VA00293094</span>
              </div>
              <div className="h-4 w-px bg-gray-300"></div>
              <span className="text-gray-600">Trade with Confidence</span>
            </div>

            {/* Main Headline */}
            <div className="space-y-6">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Buy & Sell Crypto Instantly with{' '}
                <span className="text-blue-600">INR in India</span>
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl leading-relaxed">
                <span className="font-semibold text-blue-600">✨ Trusted. Compliant. Secure.</span><br />
                FIU-IND Registered P2P Crypto Platform | Instant INR Settlements | 100% KYC Compliant
              </p>
              <p className="text-base text-gray-500 max-w-2xl">
                Trade Bitcoin, Ethereum, and USDT with verified users through our secure escrow system. 
                With Blynk, you don't just trade crypto – you trade with confidence, love, and security. 💫
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
                onClick={() => navigate('/website/register')}
              >
                Start Trading Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3 rounded-lg font-medium"
                onClick={() => navigate('/website/contact')}
              >
                Contact Sales
              </Button>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
              <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">FIU-IND Registered</h3>
                    <p className="text-sm text-gray-600">Fully compliant with Indian regulations</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <Clock className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Instant INR Settlement</h3>
                    <p className="text-sm text-gray-600">UPI, IMPS & NEFT transfers within minutes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="relative mx-auto max-w-lg">
              {/* Dashboard Mockup */}
              <div className="relative bg-white border border-gray-200 rounded-xl p-6 shadow-lg">
                <div className="bg-gray-50 rounded-lg p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">P2P Trading Dashboard</div>
                    <div className="flex gap-2">
                      <div className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded border">Live</div>
                    </div>
                  </div>
                  
                  {/* Trading Pair */}
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">BTC/INR</div>
                    <div className="text-3xl font-bold text-gray-900">₹84,15,420</div>
                    <div className="flex items-center gap-2">
                      <div className="text-green-600 text-sm font-medium">+₹12,340</div>
                      <div className="text-sm text-gray-500">+1.49% today</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-200">
                      <div className="text-sm font-medium text-blue-700">Buy BTC</div>
                      <div className="text-xs text-gray-600 mt-1">Via UPI/IMPS</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center border border-red-200">
                      <div className="text-sm font-medium text-red-700">Sell BTC</div>
                      <div className="text-xs text-gray-600 mt-1">Instant INR</div>
                    </div>
                  </div>

                  {/* Recent Orders */}
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-gray-900">Recent P2P Orders</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                            <Bitcoin className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">Buy 0.001 BTC</div>
                            <div className="text-xs text-gray-500">Completed</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">₹8,415</div>
                          <div className="text-xs text-green-600">Success</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">E</span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">Sell 0.05 ETH</div>
                            <div className="text-xs text-gray-500">Processing</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">₹14,250</div>
                          <div className="text-xs text-orange-600">Pending</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-blue-100 rounded-full blur-xl"></div>
              <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-green-100 rounded-full blur-xl"></div>
            </div>
          </div>
        </div>

        {/* Supported Cryptocurrencies */}
        <div className="mt-20 text-center">
          <div className="text-sm text-gray-600 mb-8">Supported Cryptocurrencies</div>
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
                  <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{crypto.name}</div>
                  <div className="text-xs text-gray-600">{crypto.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}