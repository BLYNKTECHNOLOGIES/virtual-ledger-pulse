
import { Code, Smartphone, Cloud, Search, Cog, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const services = [
  {
    icon: Code,
    title: 'Web Development',
    description: 'Custom web applications built with modern frameworks like React, Next.js, and Tailwind CSS.',
    link: '/website/web-development',
    color: 'bg-blue-500'
  },
  {
    icon: Smartphone,
    title: 'Mobile App Development',
    description: 'Native and cross-platform mobile apps for iOS and Android using Flutter and React Native.',
    link: '/website/app-development',
    color: 'bg-green-500'
  },
  {
    icon: Search,
    title: 'SEO Services',
    description: 'Comprehensive SEO strategies to improve your search rankings and organic traffic.',
    link: '/website/seo-services',
    color: 'bg-purple-500'
  },
  {
    icon: Cloud,
    title: 'Cloud & DevOps',
    description: 'Scalable cloud infrastructure and DevOps solutions on AWS, Azure, and Google Cloud.',
    link: '/website/cloud-hosting',
    color: 'bg-orange-500'
  },
  {
    icon: Cog,
    title: 'Custom Software',
    description: 'Tailored software solutions including CRM, ERP, and enterprise applications.',
    link: '/website/software-development',
    color: 'bg-red-500'
  },
  {
    icon: Shield,
    title: 'VASP Services',
    description: 'Virtual Asset Service Provider solutions with compliance, KYC, and P2P exchange services.',
    link: '/website/vasp',
    color: 'bg-indigo-500'
  }
];

export function ServicesSection() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Our Services
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We provide comprehensive IT solutions to help businesses thrive in the digital age
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div 
              key={index}
              className="bg-white rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className={`${service.color} w-16 h-16 rounded-lg flex items-center justify-center mb-6`}>
                <service.icon className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {service.title}
              </h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                {service.description}
              </p>
              <Link to={service.link}>
                <Button variant="outline" className="w-full hover:bg-blue-50">
                  Learn More
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
