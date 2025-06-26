
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Smartphone, 
  Tablet, 
  Monitor, 
  Code2, 
  Zap, 
  Shield,
  CheckCircle,
  ArrowRight,
  Apple,
  Play
} from 'lucide-react';

export function AppDevelopmentPage() {
  const platforms = [
    {
      icon: Apple,
      title: 'iOS Development',
      description: 'Native iOS apps built with Swift and SwiftUI for optimal performance',
      features: ['Native iOS Performance', 'App Store Guidelines', 'iPhone & iPad Support']
    },
    {
      icon: Play,
      title: 'Android Development',
      description: 'Native Android apps using Kotlin and modern Android architecture',
      features: ['Material Design', 'Google Play Store', 'All Android Devices']
    },
    {
      icon: Code2,
      title: 'Cross-Platform',
      description: 'Build once, deploy everywhere with Flutter and React Native',
      features: ['Cost Effective', 'Faster Development', 'Single Codebase']
    }
  ];

  const technologies = [
    { name: 'Flutter', category: 'Cross-Platform' },
    { name: 'React Native', category: 'Cross-Platform' },
    { name: 'Swift', category: 'iOS' },
    { name: 'SwiftUI', category: 'iOS' },
    { name: 'Kotlin', category: 'Android' },
    { name: 'Java', category: 'Android' },
    { name: 'Firebase', category: 'Backend' },
    { name: 'Node.js', category: 'Backend' }
  ];

  const appTypes = [
    {
      icon: Smartphone,
      title: 'Mobile Apps',
      description: 'Consumer and business mobile applications',
      examples: ['E-commerce Apps', 'Social Media', 'Productivity Tools']
    },
    {
      icon: Tablet,
      title: 'Tablet Apps',
      description: 'Optimized experiences for tablet devices',
      examples: ['Educational Apps', 'Creative Tools', 'Enterprise Solutions']
    },
    {
      icon: Monitor,
      title: 'Desktop Apps',
      description: 'Cross-platform desktop applications',
      examples: ['Business Software', 'Media Tools', 'System Utilities']
    }
  ];

  const process = [
    { step: '01', title: 'Discovery & Planning', description: 'We analyze your requirements and create a detailed project roadmap' },
    { step: '02', title: 'UI/UX Design', description: 'Design intuitive and engaging user interfaces for your app' },
    { step: '03', title: 'Development', description: 'Build your app using modern technologies and best practices' },
    { step: '04', title: 'Testing & QA', description: 'Rigorous testing to ensure your app works flawlessly' },
    { step: '05', title: 'Launch & Support', description: 'Deploy to app stores and provide ongoing maintenance' }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-6 bg-purple-100 text-purple-700 hover:bg-purple-200">
              📱 Mobile & Desktop App Development
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Build Amazing{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Applications
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              From mobile apps to desktop software, we create powerful applications 
              that engage users and drive business growth across all platforms.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
                Start Your Project
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-2">
                View Portfolio
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Platforms Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Multi-Platform Development
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We develop applications for all major platforms and devices
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {platforms.map((platform, index) => (
              <Card key={index} className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-6">
                    <platform.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {platform.title}
                  </h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {platform.description}
                  </p>
                  <ul className="space-y-2">
                    {platform.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm text-gray-600">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* App Types Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Application Types
            </h2>
            <p className="text-xl text-gray-600">
              We create applications for every need and platform
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {appTypes.map((type, index) => (
              <Card key={index} className="bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-6">
                    <type.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {type.title}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {type.description}
                  </p>
                  <div className="space-y-2">
                    {type.examples.map((example, idx) => (
                      <div key={idx} className="text-sm text-blue-600 font-medium">
                        • {example}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Technologies Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Technologies We Use
            </h2>
            <p className="text-xl text-gray-600">
              Cutting-edge tools and frameworks for robust applications
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {technologies.map((tech, index) => (
              <div key={index} className="text-center p-6 bg-white/70 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="text-lg font-bold text-gray-900 mb-2">{tech.name}</div>
                <div className="text-sm text-blue-600">{tech.category}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Our Development Process
            </h2>
            <p className="text-xl text-gray-600">
              A proven approach to deliver exceptional applications
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {process.map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-lg">{item.step}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <Zap className="h-8 w-8 text-yellow-300 mr-3" />
            <Shield className="h-8 w-8 text-green-300" />
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Build Your App?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Let's discuss your app idea and turn it into a successful application
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Start Development
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg">
              Get Consultation
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
