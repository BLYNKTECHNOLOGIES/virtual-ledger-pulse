
import { Code, Palette, Smartphone as Mobile, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WebDevelopmentPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 to-indigo-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">Web Design & Development</h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto">
              Create stunning, responsive websites that drive engagement and conversion with our comprehensive web development services.
            </p>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Development Process</h2>
            <p className="text-xl text-gray-600">From concept to launch, we follow a proven methodology</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { title: 'Wireframes', description: 'Strategic planning and user experience mapping', icon: '01' },
              { title: 'Prototypes', description: 'Interactive mockups and design validation', icon: '02' },
              { title: 'Development', description: 'Clean, scalable code implementation', icon: '03' },
              { title: 'Launch', description: 'Testing, optimization, and deployment', icon: '04' }
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {step.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Technology Stack</h2>
            <p className="text-xl text-gray-600">We use cutting-edge technologies to build modern web applications</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { name: 'React & Next.js', description: 'Modern JavaScript frameworks for interactive UIs', icon: Code },
              { name: 'Tailwind CSS', description: 'Utility-first CSS framework for rapid styling', icon: Palette },
              { name: 'Responsive Design', description: 'Mobile-first approach for all device types', icon: Mobile },
              { name: 'Progressive Web Apps', description: 'App-like experiences on the web', icon: Globe }
            ].map((tech, index) => (
              <div key={index} className="bg-white p-8 rounded-xl shadow-lg text-center">
                <tech.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{tech.name}</h3>
                <p className="text-gray-600">{tech.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Showcase */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Recent Projects</h2>
            <p className="text-xl text-gray-600">Showcasing our latest web development work</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
                <img 
                  src={`https://images.unsplash.com/photo-15517741${40 + item}0-8a78bac0c2d?w=400&h=250&fit=crop`}
                  alt={`Project ${item}`}
                  className="w-full h-48 object-cover"
                />
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2">E-commerce Platform</h3>
                  <p className="text-gray-600 mb-4">Modern shopping experience with advanced features</p>
                  <Button variant="outline" className="w-full">View Project</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Start Your Project?</h2>
          <p className="text-xl text-blue-100 mb-8">Let's create something amazing together</p>
          <Button size="lg" className="bg-orange-600 hover:bg-orange-700">
            Get Started Today
          </Button>
        </div>
      </section>
    </div>
  );
}
