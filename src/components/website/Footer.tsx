
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Linkedin, Twitter, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="text-2xl font-bold text-blue-400">
              Blynk Technologies
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
            <h3 className="text-lg font-semibold">Services</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link to="/website/web-development" className="hover:text-blue-400 transition-colors">Web Development</Link></li>
              <li><Link to="/website/app-development" className="hover:text-blue-400 transition-colors">App Development</Link></li>
              <li><Link to="/website/seo-services" className="hover:text-blue-400 transition-colors">SEO Services</Link></li>
              <li><Link to="/website/cloud-hosting" className="hover:text-blue-400 transition-colors">Cloud Hosting</Link></li>
              <li><Link to="/website/software-development" className="hover:text-blue-400 transition-colors">Custom Software</Link></li>
              <li><Link to="/website/vasp" className="hover:text-blue-400 transition-colors">VASP Services</Link></li>
            </ul>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Links</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><Link to="/website/about" className="hover:text-blue-400 transition-colors">About Us</Link></li>
              <li><Link to="/website/portfolio" className="hover:text-blue-400 transition-colors">Portfolio</Link></li>
              <li><Link to="/website/contact" className="hover:text-blue-400 transition-colors">Contact</Link></li>
              <li><a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a></li>
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
          <p>&copy; 2024 Blynk Technologies Pvt. Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
