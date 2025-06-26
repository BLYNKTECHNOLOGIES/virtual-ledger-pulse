
import { Shield, Users, TrendingUp, CheckCircle, ArrowRight, Zap, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export function P2PTradingPage() {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Secure Trading",
      description: "Bank-grade security with multi-layer encryption and fraud detection"
    },
    {
      icon: Users,
      title: "Verified Users",
      description: "Complete KYC verification ensures trusted trading partners"
    },
    {
      icon: TrendingUp,
      title: "Real-time Rates",
      description: "Live market rates with competitive pricing"
    },
    {
      icon: Zap,
      title: "Instant Settlement",
      description: "Quick transaction processing and settlement"
    }
  ];

  const benefits = [
    "Zero trading fees for verified users",
    "24/7 customer support",
    "Multiple payment methods",
    "Regulatory compliant platform",
    "Advanced dispute resolution",
    "Mobile-first design"
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-orange-600 to-red-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-6xl font-bold mb-6">P2P Crypto Trading</h1>
            <p className="text-2xl text-orange-100 mb-8 max-w-3xl mx-auto">
              Trade cryptocurrencies directly with other users in a secure, regulated environment
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-orange-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/login')}
              >
                Start Trading
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-orange-600 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/vasp/kyc')}
              >
                Complete KYC
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">Why Choose Our P2P Platform?</h2>
            <p className="text-xl text-gray-600">Experience the future of cryptocurrency trading</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center">
                    <feature.icon className="h-8 w-8 text-orange-600" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 text-center">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Platform Benefits
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Our P2P trading platform offers comprehensive features designed for both beginners and experienced traders.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                    <span className="text-lg text-gray-700">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">Ready to Get Started?</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                  <span className="text-gray-700">Complete KYC verification</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                  <span className="text-gray-700">Fund your account</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
                  <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                  <span className="text-gray-700">Start trading</span>
                </div>
              </div>
              <Button 
                className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white py-3 text-lg"
                onClick={() => navigate('/website/login')}
              >
                Begin Trading Journey
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-12">
            <Lock className="h-16 w-16 mx-auto mb-6 text-orange-400" />
            <h2 className="text-4xl font-bold mb-6">Enterprise-Grade Security</h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Your assets and data are protected by industry-leading security measures and regulatory compliance.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <Globe className="h-12 w-12 mx-auto mb-4 text-orange-400" />
              <h3 className="text-xl font-semibold mb-2">Global Compliance</h3>
              <p className="text-gray-400">Adheres to international VASP regulations</p>
            </div>
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-orange-400" />
              <h3 className="text-xl font-semibold mb-2">Data Protection</h3>
              <p className="text-gray-400">Advanced encryption and secure storage</p>
            </div>
            <div className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-orange-400" />
              <h3 className="text-xl font-semibold mb-2">Verified Platform</h3>
              <p className="text-gray-400">Fully licensed and regulated operations</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
