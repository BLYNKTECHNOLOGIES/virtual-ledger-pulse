
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [isVASPMode, setIsVASPMode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isVASPPath = location.pathname.includes('/website/vasp');
    setIsVASPMode(isVASPPath);
  }, [location.pathname]);

  const toggleMode = () => {
    const newMode = !isVASPMode;
    setIsVASPMode(newMode);
    if (newMode) {
      navigate('/website/vasp');
    } else {
      navigate('/website');
    }
  };

  const itServices = [
    { name: 'Web Development', href: '/website/web-development' },
    { name: 'App Development', href: '/website/app-development' },
    { name: 'SEO Services', href: '/website/seo-services' },
  ];

  const vaspServices = [
    { name: 'P2P Trading', href: '/website/vasp/p2p-trading' },
    { name: 'KYC Services', href: '/website/vasp/kyc' },
    { name: 'Security & Compliance', href: '/website/vasp/security' },
    { name: 'Digital Asset Management', href: '/website/vasp/compliance' },
  ];

  const currentServices = isVASPMode ? vaspServices : itServices;

  const quickLinks = [
    { name: 'About', href: '/website/about' },
    { name: 'Contact Us', href: '/website/contact' },
    { name: 'Privacy Policy', href: '/website/privacy-policy' },
    { name: 'Terms of Service', href: '/website/terms-of-service' },
  ];

  return (
    <nav className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <span 
                className="text-2xl font-bold text-blue-600 cursor-pointer"
                onClick={() => navigate(isVASPMode ? '/website/vasp' : '/website')}
              >
                Blynk{isVASPMode ? 'VASP' : 'Tech'}
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <button
              onClick={() => navigate(isVASPMode ? '/website/vasp' : '/website')}
              className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors"
            >
              Home
            </button>
            
            <div className="relative group">
              <button
                className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium flex items-center transition-colors"
                onMouseEnter={() => setIsServicesOpen(true)}
                onMouseLeave={() => setIsServicesOpen(false)}
              >
                Services
                <ChevronDown className="ml-1 h-4 w-4" />
              </button>
              
              {isServicesOpen && (
                <div 
                  className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-50"
                  onMouseEnter={() => setIsServicesOpen(true)}
                  onMouseLeave={() => setIsServicesOpen(false)}
                >
                  {currentServices.map((service) => (
                    <button
                      key={service.name}
                      onClick={() => {
                        navigate(service.href);
                        setIsServicesOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                    >
                      {service.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {quickLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => navigate(link.href)}
                className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors"
              >
                {link.name}
              </button>
            ))}

            <div className="flex items-center space-x-4">
              <div className="flex items-center bg-gray-100 rounded-full p-1">
                <button
                  onClick={toggleMode}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    !isVASPMode
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-blue-600'
                  }`}
                >
                  IT Services
                </button>
                <button
                  onClick={toggleMode}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isVASPMode
                      ? 'bg-orange-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-orange-600'
                  }`}
                >
                  VASP Services
                </button>
              </div>

              <Button 
                className={`${
                  isVASPMode 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                onClick={() => navigate('/website/contact')}
              >
                Get Started
              </Button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-blue-600 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <button
              onClick={() => {
                navigate(isVASPMode ? '/website/vasp' : '/website');
                setIsOpen(false);
              }}
              className="block w-full text-left px-3 py-2 text-base font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              Home
            </button>
            
            <div className="space-y-1">
              <div className="px-3 py-2 text-base font-medium text-gray-500">Services</div>
              {currentServices.map((service) => (
                <button
                  key={service.name}
                  onClick={() => {
                    navigate(service.href);
                    setIsOpen(false);
                  }}
                  className="block w-full text-left px-6 py-2 text-sm text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors"
                >
                  {service.name}
                </button>
              ))}
            </div>

            {quickLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => {
                  navigate(link.href);
                  setIsOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md transition-colors"
              >
                {link.name}
              </button>
            ))}

            <div className="px-3 py-4 border-t">
              <div className="flex flex-col space-y-3">
                <div className="flex bg-gray-100 rounded-full p-1">
                  <button
                    onClick={() => {
                      setIsVASPMode(false);
                      navigate('/website');
                      setIsOpen(false);
                    }}
                    className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      !isVASPMode
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600'
                    }`}
                  >
                    IT Services
                  </button>
                  <button
                    onClick={() => {
                      setIsVASPMode(true);
                      navigate('/website/vasp');
                      setIsOpen(false);
                    }}
                    className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      isVASPMode
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'text-gray-600'
                    }`}
                  >
                    VASP Services
                  </button>
                </div>
                
                <Button 
                  className={`w-full ${
                    isVASPMode 
                      ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  onClick={() => {
                    navigate('/website/contact');
                    setIsOpen(false);
                  }}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
