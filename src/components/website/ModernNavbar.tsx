import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, Menu, X, Shield, Flag, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveCryptoRates } from './LiveCryptoRates';
import { FIUTrustBanner } from './FIUTrustBanner';

export function ModernNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showSecurityAlert, setShowSecurityAlert] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (dropdownName: string) => {
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  const isActive = (path: string) => location.pathname === path;

  const tradersDropdown = {
    sections: [
      {
        title: "P2P TRADING",
        items: [
          { name: 'P2P Trading Platform', path: '/website/p2p-trading', description: 'Trade directly with verified users' },
          { name: 'Buy USDT with INR', path: '/website/buy-usdt', description: 'Instant USDT purchases' },
          { name: 'Sell Crypto for INR', path: '/website/sell-crypto', description: 'Quick INR settlements' },
        ]
      },
      {
        title: "PAYMENT METHODS",
        items: [
          { name: 'UPI & Bank Transfer', path: '/website/payment-methods', description: 'Multiple payment options' },
          { name: 'Getting Started Guide', path: '/website/getting-started', description: 'Complete onboarding help' },
        ]
      },
      {
        title: "SECURITY & COMPLIANCE",
        items: [
          { name: 'KYC for Individuals', path: '/website/individual-kyc', description: 'Complete identity verification' },
          { name: 'Safety Tips', path: '/website/safety-tips', description: 'Secure trading practices' },
        ]
      }
    ]
  };

  const businessDropdown = {
    sections: [
      {
        title: "INSTITUTIONAL TRADING",
        items: [
          { name: 'OTC Desk', path: '/website/otc-desk', description: 'High-value institutional trades' },
          { name: 'Bulk Buy/Sell USDT, BTC, ETH', path: '/website/bulk-trading', description: 'High-volume transactions' },
        ]
      },
      {
        title: "ENTERPRISE SERVICES",
        items: [
          { name: 'INR Settlement for Institutions', path: '/website/institutional-settlement', description: 'Corporate banking integration' },
          { name: 'Corporate KYC', path: '/website/corporate-kyc', description: 'Business verification process' },
        ]
      }
    ]
  };

  const resourcesDropdown = {
    sections: [
      {
        title: "SUPPORT",
        items: [
          { name: 'Help Center', path: '/website/help-center', description: 'Complete support portal' },
          { name: 'FAQ', path: '/website/faq', description: 'Frequently asked questions' },
        ]
      },
      {
        title: "LEARN",
        items: [
          { name: 'Crypto Trading 101', path: '/website/learn-crypto', description: 'Beginner trading guide' },
          { name: 'Blog & Updates', path: '/website/blog', description: 'Latest news and insights' },
          { name: 'API Documentation', path: '/website/api-access', description: 'Developer resources' },
        ]
      }
    ]
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/95 dark:bg-background/95">
        {/* Security Banner */}
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5 dark:bg-orange-950/20 dark:border-orange-800">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-orange-600" />
            <span className="text-orange-700 font-medium">🔒 Security Alert: Always verify official communication channels</span>
            <Button 
              variant="link" 
              size="sm" 
              className="text-orange-600 underline hover:text-orange-700 p-0 h-auto"
              onClick={() => setShowSecurityAlert(true)}
            >
              Learn More
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Tagline */}
            <Link to="/website" className="flex items-center hover:opacity-80 transition-opacity">
              <div className="h-16 w-16 flex items-center justify-center mr-4">
                <img 
                  src="/lovable-uploads/5ded23b1-7889-4913-bc29-77b1c4b4019b.png" 
                  alt="Blynk"
                  className="h-12 w-12 object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight italic">
                  blynk
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">Virtual Asset Service Provider</span>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              <Link
                to="/website"
                className={cn(
                  "text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white",
                  isActive('/website') && "text-gray-900 dark:text-white"
                )}
              >
                Home
              </Link>

              {/* For Traders Dropdown */}
              <div className="relative dropdown-container">
                <button
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white"
                  onClick={() => toggleDropdown('traders')}
                >
                  For Traders
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    activeDropdown === 'traders' && "rotate-180"
                  )} />
                </button>
                {activeDropdown === 'traders' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[480px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-6 px-6 z-50 animate-fade-in max-h-[80vh] overflow-y-auto"
                  >
                    <div className="grid grid-cols-1 gap-8">
                      {tradersDropdown.sections.map((section, index) => (
                        <div key={index}>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                            {section.title}
                          </h3>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                className="group/item block p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                onClick={() => setActiveDropdown(null)}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white group-hover/item:text-blue-600 transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-gray-500 mt-1">
                                    {item.description}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* For Businesses Dropdown */}
              <div className="relative dropdown-container">
                <button
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white"
                  onClick={() => toggleDropdown('businesses')}
                >
                  For Businesses
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    activeDropdown === 'businesses' && "rotate-180"
                  )} />
                </button>
                {activeDropdown === 'businesses' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[480px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-6 px-6 z-50 animate-fade-in max-h-[80vh] overflow-y-auto"
                  >
                    <div className="grid grid-cols-1 gap-8">
                      {businessDropdown.sections.map((section, index) => (
                        <div key={index}>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                            {section.title}
                          </h3>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                className="group/item block p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                onClick={() => setActiveDropdown(null)}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white group-hover/item:text-blue-600 transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-gray-500 mt-1">
                                    {item.description}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                to="/website/compliance"
                className={cn(
                  "text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white",
                  isActive('/website/compliance') && "text-gray-900 dark:text-white"
                )}
              >
                Compliance
              </Link>

              <Link
                to="/website/relationship-manager"
                className={cn(
                  "text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white",
                  isActive('/website/relationship-manager') && "text-gray-900 dark:text-white"
                )}
              >
                Dedicated RM
              </Link>

              <Link
                to="/website/contact"
                className={cn(
                  "text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white",
                  isActive('/website/contact') && "text-gray-900 dark:text-white"
                )}
              >
                Contact
              </Link>

              <Link
                to="/website/careers/apply"
                className={cn(
                  "text-gray-600 hover:text-gray-900 transition-colors font-medium dark:text-gray-300 dark:hover:text-white",
                  isActive('/website/careers/apply') && "text-gray-900 dark:text-white"
                )}
              >
                Apply Now
              </Link>
            </div>

            {/* Auth Buttons */}
            <div className="hidden lg:flex items-center gap-3">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/dashboard')}
                className="text-gray-600 hover:text-gray-900 font-medium dark:text-gray-300 dark:hover:text-white"
              >
                Log In
              </Button>
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg"
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
            <div className="lg:hidden border-t border-border mt-4 pt-4 pb-4 max-h-[80vh] overflow-y-auto">
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
                  <div className="space-y-3 ml-4">
                    {tradersDropdown.sections.map((section) => (
                      <div key={section.title}>
                        <div className="text-xs font-medium text-muted-foreground mb-1">{section.title}</div>
                        {section.items.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                            onClick={() => setIsOpen(false)}
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <div className="font-medium text-foreground mb-2">For Businesses</div>
                  <div className="space-y-3 ml-4">
                    {businessDropdown.sections.map((section) => (
                      <div key={section.title}>
                        <div className="text-xs font-medium text-muted-foreground mb-1">{section.title}</div>
                        {section.items.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                            onClick={() => setIsOpen(false)}
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
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

                <Link
                  to="/website/relationship-manager"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Dedicated RM
                </Link>

                <Link
                  to="/website/contact"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Contact
                </Link>

                <Link
                  to="/website/careers/apply"
                  className="block text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Apply Now
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

      {/* Security Alert Dialog */}
      <Dialog open={showSecurityAlert} onOpenChange={setShowSecurityAlert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <Lock className="h-5 w-5" />
              🔒 Security Alert
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 text-sm">
            <p className="font-medium text-foreground">
              Always verify official communication channels.
            </p>
            
            <p className="text-muted-foreground">
              Blynk Virtual Technologies will never ask for your passwords, OTPs, or private keys.
            </p>
            
            <div className="space-y-3">
              <p className="font-medium text-foreground">Official communication will only come from:</p>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Our verified website</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Official email domain (@blynkvirtual.com)</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Verified WhatsApp support numbers listed on our Support Page</span>
                </div>
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-red-800 dark:text-red-200 font-medium">
                    Beware of fake profiles, groups, or offers.
                  </p>
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    Report suspicious activity immediately to our Compliance Team.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-amber-800 dark:text-amber-200 font-medium text-center">
                ⚠️ Stay safe. Trade smart. Always double-check before sharing sensitive information.
              </p>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => {
                  setShowSecurityAlert(false);
                  navigate('/website/whatsapp-support');
                }}
                className="flex-1"
              >
                Contact Support
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowSecurityAlert(false)}
                className="flex-1"
              >
                Got It
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}