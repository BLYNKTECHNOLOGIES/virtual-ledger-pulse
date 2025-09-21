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
import { useState } from 'react';
import { KYCDialog } from './KYCDialog';

export function ModernServicesSection() {
  const navigate = useNavigate();
  const [showKYCDialog, setShowKYCDialog] = useState(false);

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* P2P Trading Section */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Buy & Sell Crypto Instantly with{' '}
              <span className="text-blue-600">INR in India</span>
            </h2>
            <p className="text-lg text-gray-600">
              Trusted P2P Crypto Platform | Instant INR Settlements | KYC Compliant
            </p>
            <p className="text-base text-gray-500">
              Trade Bitcoin, Ethereum, and USDT directly with verified users through our secure escrow system.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
                onClick={() => setShowKYCDialog(true)}
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
          </div>
          
          <div className="relative">
            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { symbol: 'BTC', name: 'Bitcoin', price: '₹84,15,420', change: '+2.4%', positive: true },
                  { symbol: 'ETH', name: 'Ethereum', price: '₹2,85,910', change: '+1.8%', positive: true },
                  { symbol: 'USDT', name: 'Tether', price: '₹83.45', change: '+0.02%', positive: true },
                  { symbol: 'BNB', name: 'BNB', price: '₹25,289', change: '+3.2%', positive: true }
                ].map((crypto) => (
                  <div key={crypto.symbol} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 text-xs font-bold">{crypto.symbol[0]}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{crypto.symbol}</div>
                        <div className="text-xs text-gray-500">{crypto.name}</div>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{crypto.price}</div>
                    <div className={`text-sm ${crypto.positive ? 'text-green-600' : 'text-red-600'}`}>
                      {crypto.change}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Supported Cryptocurrencies */}
        <div className="text-center mb-20">
          <div className="text-sm text-gray-600 mb-8">Supported Cryptocurrencies</div>
          <div className="flex justify-center items-center gap-8 flex-wrap">
            {[
              { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A' },
              { name: 'Ethereum', symbol: 'ETH', color: '#627EEA' },
              { name: 'Litecoin', symbol: 'LTC', color: '#345D9D' },
              { name: 'Bitcoin Cash', symbol: 'BCH', color: '#8DC351' },
              { name: 'Dogecoin', symbol: 'DOGE', color: '#C2A633' },
              { name: 'USDT', symbol: 'USDT', color: '#26A17B' },
              { name: 'USD Coin', symbol: 'USDC', color: '#2775CA' }
            ].map((crypto) => (
              <div key={crypto.symbol} className="flex flex-col items-center gap-3 group hover:scale-105 transition-transform">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm border border-gray-200"
                  style={{ backgroundColor: crypto.color }}
                >
                  <span className="text-white text-lg font-bold">
                    {crypto.symbol.charAt(0)}
                  </span>
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

      {/* KYC Dialog */}
      <KYCDialog open={showKYCDialog} onOpenChange={setShowKYCDialog} />
    </section>
  );
}