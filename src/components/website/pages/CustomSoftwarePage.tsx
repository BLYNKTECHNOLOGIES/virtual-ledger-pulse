
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Code2, 
  Settings, 
  Database, 
  Users, 
  BarChart3, 
  Cog,
  CheckCircle,
  ArrowRight,
  Layers,
  Globe,
  Lock,
  Zap
} from 'lucide-react';

export function CustomSoftwarePage() {
  const solutions = [
    {
      icon: BarChart3,
      title: 'Enterprise Resource Planning (ERP)',
      description: 'Comprehensive ERP solutions to streamline your business operations',
      features: ['Inventory Management', 'Financial Tracking', 'HR Management', 'Reporting & Analytics']
    },
    {
      icon: Users,
      title: 'Customer Relationship Management (CRM)',
      description: 'Custom CRM systems to manage customer relationships effectively',
      features: ['Lead Management', 'Sales Pipeline', 'Customer Support', 'Analytics Dashboard']
    },
    {
      icon: Database,
      title: 'Custom Dashboards',
      description: 'Interactive dashboards for data visualization and business insights',
      features: ['Real-time Data', 'Custom Widgets', 'Multi-user Access', 'Export Capabilities']
    },
    {
      icon: Settings,
      title: 'Business Process Automation',
      description: 'Automate repetitive tasks and streamline workflows',
      features: ['Workflow Automation', 'Task Scheduling', 'Integration APIs', 'Performance Monitoring']
    }
  ];

  const technologies = [
    { name: 'React', category: 'Frontend', color: 'bg-blue-100 text-blue-700' },
    { name: 'Node.js', category: 'Backend', color: 'bg-green-100 text-green-700' },
    { name: 'Python', category: 'Backend', color: 'bg-yellow-100 text-yellow-700' },
    { name: 'PostgreSQL', category: 'Database', color: 'bg-indigo-100 text-indigo-700' },
    { name: 'MongoDB', category: 'Database', color: 'bg-green-100 text-green-700' },
    { name: 'Supabase', category: 'Backend', color: 'bg-emerald-100 text-emerald-700' },
    { name: 'AWS', category: 'Cloud', color: 'bg-orange-100 text-orange-700' },
    { name: 'Docker', category: 'DevOps', color: 'bg-blue-100 text-blue-700' }
  ];

  const process = [
    {
      step: '01',
      title: 'Requirements Analysis',
      description: 'We analyze your business needs and define project requirements',
      icon: Users
    },
    {
      step: '02',
      title: 'System Design',
      description: 'Create comprehensive system architecture and design documents',
      icon: Layers
    },
    {
      step: '03',
      title: 'Development',
      description: 'Build your custom software using modern technologies',
      icon: Code2
    },
    {
      step: '04',
      title: 'Testing & QA',
      description: 'Rigorous testing to ensure quality and performance',
      icon: CheckCircle
    },
    {
      step: '05',
      title: 'Deployment',
      description: 'Deploy and configure your software in production environment',
      icon: Globe
    },
    {
      step: '06',
      title: 'Support & Maintenance',
      description: 'Ongoing support and regular updates to keep your software running smoothly',
      icon: Settings
    }
  ];

  const benefits = [
    {
      icon: Zap,
      title: 'Increased Efficiency',
      description: 'Automate processes and reduce manual work'
    },
    {
      icon: Lock,
      title: 'Enhanced Security',
      description: 'Built-in security measures to protect your data'
    },
    {
      icon: Settings,
      title: 'Scalable Solutions',
      description: 'Software that grows with your business'
    },
    {
      icon: BarChart3,
      title: 'Better Insights',
      description: 'Data-driven decisions with comprehensive analytics'
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-indigo-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-6 bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
              ⚙️ Custom Software Development
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Tailored Software{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Solutions
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Custom software development that fits your unique business needs. 
              From ERP systems to CRM solutions, we build software that drives growth.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg">
                Start Your Project
              </Button>
              <Button size="lg" variant="outline" className="px-8 py-4 text-lg border-2">
                View Case Studies
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Custom Software Solutions
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We develop software solutions tailored to your specific business requirements
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {solutions.map((solution, index) => (
              <Card key={index} className="h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-2 bg-white/70 backdrop-blur-sm border-0 shadow-lg">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-6">
                    <solution.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {solution.title}
                  </h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {solution.description}
                  </p>
                  <ul className="space-y-2">
                    {solution.features.map((feature, idx) => (
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

      {/* Technologies Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Technologies We Use
            </h2>
            <p className="text-xl text-gray-600">
              Modern tech stack for robust and scalable software solutions
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {technologies.map((tech, index) => (
              <div key={index} className="text-center p-6 bg-white/70 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="text-lg font-bold text-gray-900 mb-2">{tech.name}</div>
                <Badge className={tech.color}>
                  {tech.category}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Development Process Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Our Development Process
            </h2>
            <p className="text-xl text-gray-600">
              A structured approach to deliver high-quality custom software
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {process.map((item, index) => (
              <Card key={index} className="bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mr-4">
                      <span className="text-white font-bold text-sm">{item.step}</span>
                    </div>
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <item.icon className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              Why Choose Custom Software?
            </h2>
            <p className="text-xl text-gray-600">
              Benefits of custom software development for your business
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <benefit.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{benefit.title}</h3>
                <p className="text-gray-600">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Seamless Integration
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Our custom software solutions integrate seamlessly with your existing 
                systems and workflows, ensuring minimal disruption to your operations.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">API Integration with existing systems</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Data migration and synchronization</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Third-party service integration</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                  <span className="text-gray-700">Cloud platform compatibility</span>
                </li>
              </ul>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                Discuss Integration
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg p-6">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Database Integration</h3>
                <p className="text-sm text-gray-600">Connect with your existing databases</p>
              </Card>
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg p-6">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Globe className="h-5 w-5 text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">API Connectivity</h3>
                <p className="text-sm text-gray-600">Seamless API integrations</p>
              </Card>
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg p-6">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Cog className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">System Automation</h3>
                <p className="text-sm text-gray-600">Automate business processes</p>
              </Card>
              <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-lg p-6">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <Lock className="h-5 w-5 text-orange-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Secure Access</h3>
                <p className="text-sm text-gray-600">Enterprise-grade security</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Build Your Custom Software?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Let's discuss your requirements and create a solution that perfectly fits your business needs
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 text-lg">
              Start Your Project
              <ArrowRight className="ml-2 h-4 w-4" />
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
