import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronDown, Menu, X, Shield, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveCryptoRates } from './LiveCryptoRates';

export function ModernNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const tradersServices = [
    { name: 'P2P Trading Platform', path: '/website/p2p-trading' },
    { name: 'Buy/Sell USDT with INR', path: '/website/buy-sell-usdt' },
    { name: 'Supported Payment Methods', path: '/website/payment-methods' },
    { name: 'Getting Started Guide', path: '/website/getting-started' },
    { name: 'KYC for Individuals', path: '/website/individual-kyc' },
    { name: 'Safety Tips for Retail Traders', path: '/website/safety-tips' }
  ];

  const businessServices = [
    { name: 'Bulk Buy/Sell USDT, BTC, ETH', path: '/website/bulk-trading' },
    { name: 'INR Settlement for Institutions', path: '/website/institutional-settlement' },
    { name: 'Custom Rates & Instant Settlement', path: '/website/custom-rates' },
    { name: 'Corporate Account KYC', path: '/website/corporate-kyc' },
    { name: 'Dedicated Manager & SLAs', path: '/website/dedicated-support' }
  ];

  const compliancePages = [
    { name: 'Indian KYC Norms', path: '/website/kyc-norms' },
    { name: 'AML/CFT Policy', path: '/website/aml-policy' },
    { name: 'Data Privacy & Storage Policy', path: '/website/privacy-policy' },
    { name: 'FATF & VASP Guidelines', path: '/website/vasp-guidelines' },
    { name: 'RBI/SEBI Notifications', path: '/website/regulatory-notifications' }
  ];

  const resourcesPages = [
    { name: 'Help Center / Support Portal', path: '/website/help-center' },
    { name: 'Frequently Asked Questions', path: '/website/faq' },
    { name: 'Blog: Product & Security Updates', path: '/website/blog' },
    { name: 'Learn: Crypto Trading 101', path: '/website/learn-crypto' },
    { name: 'API Access', path: '/website/api-access' }
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Security Banner */}
        <div className="bg-warning/10 border-b border-warning/20 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-warning" />
            <span className="text-warning font-medium">Security Alert: Always verify official communication channels</span>
            <Button variant="link" size="sm" className="text-warning underline">
              Learn More
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Tagline */}
            <Link to="/website" className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">V</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-foreground">VASPCorp</span>
                <div className="flex items-center gap-1">
                  <Flag className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-muted-foreground">Registered VASP • India</span>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              <Link
                to="/website"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website') && "text-foreground font-medium"
                )}
              >
                Home
              </Link>

              {/* For Traders Dropdown */}
              <div className="relative group">
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  onMouseEnter={() => setActiveDropdown('traders')}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  For Traders
                  <ChevronDown className="h-4 w-4" />
                </button>
                {activeDropdown === 'traders' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg py-2 z-50"
                    onMouseEnter={() => setActiveDropdown('traders')}
                    onMouseLeave={() => setActiveDropdown(null)}
                  >
                    {tradersServices.map((service) => (
                      <Link
                        key={service.path}
                        to={service.path}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        {service.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* For Businesses Dropdown */}
              <div className="relative group">
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  onMouseEnter={() => setActiveDropdown('businesses')}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  For Businesses
                  <ChevronDown className="h-4 w-4" />
                </button>
                {activeDropdown === 'businesses' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg py-2 z-50"
                    onMouseEnter={() => setActiveDropdown('businesses')}
                    onMouseLeave={() => setActiveDropdown(null)}
                  >
                    {businessServices.map((service) => (
                      <Link
                        key={service.path}
                        to={service.path}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        {service.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/website/compliance"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/compliance') && "text-foreground font-medium"
                )}
              >
                Compliance
              </Link>

              {/* Resources Dropdown */}
              <div className="relative group">
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  onMouseEnter={() => setActiveDropdown('resources')}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  Resources
                  <ChevronDown className="h-4 w-4" />
                </button>
                {activeDropdown === 'resources' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg py-2 z-50"
                    onMouseEnter={() => setActiveDropdown('resources')}
                    onMouseLeave={() => setActiveDropdown(null)}
                  >
                    {resourcesPages.map((resource) => (
                      <Link
                        key={resource.path}
                        to={resource.path}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        {resource.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/website/contact"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/contact') && "text-foreground font-medium"
                )}
              >
                Contact
              </Link>
            </div>

            {/* Auth Buttons */}
            <div className="hidden lg:flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="text-muted-foreground hover:text-foreground"
              >
                Log In
              </Button>
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium px-6"
              >
                Get Started
              </Button>
            </div>

          {/* Mobile menu button */}
          <button
            className="lg:hidden"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

          {/* Mobile Navigation */}
          {isOpen && (
            <div className="lg:hidden border-t border-border mt-4 pt-4 pb-4">
              <div className="space-y-4">
                <Link
                  to="/website"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Home
                </Link>

                <div>
                  <div className="font-medium text-foreground mb-2">For Traders</div>
                  <div className="space-y-2 ml-4">
                    {tradersServices.map((service) => (
                      <Link
                        key={service.path}
                        to={service.path}
                        className="block text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsOpen(false)}
                      >
                        {service.name}
                      </Link>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="font-medium text-foreground mb-2">For Businesses</div>
                  <div className="space-y-2 ml-4">
                    {businessServices.map((service) => (
                      <Link
                        key={service.path}
                        to={service.path}
                        className="block text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsOpen(false)}
                      >
                        {service.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <Link
                  to="/website/compliance"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Compliance
                </Link>

                <div>
                  <div className="font-medium text-foreground mb-2">Resources</div>
                  <div className="space-y-2 ml-4">
                    {resourcesPages.map((resource) => (
                      <Link
                        key={resource.path}
                        to={resource.path}
                        className="block text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsOpen(false)}
                      >
                        {resource.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <Link
                  to="/website/contact"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Contact
                </Link>

                <div className="flex flex-col gap-2 pt-4 border-t border-border">
                  <Button 
                    variant="ghost" 
                    onClick={() => navigate('/dashboard')}
                    className="justify-start"
                  >
                    Log In
                  </Button>
                  <Button 
                    onClick={() => navigate('/dashboard')}
                    className="justify-start bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}