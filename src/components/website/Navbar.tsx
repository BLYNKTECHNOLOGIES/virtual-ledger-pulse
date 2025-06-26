
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, Code2 } from 'lucide-react';

const navItems = [
  { name: 'Case Studies', path: '/website/portfolio' },
  { name: 'Services', path: '/website/services' },
  { name: 'Industries', path: '/website/industries' },
  { name: 'Hire Developers', path: '/website/hire-developers' },
  { name: 'Insights', path: '/website/insights' },
  { name: 'About', path: '/website/about' },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const handleLoginClick = () => {
    const confirmLogin = window.confirm(
      'This login is only for staff of Blynk Virtual Technologies Private Limited. Do you want to continue?'
    );
    
    if (confirmLogin) {
      window.location.href = '/website/login';
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-b border-gray-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/website" className="flex items-center space-x-2 group">
            <div className="p-2 bg-black rounded-lg group-hover:bg-gray-800 transition-colors">
              <Code2 className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-black">
              techahead
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  location.pathname === item.path
                    ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-gray-700'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Contact Us Button */}
          <div className="hidden md:flex items-center space-x-4">
            <Button 
              onClick={handleLoginClick}
              variant="outline"
              className="text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              Login
            </Button>
            <Button className="bg-black text-white hover:bg-gray-800 rounded-full px-6">
              Contact Us
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-white/95 backdrop-blur-lg rounded-lg mt-2 border border-gray-200/50">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
              <div className="pt-2 border-t border-gray-200 space-y-2">
                <Button 
                  onClick={handleLoginClick}
                  variant="outline"
                  className="w-full"
                >
                  Login
                </Button>
                <Button className="w-full bg-black text-white hover:bg-gray-800">
                  Contact Us
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
