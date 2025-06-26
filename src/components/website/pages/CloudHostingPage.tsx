
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Cloud, 
  Server, 
  Shield, 
  Zap, 
  Globe, 
  Lock,
  CheckCircle,
  ArrowRight,
  Database,
  Gauge,
  Users
} from 'lucide-react';

export function CloudHostingPage() {
  const hostingPlans = [
    {
      name: 'Shared Hosting',
      price: '$9.99',
      period: '/month',
      description: 'Perfect for small websites and blogs',
      features: [
        '10GB SSD Storage',
        '100GB Bandwidth',
        'Free SSL Certificate',
        '24/7 Support',
        'cPanel Access',
        '99.9% Uptime Guarantee'
      ],
      popular: false
    },
    {
      name: 'VPS Hosting',
      price: '$29.99',
      period: '/month',
      description: 'Scalable virtual private servers',
      features: [
        '50GB SSD Storage',
        'Unlimited Bandwidth',
        'Root Access',
        'Free SSL Certificate',
        'Daily Backups',
        '99.99% Uptime SLA'
      ],
      popular: true
    },
    {
      name: 'Cloud Hosting',
      price: '$79.99',
      period: '/month',
      description: 'Enterprise-grade cloud infrastructure',
      features: [
        '200GB SSD Storage',
        'Unlimited Bandwidth',
        'Auto-Scaling',
        'Load Balancing',
        'Advanced Security',
        'Dedicated Support'
      ],
      popular: false
    }
  ];

  const cloudServices = [
    {
      icon: Server,
      title: 'Cloud Infrastructure',
      description: 'Scalable cloud servers with auto-scaling capabilities',
      features: ['Auto-scaling', 'Load Balancing', 'High Availability']
    },
    {
      icon: Database,
      title: 'Database Services',
      description: 'Managed database solutions with automated backups',
      features: ['MySQL', 'PostgreSQL', 'MongoDB']
    },
    {
      icon: Shield,
      title: 'Security & Monitoring',
      description: 'Advanced security measures and 24/7 monitoring',
      features: ['DDoS Protection', 'SSL Certificates', 'Real-time Monitoring']
    },
    {
      icon: Globe,
      title: 'CDN & Performance',
      description: 'Global content delivery network for faster loading',
      features: ['Global CDN', 'Caching', 'Performance Optimization']
    }
  ];

  const features = [
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'SSD storage and optimized servers for maximum speed'
    },
    {
      icon: Shield,
      title: 'Secure & Reliable',
      description: '99.99% uptime with enterprise-grade security measures'
    },
    {
      icon: Users,
      title: '24/7 Support',
      description: 'Round-the-clock technical support from our experts'
    },
    {
      icon: Gauge,
      title: 'Performance Monitoring',
      description: 'Real-time monitoring and performance analytics'
    },
    {
      icon: Lock,
      title: 'Data Protection',
      description: 'Automated backups and disaster recovery solutions'
    },
    {
      icon: Cloud,
      title: 'Scalable Solutions',
      description: 'Easily scale resources up or down based on your needs'
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-6 bg-cyan-100 text-cyan-700 hover:bg-cyan-200">
              ☁️ Cloud & Hosting Solutions
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Reliable Cloud{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Infrastructure
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Secure, scalable, and high-performance hosting solutions for your websites 
              and applications. From shared hosting to enterprise cloud infrastructure.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
                Get Started Today
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-2">
                Compare Plans
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Hosting Plans Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Hosting Plans
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the perfect hosting solution for your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {hostingPlans.map((plan, index) => (
              <Card key={index} className={`relative bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${plan.popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <p className="text-gray-600 mb-4">{plan.description}</p>
                    <div className="text-4xl font-bold text-blue-600 mb-1">
                      {plan.price}
                      <span className="text-lg text-gray-500 font-normal">{plan.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className={`w-full ${plan.popular 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    Choose Plan
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Cloud Services Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Cloud Services
            </h2>
            <p className="text-xl text-gray-600">
              Enterprise-grade cloud solutions for modern businesses
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {cloudServices.map((service, index) => (
              <Card key={index} className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <service.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {service.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                    {service.description}
                  </p>
                  <ul className="space-y-1">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="text-xs text-blue-600 font-medium">
                        • {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Why Choose Our Hosting?
            </h2>
            <p className="text-xl text-gray-600">
              Premium features for optimal performance and reliability
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Migration Section */}
      <section className="py-20 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Free Website Migration
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Switch to our hosting with zero downtime. Our experts will migrate 
              your website for free, ensuring a smooth transition.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Zero Downtime</h3>
                <p className="text-gray-600 text-sm">Your site stays online during migration</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Expert Support</h3>
                <p className="text-gray-600 text-sm">Our team handles everything for you</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Data Security</h3>
                <p className="text-gray-600 text-sm">Your data is safe and secure</p>
              </div>
            </div>
            <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
              Start Free Migration
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Launch Your Website?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Get started with our reliable hosting solutions today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Choose Your Plan
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
