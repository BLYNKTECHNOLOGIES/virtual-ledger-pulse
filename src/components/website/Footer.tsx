
import { Link } from 'react-router-dom';
import { Code2, Mail, Phone, MapPin, Twitter, Linkedin, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Code2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold">TechFlow</span>
            </div>
            <p className="text-gray-400 text-sm">
              Empowering your business with digital excellence through cutting-edge technology solutions.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Services</h3>
            <div className="space-y-2">
              <Link to="/website/web-design" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Web Design & Development
              </Link>
              <Link to="/website/seo-services" className="block text-gray-400 hover:text-white transition-colors text-sm">
                SEO Services
              </Link>
              <Link to="/website/app-development" className="block text-gray-400 hover:text-white transition-colors text-sm">
                App Development
              </Link>
              <Link to="/website/cloud-hosting" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Cloud & Hosting
              </Link>
              <Link to="/website/custom-software" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Custom Software
              </Link>
              <Link to="/website/vasp" className="block text-gray-400 hover:text-white transition-colors text-sm">
                VASP Services
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <div className="space-y-2">
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                About Us
              </a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Portfolio
              </a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Blog
              </a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Careers
              </a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Privacy Policy
              </a>
              <a href="#" className="block text-gray-400 hover:text-white transition-colors text-sm">
                Terms of Service
              </a>
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Mail className="h-4 w-4 text-blue-400" />
                <span className="text-gray-400 text-sm">contact@techflow.com</span>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-4 w-4 text-blue-400" />
                <span className="text-gray-400 text-sm">+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center space-x-3">
                <MapPin className="h-4 w-4 text-blue-400" />
                <span className="text-gray-400 text-sm">123 Tech Street, Digital City</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
          <p>&copy; 2024 TechFlow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
