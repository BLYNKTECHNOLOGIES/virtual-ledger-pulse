
import { ArrowRight, Users, Award, TrendingUp, CheckCircle, Star, Code, Smartphone, Cloud, Shield, Zap, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function ModernHomePage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();

  // Hero slideshow content
  const heroSlides = [
    {
      title: "Transform Your Business with Cutting-Edge Technology",
      subtitle: "Custom solutions for web, mobile, and blockchain development",
      image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&h=600&fit=crop"
    },
    {
      title: "Leading VASP Solutions & Crypto Exchange Development",
      subtitle: "Secure, compliant, and scalable virtual asset service platforms",
      image: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&h=600&fit=crop"
    },
    {
      title: "Enterprise-Grade CRM & ERP Solutions",
      subtitle: "Streamline your operations with our comprehensive business tools",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=600&fit=crop"
    }
  ];

  // Auto-slide functionality
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroSlides.length]);

  const services = [
    {
      icon: Code,
      title: "Web Development",
      description: "Custom websites and web applications built with modern technologies",
      features: ["React & Next.js", "Full-Stack Development", "API Integration", "Database Design"]
    },
    {
      icon: Smartphone,
      title: "Mobile App Development",
      description: "Native and cross-platform mobile applications for iOS and Android",
      features: ["React Native", "Flutter", "iOS & Android", "App Store Deployment"]
    },
    {
      icon: Shield,
      title: "VASP Solutions",
      description: "Virtual Asset Service Provider platforms with full compliance",
      features: ["P2P Trading", "KYC/AML Systems", "Regulatory Compliance", "Secure Transactions"]
    },
    {
      icon: Cloud,
      title: "Cloud & DevOps",
      description: "Scalable cloud infrastructure and deployment solutions",
      features: ["AWS & Azure", "CI/CD Pipelines", "Container Orchestration", "Auto-scaling"]
    }
  ];

  const achievements = [
    { number: "200+", label: "Projects Delivered", icon: Target },
    { number: "50+", label: "Happy Clients", icon: Users },
    { number: "5+", label: "Years Experience", icon: Award },
    { number: "99.9%", label: "Uptime Guarantee", icon: Zap }
  ];

  const testimonials = [
    {
      name: "Rajesh Kumar",
      company: "FinTech Innovations",
      content: "Blynk Technologies delivered our crypto exchange platform on time with exceptional security features.",
      rating: 5
    },
    {
      name: "Priya Sharma",
      company: "E-commerce Solutions",
      content: "Their CRM system transformed our business operations. Highly professional team.",
      rating: 5
    },
    {
      name: "Amit Patel",
      company: "Tech Startup",
      content: "Outstanding mobile app development. The user experience is seamless and intuitive.",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section with Slideshow */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Background slideshow */}
        <div className="absolute inset-0">
          {heroSlides.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="absolute inset-0 bg-black bg-opacity-50 z-10"></div>
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-20 text-center text-white max-w-6xl mx-auto px-4">
          <h1 className="text-6xl lg:text-8xl font-bold mb-6 animate-fade-in-up">
            {heroSlides[currentSlide].title}
          </h1>
          <p className="text-2xl lg:text-3xl mb-8 text-gray-200 animate-fade-in-up">
            {heroSlides[currentSlide].subtitle}
          </p>
          <div className="flex justify-center animate-fade-in-up">
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/individual-kyc')}
            >
              Get Started
              <ArrowRight className="ml-2 h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Slide indicators */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2 z-20">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentSlide ? 'bg-white' : 'bg-white bg-opacity-50'
              }`}
            />
          ))}
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">Our Services</h2>
            <p className="text-xl text-gray-600">Comprehensive technology solutions for modern businesses</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow group">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <service.icon className="h-8 w-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600 mb-4">
                    {service.description}
                  </CardDescription>
                  <ul className="space-y-2">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="h-4 w-4 text-green-500" />
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

      {/* Achievements Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-6">Our Achievements</h2>
            <p className="text-xl text-blue-100">Numbers that speak for our excellence</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {achievements.map((achievement, index) => (
              <div key={index} className="text-center">
                <div className="mx-auto mb-4 p-4 bg-blue-500 rounded-full w-20 h-20 flex items-center justify-center">
                  <achievement.icon className="h-10 w-10" />
                </div>
                <div className="text-4xl font-bold mb-2">{achievement.number}</div>
                <div className="text-xl text-blue-100">{achievement.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-6">What Our Clients Say</h2>
            <p className="text-xl text-gray-600">Trusted by businesses across India</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-white shadow-lg">
                <CardContent className="p-8">
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 italic">"{testimonial.content}"</p>
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-gray-600">{testimonial.company}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl font-bold mb-6">Ready to Transform Your Business?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Let's discuss how our technology solutions can help you achieve your goals. 
            Contact us today for a free consultation.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-orange-600 hover:bg-orange-700 text-white px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Get Free Consultation
              <ArrowRight className="ml-2 h-6 w-6" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-700 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/about')}
            >
              Learn More About Us
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
