
import { Smartphone, Users, Shield, Wrench, Zap, Headphones, CheckCircle, Code, Database, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';

export function AppDevelopmentPage() {
  const appServices = [
    {
      icon: Smartphone,
      title: "📱 iOS App Development",
      description: "Native apps built using Swift & Objective-C, seamless performance on iPhone & iPad, App Store deployment & compliance"
    },
    {
      icon: Smartphone,
      title: "🤖 Android App Development", 
      description: "Kotlin/Java-based native apps, optimized for all Android devices, Google Play Store publishing support"
    },
    {
      icon: Code,
      title: "🔁 Cross-Platform App Development",
      description: "Flutter, React Native, or Xamarin based apps, code once deploy everywhere (iOS & Android), faster time to market"
    },
    {
      icon: Users,
      title: "🧠 App Consulting & Prototyping",
      description: "Wireframes, user journeys & UI/UX, feasibility analysis and tech stack consultation, proof of concept (PoC) design"
    },
    {
      icon: Shield,
      title: "🔒 App Security & Compliance",
      description: "Biometric and 2FA integration, GDPR & HIPAA-compliant architecture, secure API & encrypted data storage" 
    },
    {
      icon: Wrench,
      title: "📦 App Maintenance & Upgrades",
      description: "Continuous support & performance tuning, OS version updates & bug fixes, feature upgrades & analytics tracking"
    }
  ];

  const techStack = {
    frontend: ["React Native", "Flutter", "Swift", "Kotlin"],
    backend: ["Node.js", "Firebase", "Python", "AWS", "Supabase"],
    databases: ["PostgreSQL", "MongoDB", "MySQL"],
    devops: ["Docker", "GitHub Actions", "CI/CD Pipelines"]
  };

  const whyChooseUs = [
    { icon: Users, title: "In-house UI/UX + Engineering Teams" },
    { icon: Zap, title: "Agile methodology with sprint-based delivery" },
    { icon: Code, title: "Full-cycle development from ideation to publishing" },
    { icon: Headphones, title: "24/7 Support & Dedicated Account Managers" },
    { icon: CheckCircle, title: "Affordable pricing with enterprise-grade quality" }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-900 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">📱 Powerful App Development Services for a Mobile-First World</h1>
            <p className="text-xl text-purple-100 max-w-4xl mx-auto mb-8">
              At Blynk Virtual Technologies Pvt. Ltd., we design and develop feature-rich, intuitive, and scalable mobile applications 
              that help you engage your users and grow your business. Whether you're a startup or an enterprise—we build apps that perform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/website/contact">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg">
                  Get Free Consultation
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-purple-700 px-8 py-4 text-lg">
                View Portfolio
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Tabs */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🔧 Our Mobile App Development Offerings</h2>
            <p className="text-xl text-gray-600">Comprehensive app development solutions for every platform</p>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="android">Android</TabsTrigger>
              <TabsTrigger value="ios">iOS</TabsTrigger>
              <TabsTrigger value="cross-platform">Cross-Platform</TabsTrigger>
              <TabsTrigger value="uiux">UI/UX Design</TabsTrigger>
              <TabsTrigger value="backend">Backend API</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-8">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {appServices.map((service, index) => (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <service.icon className="h-12 w-12 text-blue-600 mb-4" />
                      <CardTitle className="text-xl">{service.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-gray-600">
                        {service.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="android" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">🤖 Android Development</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• Kotlin/Java-based native apps</li>
                    <li>• Material Design implementation</li>
                    <li>• Optimized for all Android devices</li>
                    <li>• Google Play Store publishing support</li>
                    <li>• Integration with Google services</li>
                    <li>• Performance optimization</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop"
                    alt="Android Development"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ios" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">📱 iOS Development</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• Native apps built using Swift & Objective-C</li>
                    <li>• Human Interface Guidelines compliance</li>
                    <li>• Seamless performance on iPhone & iPad</li>
                    <li>• App Store deployment & compliance</li>
                    <li>• Integration with Apple services</li>
                    <li>• Optimized for latest iOS versions</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop"
                    alt="iOS Development"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="cross-platform" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">🔁 Cross-Platform Development</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• Flutter, React Native, or Xamarin based apps</li>
                    <li>• Code once, deploy everywhere (iOS & Android)</li>
                    <li>• Faster time to market</li>
                    <li>• Cost-effective solution</li>
                    <li>• Native performance</li>
                    <li>• Shared codebase maintenance</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1551650975-87deedd944c3?w=400&h=300&fit=crop"
                    alt="Cross-Platform Development"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="uiux" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">🎨 App UI/UX Design</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• Wireframes and user journey mapping</li>
                    <li>• Interactive prototypes</li>
                    <li>• User-centered design approach</li>
                    <li>• Accessibility compliance</li>
                    <li>• Design system creation</li>
                    <li>• Usability testing</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=400&h=300&fit=crop"
                    alt="UI/UX Design"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="backend" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">⚙️ Backend API Development</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• RESTful API design and development</li>
                    <li>• Database design and optimization</li>
                    <li>• Cloud hosting and deployment</li>
                    <li>• Authentication and authorization</li>
                    <li>• Real-time features</li>
                    <li>• API documentation</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=300&fit=crop"
                    alt="Backend Development"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="maintenance" className="mt-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold mb-4">🔧 App Maintenance & Upgrades</h3>
                  <ul className="space-y-3 text-gray-700">
                    <li>• Continuous support & performance tuning</li>
                    <li>• OS version updates & bug fixes</li>
                    <li>• Feature upgrades & enhancements</li>
                    <li>• Analytics tracking and reporting</li>
                    <li>• Security updates</li>
                    <li>• 24/7 monitoring</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg">
                  <img 
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop"
                    alt="App Maintenance"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🛠 Tech Stack We Work With</h2>
            <p className="text-xl text-gray-600">Cutting-edge technologies for modern app development</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card>
              <CardHeader>
                <Code className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle>Frontend</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {techStack.frontend.map((tech, index) => (
                    <li key={index} className="text-gray-600">{tech}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Database className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle>Backend</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {techStack.backend.map((tech, index) => (
                    <li key={index} className="text-gray-600">{tech}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Database className="h-8 w-8 text-purple-600 mb-2" />
                <CardTitle>Databases</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {techStack.databases.map((tech, index) => (
                    <li key={index} className="text-gray-600">{tech}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Cloud className="h-8 w-8 text-orange-600 mb-2" />
                <CardTitle>DevOps</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {techStack.devops.map((tech, index) => (
                    <li key={index} className="text-gray-600">{tech}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">💡 Why Choose Blynk for App Development?</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="text-center">
                <item.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">🚀 Let's Build the Next Big App—Together</h2>
          <p className="text-xl text-purple-100 mb-8">
            Whether you need a simple MVP or a robust enterprise app, our team is ready to help you build smarter.
          </p>
          <p className="text-lg text-purple-100 mb-8">Get in touch for a free consultation & roadmap today!</p>
          <Link to="/website/contact">
            <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg">
              Start Your App Journey
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
