
import { Search, Target, FileText, Megaphone, MapPin, BarChart3, CheckCircle, Users, TrendingUp, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export function SEOServicesPage() {
  const seoServices = [
    {
      icon: Search,
      title: "Website Audit & Technical SEO",
      description: "Comprehensive crawlability analysis, page speed optimization, fixing broken links, meta issues & sitemaps, mobile and Core Web Vitals optimization"
    },
    {
      icon: Target,
      title: "Keyword Research & Strategy",
      description: "Industry-specific keyword mapping, competitor analysis, long-tail & intent-driven keyword targeting"
    },
    {
      icon: FileText,
      title: "On-Page SEO",
      description: "Meta titles & descriptions, structured heading tags, content optimization, schema markup integration"
    },
    {
      icon: Megaphone,
      title: "Off-Page SEO & Link Building",
      description: "White-hat backlink strategy, guest posting, digital PR & influencer outreach"
    },
    {
      icon: MapPin,
      title: "Local SEO",
      description: "Google My Business (GMB) setup & optimization, local keyword targeting, citation building, map pack optimization"
    },
    {
      icon: BarChart3,
      title: "Analytics & Reporting",
      description: "Weekly/monthly performance reports, traffic source analysis, conversion rate optimization (CRO)"
    }
  ];

  const tools = [
    "Google Search Console",
    "Ahrefs / SEMrush / Moz",
    "GTMetrix / Google PageSpeed",
    "Screaming Frog",
    "Google Analytics 4"
  ];

  const whyChooseUs = [
    { icon: CheckCircle, title: "100% Transparent Reporting" },
    { icon: TrendingUp, title: "ROI-Focused Campaigns" },
    { icon: Users, title: "Certified SEO Experts" },
    { icon: Award, title: "Proven Track Record in Fintech, eCommerce, SaaS, and Local Businesses" }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-900 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">🚀 SEO Services That Deliver Results</h1>
            <p className="text-xl text-green-100 max-w-4xl mx-auto mb-8">
              At Blynk Virtual Technologies Pvt. Ltd., we don't just optimize websites—we engineer digital dominance. 
              Our SEO services are tailored for your business's goals, ensuring you get found when and where it matters the most.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/website/contact">
                <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg">
                  Get Free SEO Audit
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-green-700 px-8 py-4 text-lg">
                View Case Studies
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🎯 Our SEO Offerings</h2>
            <p className="text-xl text-gray-600">Comprehensive SEO solutions to boost your online visibility</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {seoServices.map((service, index) => (
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

      {/* Tools Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">🛠 Tools We Use</h2>
            <p className="text-xl text-gray-600">Industry-leading SEO tools for maximum impact</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {tools.map((tool, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md text-center">
                <h3 className="font-semibold text-gray-900">{tool}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">💡 Why Choose Blynk for SEO?</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="text-center">
                <item.icon className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-green-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">📊 Let's Drive Meaningful Traffic To Your Website</h2>
          <p className="text-xl text-blue-100 mb-2">Our goal is simple:</p>
          <p className="text-2xl font-bold text-orange-300 mb-8">Rank. Reach. Revenue.</p>
          <p className="text-lg text-blue-100 mb-8">Ready to scale your online presence? Contact us today for a free SEO audit.</p>
          <Link to="/website/contact">
            <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg">
              Start Your SEO Journey
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
