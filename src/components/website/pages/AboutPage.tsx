
import { Building2, Users, Target, Shield, TrendingUp, MapPin, Calendar, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutPage() {
  const expertise = [
    "💼 P2P Crypto Exchange & Merchant Services",
    "💳 VASP (Virtual Asset Service Provider) Solutions", 
    "🖥 Web & App Development",
    "☁️ Cloud Hosting and DevOps",
    "📊 Custom ERP & CRM Platforms",
    "📈 SEO and Digital Marketing Services"
  ];

  const services = [
    {
      icon: Shield,
      title: "🔐 Virtual Asset Services (VASP)",
      description: "We provide secure, compliant, and scalable solutions for P2P crypto trading, merchant settlements, and automated KYC/AML systems, aligning with guidelines from AMLC, FIU-IND, and global FATF standards."
    },
    {
      icon: Building2,
      title: "🛠 Technology Solutions",
      description: "We deliver robust and scalable tech solutions including custom CRM & ERP tools, white-label P2P exchange infrastructure, cross-platform mobile apps, and SaaS-based business platforms."
    },
    {
      icon: TrendingUp,
      title: "💹 Fintech Infrastructure",
      description: "We enable businesses with tools like UPI Gateway integrations, Wallet-as-a-service APIs, and ledger and compliance monitoring systems."
    }
  ];

  const values = [
    { icon: Shield, title: "Transparency", description: "in all dealings" },
    { icon: Shield, title: "Security", description: "by design" },
    { icon: Users, title: "Customer-first", description: "innovation" },
    { icon: Building2, title: "Compliance-led", description: "architecture" },
    { icon: TrendingUp, title: "Scalable", description: "growth mindset" }
  ];

  const companyDetails = [
    { label: "Legal Name", value: "Blynk Virtual Technologies Private Limited" },
    { label: "CIN", value: "U62099MP2025PTC074915" },
    { label: "Date of Incorporation", value: "19th February 2025" },
    { label: "Company Type", value: "Private" },
    { label: "Category", value: "Non-Government" },
    { label: "Headquarters", value: "Bhopal, Madhya Pradesh, India" }
  ];

  const directors = [
    "Abhishek Singh Tomar",
    "Shubham Singh"
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-900 to-indigo-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">Innovating the Future of Finance and Technology</h1>
            <p className="text-xl text-blue-100 max-w-4xl mx-auto mb-8">
              Blynk Virtual Technologies Private Limited is a cutting-edge technology company registered under the Ministry of Corporate Affairs (MCA). 
              Founded by visionaries Abhishek Singh Tomar and Shubham Singh, we simplify digital finance, revolutionize peer-to-peer (P2P) transactions, 
              and deliver innovative IT solutions across industries.
            </p>
          </div>
        </div>
      </section>

      {/* Company Details */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🏛 Company Overview</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {companyDetails.map((detail, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{detail.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{detail.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-6 w-6" />
                Directors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {directors.map((director, index) => (
                  <li key={index} className="text-gray-700 font-medium">{director}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Who We Are */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🚀 Who We Are</h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto mb-8">
              At Blynk, we believe that technology is the great equalizer. Our diverse portfolio ranges from financial technology services 
              to full-stack software development, all designed to empower individuals and businesses in a fast-changing digital world.
            </p>
          </div>

          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Our Core Expertise</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {expertise.map((item, index) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow-md">
                  <p className="text-lg font-medium text-gray-800">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🧠 What We Do</h2>
            <p className="text-xl text-gray-600">We specialize in:</p>
          </div>

          <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
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
        </div>
      </section>

      {/* Vision & Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16">
            {/* Vision */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">🤝 Our Vision</h2>
              <p className="text-lg text-gray-700">
                To become India's most reliable and innovative tech company in the field of fintech and P2P asset management, 
                offering secure and compliant platforms for the digital economy.
              </p>
            </div>

            {/* Values */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">🔎 Our Values</h2>
              <div className="space-y-4">
                {values.map((value, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <value.icon className="h-6 w-6 text-blue-600" />
                    <span className="text-gray-700">
                      <strong>{value.title}</strong> {value.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">📍 Let's Connect</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Whether you're a startup seeking IT infrastructure or a merchant needing automated financial tools, 
            Blynk Virtual Technologies is your strategic partner in the digital age.
          </p>
        </div>
      </section>
    </div>
  );
}
