
import { Link, useLocation } from 'react-router-dom';
import { Mail, Phone, MapPin, Linkedin, Twitter, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Footer() {
  const location = useLocation();
  const isVASPSection = location.pathname.includes('/vasp');

  const itServices = [
    { name: 'Web Development', path: '/website/web-development' },
    { name: 'App Development', path: '/website/app-development' },
    { name: 'SEO Services', path: '/website/seo-services' },
    { name: 'Cloud Hosting', path: '/website/cloud-hosting' },
    { name: 'Custom Software', path: '/website/software-development' },
  ];

  const vaspServices = [
    { name: 'P2P Trading', path: '/website/vasp/p2p-trading' },
    { name: 'KYC Services', path: '/website/vasp/kyc' },
    { name: 'Security', path: '/website/vasp/security' },
    { name: 'Compliance', path: '/website/vasp/compliance' },
    { name: 'VASP Home', path: '/website/vasp-home' },
  ];

  const services = isVASPSection ? vaspServices : itServices;

  return (
    <footer className="bg-gray-900 text-white w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="text-2xl font-bold text-blue-400">
              Blynk Virtual Technologies
            </div>
            <p className="text-gray-300 text-sm">
              Leading IT services company specializing in web development, mobile apps, 
              cloud solutions, and VASP services.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              {isVASPSection ? 'VASP Services' : 'IT Services'}
            </h3>
            <ul className="space-y-2 text-sm text-gray-300">
              {services.map((service) => (
                <li key={service.name}>
                  <Link to={service.path} className="hover:text-blue-400 transition-colors">
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Links</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link to="/website/about" className="hover:text-blue-400 transition-colors">About Us</Link></li>
              <li><Link to="/website/portfolio" className="hover:text-blue-400 transition-colors">Portfolio</Link></li>
              <li><Link to="/website/contact" className="hover:text-blue-400 transition-colors">Contact</Link></li>
              <li><Link to="/website/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/website/terms" className="hover:text-blue-400 transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          {/* Contact & Newsletter */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Contact Info</h3>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-blue-400" />
                <span>support@blynkex.com</span>
              </div>
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-blue-400" />
                <span>+91 9266712788</span>
              </div>
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-blue-400 mt-1" />
                <span>First Floor Balwant Arcade, Plot No. 15<br />
                Maharana Pratap Nagar, Zone II<br />
                Bhopal, 462011, Madhya Pradesh, India</span>
              </div>
            </div>
            
            <div className="pt-4">
              <h4 className="text-sm font-semibold mb-2">Subscribe to Newsletter</h4>
              <div className="flex space-x-2">
                <Input 
                  type="email" 
                  placeholder="Your email" 
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Subscribe
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
          <p>&copy; 2024 Blynk Virtual Technologies Pvt. Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
