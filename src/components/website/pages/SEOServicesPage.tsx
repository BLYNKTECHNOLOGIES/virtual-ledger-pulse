
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  TrendingUp, 
  Target, 
  BarChart3, 
  Globe, 
  Users,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

export function SEOServicesPage() {
  const packages = [
    {
      name: 'Basic SEO',
      price: '$299',
      period: '/month',
      features: [
        'Keyword Research & Analysis',
        'On-Page SEO Optimization',
        'Google My Business Setup',
        'Monthly Progress Reports',
        'Basic Link Building'
      ],
      popular: false
    },
    {
      name: 'Standard SEO',
      price: '$599',
      period: '/month',
      features: [
        'Everything in Basic',
        'Advanced Keyword Strategy',
        'Content Creation & Optimization',
        'Technical SEO Audit',
        'Local SEO Optimization',
        'Competitor Analysis'
      ],
      popular: true
    },
    {
      name: 'Advanced SEO',
      price: '$999',
      period: '/month',
      features: [
        'Everything in Standard',
        'Enterprise SEO Strategy',
        'Advanced Link Building',
        'E-commerce SEO',
        'Multi-location SEO',
        'Dedicated SEO Manager'
      ],
      popular: false
    }
  ];

  const results = [
    { metric: '150%', label: 'Average Traffic Increase' },
    { metric: '85%', label: 'First Page Rankings' },
    { metric: '200+', label: 'Keywords Ranked' },
    { metric: '95%', label: 'Client Retention Rate' }
  ];

  const services = [
    {
      icon: Search,
      title: 'Keyword Research',
      description: 'In-depth analysis to identify high-value keywords for your business'
    },
    {
      icon: TrendingUp,
      title: 'On-Page Optimization',
      description: 'Optimize your website content and structure for better rankings'
    },
    {
      icon: Target,
      title: 'Local SEO',
      description: 'Dominate local search results and attract nearby customers'
    },
    {
      icon: BarChart3,
      title: 'Analytics & Reporting',
      description: 'Detailed insights and progress tracking with monthly reports'
    },
    {
      icon: Globe,
      title: 'Technical SEO',
      description: 'Fix technical issues that prevent your site from ranking well'
    },
    {
      icon: Users,
      title: 'Link Building',
      description: 'Build high-quality backlinks to increase your domain authority'
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-6 bg-green-100 text-green-700 hover:bg-green-200">
              🚀 Results-Driven SEO Services
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Boost Your Online{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Visibility
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Get more traffic, leads, and sales with our proven SEO strategies. 
              We help businesses rank higher on search engines and dominate their market.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
                Get SEO Audit
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-2">
                View Case Studies
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="py-16 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Proven Results
            </h2>
            <p className="text-xl text-gray-600">
              Our SEO strategies deliver measurable growth
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {results.map((result, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl lg:text-5xl font-bold text-blue-600 mb-2">
                  {result.metric}
                </div>
                <div className="text-gray-600 font-medium">
                  {result.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Our SEO Services
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive SEO solutions to improve your search rankings
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-6">
                    <service.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {service.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {service.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              SEO Packages
            </h2>
            <p className="text-xl text-gray-600">
              Choose the perfect SEO package for your business needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {packages.map((pkg, index) => (
              <Card key={index} className={`relative bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${pkg.popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}>
                {pkg.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                    <div className="text-4xl font-bold text-blue-600 mb-1">
                      {pkg.price}
                      <span className="text-lg text-gray-500 font-normal">{pkg.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-8">
                    {pkg.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className={`w-full ${pkg.popular 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Dominate Search Results?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Get a free SEO audit and discover how we can boost your rankings
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Get Free SEO Audit
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Schedule Consultation
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
