
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { 
  ArrowRight,
  Code2, 
  Search, 
  Smartphone, 
  Cloud, 
  Settings, 
  Shield,
  Star,
  Users,
  Zap,
  CheckCircle,
  Cpu,
  Database,
  Globe
} from 'lucide-react';

export function HomePage() {
  const categories = [
    'AI & ML', 'Blockchain', 'Android', 'FinTech', 'Enterprise App', 'Artificial Intelligence',
    'Data Analytics', 'Dating', 'Design Experience', 'DevOps', 'Digital Transformation', 'eCommerce', 'Education',
    'Events', 'Fintech', 'Fitness', 'Flutter', 'Food', 'Gaming', 'Healthcare', 'Insights', 'Insurance',
    'Internet Of Things (IoT)', 'iOS', 'Logistics', 'Mobile App', 'PWA', 'React Native', 'Real Estate', 'Social Media',
    'Software Development', 'Staff Augmentation', 'Technology', 'Testing', 'Travel', 'UX/UI', 'Web', 'Xamarin'
  ];

  const services = [
    {
      icon: Code2,
      title: 'AI & ML',
      subtitle: 'Solutions',
      items: [
        { name: 'Artificial Intelligence', desc: 'Innovating businesses with digital technologies' },
        { name: 'Agentic AI', desc: 'Elevate your experience with AI services' },
        { name: 'Natural Language Processing', desc: 'Advanced NLP solutions for enterprises' },
        { name: 'Custom LLM Development', desc: 'Precision LLM development for enterprises' },
        { name: 'Data Analytics', desc: 'Transforming raw data into insights' },
        { name: 'Microsoft Fabric Consulting', desc: 'Data strategy, implementation, and ongoing support to maximize your data\'s value.' }
      ]
    },
    {
      icon: Cloud,
      title: 'Cloud & DevSecOps',
      subtitle: 'Infrastructure',
      items: [
        { name: 'GEN AI', desc: 'Unleashing a New Era of innovation' },
        { name: 'ML Application Development', desc: 'Automating processes for increased efficiency' },
        { name: 'Retrieval Augmented Generation', desc: 'Enhancing LLMs with external knowledge' },
        { name: 'ChatBot Development', desc: 'Handling multiple queries simultaneously' },
        { name: 'Business Intelligence', desc: 'Visualizing trends for better forecasting' }
      ]
    },
    {
      icon: Smartphone,
      title: 'IoT & Custom Software',
      subtitle: 'Development',
      items: []
    },
    {
      icon: Globe,
      title: 'Mobile App',
      subtitle: 'Development',
      items: []
    },
    {
      icon: Settings,
      title: 'Web & Backend',
      subtitle: 'Solutions',
      items: []
    },
    {
      icon: Cpu,
      title: 'Design & Consulting',
      subtitle: 'Services',
      items: []
    },
    {
      icon: Database,
      title: 'Enterprise Solution',
      subtitle: 'Development',
      items: []
    }
  ];

  const engagementModes = [
    {
      title: 'Staff Augmentation',
      description: 'Top IT talent on your terms: Dedicated, Hourly, or Flexible',
      icon: Users
    },
    {
      title: 'Project Based',
      description: 'Project Success, Simplified',
      icon: CheckCircle
    }
  ];

  const featuredContent = [
    {
      category: 'ARTIFICIAL INTELLIGENCE',
      title: 'Cloud Computing for Small and Medium Size Businesses',
      description: 'The main problem of many small and mid size businesses is maintaining the balance between growth ambitions with budget constraints....',
      author: 'Ritosubhra Mukherjee',
      date: 'June 26, 2025',
      color: 'from-orange-400 to-yellow-500',
      latest: true
    },
    {
      category: 'CLOUD',
      title: 'Reducing Cloud Carbon Footprint: Strategies for Businesses',
      description: 'Guide to sustainable cloud practices for environmentally conscious businesses',
      author: 'Ritosubhra Mukherjee',
      date: 'June 23, 2025',
      color: 'from-green-400 to-teal-500'
    },
    {
      category: 'MOBILE DEVELOPMENT', 
      title: 'Machine Learning Integration in Mobile Apps',
      description: 'Use the power of AI to make your mobile app smarter and more innovative...',
      author: 'Tech Team',
      date: 'June 20, 2025',
      color: 'from-purple-400 to-pink-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Hero Section */}
      <section className="relative py-12 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Empowering your business with{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                digital excellence
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Incubating a culture of innovation & creativity
            </p>
          </div>

          {/* Category Tags */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {categories.map((category, index) => (
              <Badge 
                key={index} 
                variant="outline" 
                className="px-3 py-1 text-sm bg-white/70 hover:bg-blue-100 cursor-pointer transition-colors"
              >
                {category}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Sidebar - Services */}
            <div className="lg:col-span-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Services</h2>
              <p className="text-gray-600 mb-8">Incubating a culture of innovation & creativity</p>
              
              <div className="space-y-4">
                {services.map((service, index) => (
                  <div key={index} className="flex items-center space-x-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <service.icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{service.title}</div>
                      {service.subtitle && (
                        <div className="text-sm text-gray-500">{service.subtitle}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Center Content - Featured Articles */}
            <div className="lg:col-span-2">
              <div className="space-y-6">
                {featuredContent.map((content, index) => (
                  <Card key={index} className={`overflow-hidden bg-gradient-to-r ${content.color} text-white relative`}>
                    <CardContent className="p-8">
                      {content.latest && (
                        <div className="flex items-center mb-4">
                          <span className="text-orange-200 mr-2">🔥</span>
                          <span className="text-sm font-medium">Latest</span>
                        </div>
                      )}
                      <Badge className="mb-4 bg-white/20 text-white hover:bg-white/30">
                        {content.category}
                      </Badge>
                      <h3 className="text-2xl font-bold mb-4">{content.title}</h3>
                      <p className="text-white/90 mb-6 leading-relaxed">{content.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-white/80">
                          {content.author} | {content.date}
                        </div>
                        <Button variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900">
                          Read More
                        </Button>
                      </div>
                      <div className="absolute bottom-4 right-4 opacity-10">
                        <div className="text-6xl font-bold">BLYNK</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Right Sidebar - Engagement Modes */}
            <div className="lg:col-span-1">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Engagement Mode</h3>
              <p className="text-gray-600 mb-6">Your Success is Our Code</p>
              
              <div className="space-y-4">
                {engagementModes.map((mode, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                      <mode.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 mb-2">{mode.title}</h4>
                      <p className="text-sm text-gray-600">{mode.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Detail Section */}
      <section className="py-16 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Solutions</h2>
              <div className="space-y-6">
                {services[0].items.map((item, index) => (
                  <div key={index} className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{item.name}</h4>
                    <p className="text-gray-600 text-sm">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold text-Gray-900 mb-8">AI Services</h2>
              <div className="space-y-6">
                {services[1].items.map((item, index) => (
                  <div key={index} className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{item.name}</h4>
                    <p className="text-gray-600 text-sm">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Let's discuss how we can help you achieve your digital goals
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Contact Us
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              View Portfolio
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
