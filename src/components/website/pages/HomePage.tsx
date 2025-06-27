
import { Zap, Users, Globe, TrendingUp, CheckCircle, ArrowRight, Code, Monitor, Smartphone, Cloud, Award, Target, Building, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export function HomePage() {
  const navigate = useNavigate();

  // Scroll to top when component loads
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const stats = [
    {
      icon: Code,
      number: "2+",
      text: "Years of Experience",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: Users,
      number: "50+",
      text: "Happy Clients",
      color: "from-green-500 to-green-600"
    },
    {
      icon: TrendingUp,
      number: "99%",
      text: "Project Success Rate",
      color: "from-purple-500 to-purple-600"
    },
    {
      icon: Globe,
      number: "50+",
      text: "Various Services",
      color: "from-orange-500 to-orange-600"
    }
  ];

  const services = [
    {
      icon: Monitor,
      title: "Web Development",
      description: "Create responsive, modern websites and web applications using cutting-edge technologies.",
      features: ["React & Next.js", "Full-Stack Solutions", "E-commerce Platforms", "CMS Integration"],
      link: "/website/web-development"
    },
    {
      icon: Smartphone,
      title: "App Development",
      description: "Build native and cross-platform mobile applications for iOS and Android.",
      features: ["Native iOS/Android", "React Native", "Flutter", "App Store Deployment"],
      link: "/website/app-development"
    },
    {
      icon: TrendingUp,
      title: "SEO Services",
      description: "Boost your online visibility and drive organic traffic to your website.",
      features: ["Keyword Research", "On-Page SEO", "Technical SEO", "Performance Tracking"],
      link: "/website/seo-services"
    },
    {
      icon: Cloud,
      title: "Cloud Solutions",
      description: "Scalable cloud infrastructure and deployment solutions for your applications.",
      features: ["AWS/Azure/GCP", "DevOps", "Auto-scaling", "Monitoring"],
      link: "/website/contact"
    }
  ];

  const achievements = [
    {
      icon: Award,
      title: "Quality Assurance",
      description: "We maintain the highest standards in code quality and project delivery with rigorous testing.",
      highlight: "100% Quality"
    },
    {
      icon: Target,
      title: "On-Time Delivery",
      description: "Our projects are delivered on schedule with efficient project management and clear communication.",
      highlight: "On Schedule"
    },
    {
      icon: Building,
      title: "Scalable Solutions",
      description: "We build applications that grow with your business using modern, scalable architectures.",
      highlight: "Future-Ready"
    },
    {
      icon: Star,
      title: "Client Satisfaction",
      description: "Our focus on understanding client needs and delivering exceptional results drives our success.",
      highlight: "Client-First"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 to-indigo-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-blue-400 mr-3" />
              <span className="text-blue-300 font-medium">INNOVATIVE TECHNOLOGY SOLUTIONS</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              Transform Your Business with Technology
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-4xl mx-auto">
              We create cutting-edge web applications, mobile apps, and digital solutions that drive growth and innovation for businesses worldwide.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button 
                size="lg" 
                className="bg-white text-blue-900 hover:bg-gray-100 px-10 py-4 text-xl rounded-full shadow-lg"
                onClick={() => navigate('/website/web-development')}
              >
                Start Your Project
                <ArrowRight className="ml-2 h-6 w-6 text-blue-900" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-blue-900 px-10 py-4 text-xl rounded-full"
                onClick={() => navigate('/website/contact')}
              >
                Get Free Consultation
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
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Services</h2>
            <p className="text-xl text-gray-600">Comprehensive IT solutions tailored to your business needs</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 cursor-pointer" onClick={() => navigate(service.link)}>
                <CardHeader>
                  <div className="flex items-center mb-4">
                    <div className="bg-blue-600 p-3 rounded-lg mr-4">
                      <service.icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-gray-900">{service.title}</CardTitle>
                  </div>
                  <CardDescription className="text-gray-600 text-lg">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center text-gray-600">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(service.link)}>
                    Learn More
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Choose Us</h2>
            <p className="text-xl text-gray-600">Excellence in every aspect of our service delivery</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {achievements.map((achievement, index) => (
              <Card key={index} className="text-center border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <achievement.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{achievement.title}</h3>
                  <p className="text-gray-600 mb-4">{achievement.description}</p>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-full text-sm font-medium">
                    {achievement.highlight}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <Zap className="h-8 w-8 text-blue-200 mr-3" />
            <span className="text-blue-200 font-medium">READY TO GET STARTED?</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">Let's Build Something Amazing Together</h2>
          <p className="text-xl mb-10">
            Transform your ideas into reality with our expert development team.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Start Your Project
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-10 py-4 text-xl rounded-full"
              onClick={() => navigate('/website/web-development')}
            >
              View Our Services
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
