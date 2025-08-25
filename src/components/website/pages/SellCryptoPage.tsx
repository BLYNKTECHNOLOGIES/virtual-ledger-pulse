import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Shield, 
  Clock, 
  Banknote, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle,
  Smartphone,
  CreditCard,
  Zap
} from 'lucide-react';

export function SellCryptoPage() {
  const cryptoCurrencies = [
    { name: 'Bitcoin', symbol: 'BTC', rate: '₹42,15,000', change: '+2.5%', logo: '₿' },
    { name: 'Ethereum', symbol: 'ETH', rate: '₹2,85,000', change: '+1.8%', logo: 'Ξ' },
    { name: 'Tether', symbol: 'USDT', rate: '₹83.50', change: '+0.1%', logo: '₮' },
    { name: 'Binance Coin', symbol: 'BNB', rate: '₹45,200', change: '+3.2%', logo: 'B' },
  ];

  const features = [
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'Instant Settlements',
      description: 'Get INR in your bank account within minutes of selling crypto'
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Secure Platform',
      description: 'Bank-grade security with multi-layer protection for your assets'
    },
    {
      icon: <CreditCard className="h-6 w-6" />,
      title: 'Multiple Payment Options',
      description: 'UPI, IMPS, NEFT, and direct bank transfers available'
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: 'Best Market Rates',
      description: 'Competitive rates updated in real-time for maximum returns'
    }
  ];

  const steps = [
    {
      step: '1',
      title: 'Complete KYC',
      description: 'Verify your identity with our simple KYC process'
    },
    {
      step: '2',
      title: 'Add Bank Account',
      description: 'Link your verified bank account for INR settlements'
    },
    {
      step: '3',
      title: 'Select Crypto',
      description: 'Choose the cryptocurrency you want to sell'
    },
    {
      step: '4',
      title: 'Get Instant INR',
      description: 'Receive INR directly in your bank account'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
              🚀 Instant Crypto to INR
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Sell Crypto for{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                Instant INR
              </span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              Convert your cryptocurrencies to Indian Rupees instantly with the best market rates. 
              Fast, secure, and compliant with Indian regulations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                Start Selling Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="px-8">
                View Current Rates
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Current Rates Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Real-Time Selling Rates
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Our rates are updated every minute to ensure you get the best value for your crypto
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cryptoCurrencies.map((crypto) => (
              <Card key={crypto.symbol} className="border-2 hover:border-blue-300 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                        {crypto.logo}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{crypto.symbol}</h3>
                        <p className="text-sm text-gray-500">{crypto.name}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{crypto.rate}</p>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-green-500 text-sm font-medium">{crypto.change}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Why Sell with Blynk?
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Experience the most efficient way to convert crypto to INR
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                  <div className="text-blue-600 dark:text-blue-400">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              How to Sell Crypto for INR
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Simple 4-step process to convert your crypto to Indian Rupees
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4">
                    {step.step}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {step.description}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full">
                    <ArrowRight className="h-6 w-6 text-gray-400 mx-auto" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Compliance Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-white">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">
                  Secure & Compliant Platform
                </h2>
                <p className="text-blue-100 mb-6">
                  Your security is our priority. We're fully compliant with Indian regulations 
                  and use industry-leading security measures.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span>RBI & FIU-IND Compliant</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span>Bank-grade Security</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span>24/7 Transaction Monitoring</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span>Insurance Protected</span>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <Shield className="h-32 w-32 mx-auto text-blue-200 mb-4" />
                <p className="text-blue-100">
                  Licensed Virtual Asset Service Provider (VASP) in India
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Convert Your Crypto?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
            Join thousands of users who trust Blynk for fast and secure crypto-to-INR conversions
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8">
              Start Selling Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" className="px-8">
              <Smartphone className="mr-2 h-5 w-5" />
              Download Mobile App
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}