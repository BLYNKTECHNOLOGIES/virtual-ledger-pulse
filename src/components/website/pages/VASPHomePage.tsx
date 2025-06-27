
import { Shield, Users, TrendingUp, CheckCircle, ArrowRight, Zap, Lock, Globe, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export function VASPHomePage() {
  const navigate = useNavigate();

  const stats = [
    {
      icon: Users,
      number: "18+",
      text: "Months of Experience",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: CheckCircle,
      number: "100+",
      text: "Happy Clients",
      color: "from-green-500 to-green-600"
    },
    {
      icon: TrendingUp,
      number: "99.9%",
      text: "Uptime",
      color: "from-purple-500 to-purple-600"
    },
    {
      icon: Globe,
      number: "20+",
      text: "Different Services",
      color: "from-orange-500 to-orange-600"
    }
  ];

  const services = [
    {
      icon: CreditCard,
      title: "P2P Trading Platform",
      description: "Secure peer-to-peer cryptocurrency trading with escrow protection and real-time verification.",
      features: ["Secure Escrow", "Real-time Verification", "Multiple Payment Methods", "24/7 Support"],
      link: "/website/vasp/p2p-trading"
    },
    {
      icon: Shield,
      title: "KYC Verification Services",
      description: "Comprehensive Know Your Customer verification with advanced document authentication.",
      features: ["Document Verification", "Biometric Authentication", "Real-time Processing", "Compliance Ready"],
      link: "/website/vasp/kyc"
    },
    {
      icon: Lock,
      title: "Security & Compliance",
      description: "Enterprise-grade security measures and regulatory compliance solutions.",
      features: ["End-to-end Encryption", "Regulatory Compliance", "Risk Management", "Audit Trails"],
      link: "/website/vasp/security"
    },
    {
      icon: Zap,
      title: "Digital Asset Management",
      description: "Complete digital asset lifecycle management with advanced portfolio tools.",
      features: ["Portfolio Management", "Asset Tracking", "Performance Analytics", "Risk Assessment"],
      link: "/website/vasp/compliance"
    }
  ];

  const testimonials = [
    {
      name: "Rajesh Kumar",
      role: "Crypto Trader",
      company: "IndiaTrading Co.",
      content: "The P2P platform is incredibly secure and user-friendly. I've completed over 200 trades without any issues.",
      rating: 5
    },
    {
      name: "Priya Sharma",
      role: "Compliance Officer",
      company: "FinTech Solutions",
      content: "Their KYC verification process is thorough and efficient. It helped us achieve full regulatory compliance.",
      rating: 5
    },
    {
      name: "Amit Patel",
      role: "Business Owner",
      company: "Digital Assets Ltd.",
      content: "Outstanding service and support. The team is knowledgeable and always available when needed.",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Hero Section */}
      <section className="relative text-white py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 via-red-600/20 to-orange-700/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-blue-400 mr-3" />
              <span className="text-blue-300 font-medium">SECURE & RELIABLE</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              India's Trusted Virtual Asset Service Provider
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
              KYC-powered, AML-compliant P2P and Digital Asset Services by Blynk Virtual Technologies
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 px-10 py-4 text-xl rounded-full shadow-lg"
                onClick={() => navigate('/website/vasp/kyc-form')}
              >
                Start KYC
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-slate-900 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/vasp/p2p-trading')}
              >
                Start Trading
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className={`mx-auto mb-2 p-2 bg-gradient-to-r ${stat.color} rounded-full w-12 h-12 flex items-center justify-center`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-2xl font-bold text-white">{stat.number}</div>
                  <div className="text-blue-200 text-sm">{stat.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">Our VASP Services</h2>
            <p className="text-xl text-slate-300">Comprehensive digital asset services for individuals and businesses</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="bg-slate-700 border-0 hover:bg-slate-600 transition-all duration-300 cursor-pointer" onClick={() => navigate(service.link)}>
                <CardHeader>
                  <div className="flex items-center mb-4">
                    <div className="bg-orange-600 p-3 rounded-lg mr-4">
                      <service.icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-white">{service.title}</CardTitle>
                  </div>
                  <CardDescription className="text-slate-300 text-lg">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center text-slate-400">
                        <CheckCircle className="h-4 w-4 text-green-400 mr-2 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full mt-6 bg-orange-600 hover:bg-orange-700" onClick={() => navigate(service.link)}>
                    Learn More
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">Client Success Stories</h2>
            <p className="text-xl text-slate-300">See what our clients say about our VASP services</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-slate-800 border-0">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <div key={i} className="text-yellow-400 text-xl">★</div>
                    ))}
                  </div>
                  <p className="text-slate-300 mb-4 italic">"{testimonial.content}"</p>
                  <div className="border-t border-slate-600 pt-4">
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-slate-400 text-sm">{testimonial.role}</div>
                    <div className="text-slate-500 text-sm">{testimonial.company}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-orange-600 to-red-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-orange-200 mr-3" />
            <span className="text-orange-200 font-medium">START YOUR JOURNEY TODAY</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">Ready to Experience Secure Digital Asset Services?</h2>
          <p className="text-xl mb-10">
            Join thousands of users who trust our platform for their digital asset needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-orange-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/vasp/kyc-form')}
            >
              Complete KYC Now
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-orange-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Contact Us
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
