
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

type NavItem = {
  name: string;
  path: string;
  dropdown?: {
    name: string;
    path: string;
  }[];
};

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isVASPSection, setIsVASPSection] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const itNavItems: NavItem[] = [
    { name: 'Home', path: '/website' },
    { 
      name: 'Services', 
      path: '/services',
      dropdown: [
        { name: 'Web Design & Development', path: '/website/web-development' },
        { name: 'SEO Services', path: '/website/seo-services' },
        { name: 'App Development', path: '/website/app-development' },
        { name: 'Cloud Hosting & DevOps', path: '/website/cloud-hosting' },
        { name: 'Custom Software Development', path: '/website/software-development' },
      ]
    },
    { name: 'About', path: '/website/about' },
    { name: 'Portfolio', path: '/website/portfolio' },
  ];

  const vaspNavItems: NavItem[] = [
    { name: 'VASP Home', path: '/website/vasp-home' },
    { name: 'P2P Trading', path: '/website/vasp/p2p-trading' },
    { name: 'KYC Services', path: '/website/vasp/kyc' },
    { name: 'Security', path: '/website/vasp/security' },
    { name: 'Compliance', path: '/website/vasp/compliance' },
  ];

  const navItems = isVASPSection ? vaspNavItems : itNavItems;

  return (
    <nav className="bg-white shadow-lg sticky top-0 z-50 w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/website" className="flex-shrink-0 flex items-center">
              {/* Complete Logo Image */}
              <img 
                src="/lovable-uploads/95dfb015-8a6a-4ff4-b8e5-b77bb62d6d08.png" 
                alt="Blynk Virtual Technologies Logo" 
                className="h-8 w-auto"
              />
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-6">
            {/* Section Toggle - Orange for VASP with better spacing */}
            <div className="flex items-center bg-gray-50 rounded-lg p-1 border">
              <button
                onClick={() => setIsVASPSection(false)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  !isVASPSection 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                }`}
              >
                IT Services
              </button>
              <button
                onClick={() => setIsVASPSection(true)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  isVASPSection 
                    ? 'bg-orange-600 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                }`}
              >
                VASP
              </button>
            </div>

            {/* Navigation Items with improved spacing */}
            <div className="flex items-center space-x-6">
              {navItems.map((item) => (
                <div key={item.name} className="relative">
                  {item.dropdown ? (
                    <div
                      className="relative"
                      onMouseEnter={() => setActiveDropdown(item.name)}
                      onMouseLeave={() => setActiveDropdown(null)}
                    >
                      <button
                        className={`flex items-center px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                          isActive(item.path)
                            ? `${isVASPSection ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50'}`
                            : `text-gray-700 hover:${isVASPSection ? 'text-orange-600' : 'text-blue-600'} hover:bg-gray-50`
                        }`}
                      >
                        {item.name}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </button>
                      {activeDropdown === item.name && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-xl border py-2 z-50">
                          {item.dropdown.map((subItem) => (
                            <Link
                              key={subItem.name}
                              to={subItem.path}
                              className={`block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:${isVASPSection ? 'text-orange-600' : 'text-blue-600'} transition-colors border-l-2 border-transparent hover:border-${isVASPSection ? 'orange' : 'blue'}-600`}
                            >
                              {subItem.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={item.path}
                      className={`px-3 py-2 text-sm font-medium transition-colors rounded-lg whitespace-nowrap ${
                        isActive(item.path)
                          ? `${isVASPSection ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50'}`
                          : `text-gray-700 hover:${isVASPSection ? 'text-orange-600' : 'text-blue-600'} hover:bg-gray-50`
                      }`}
                    >
                      {item.name}
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <Link to="/website/login">
              <Button className={`${isVASPSection ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-6 py-2 rounded-lg font-medium`}>
                Sign In
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-blue-600 focus:outline-none p-2"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="lg:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t">
              {/* Mobile Section Toggle */}
              <div className="flex space-x-2 mb-4 bg-gray-50 rounded-lg p-1">
                <button
                  onClick={() => setIsVASPSection(false)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    !isVASPSection 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-600'
                  }`}
                >
                  IT Services
                </button>
                <button
                  onClick={() => setIsVASPSection(true)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    isVASPSection 
                      ? 'bg-orange-600 text-white' 
                      : 'text-gray-600'
                  }`}
                >
                  VASP
                </button>
              </div>

              {navItems.map((item) => (
                <div key={item.name}>
                  <Link
                    to={item.path}
                    className={`block px-3 py-2 text-base font-medium transition-colors rounded-md ${
                      isActive(item.path)
                        ? `${isVASPSection ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50'}`
                        : `text-gray-700 hover:${isVASPSection ? 'text-orange-600' : 'text-blue-600'} hover:bg-gray-50`
                    }`}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.name}
                  </Link>
                  {item.dropdown && (
                    <div className="pl-6 space-y-1">
                      {item.dropdown.map((subItem) => (
                        <Link
                          key={subItem.name}
                          to={subItem.path}
                          className={`block px-3 py-2 text-sm text-gray-600 hover:${isVASPSection ? 'text-orange-600' : 'text-blue-600'} hover:bg-gray-50 transition-colors rounded-md`}
                          onClick={() => setIsOpen(false)}
                        >
                          {subItem.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4">
                <Link to="/website/login" onClick={() => setIsOpen(false)}>
                  <Button className={`w-full ${isVASPSection ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
