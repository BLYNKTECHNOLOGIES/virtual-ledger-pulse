import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, Menu, X, Shield, Flag, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveCryptoRates } from './LiveCryptoRates';

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
        title: "BULK TRADING",
        items: [
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
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Security Banner */}
        <div className="bg-warning/10 border-b border-warning/20 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-warning" />
            <span className="text-warning font-medium">🔒 Security Alert: Always verify official communication channels</span>
            <Button 
              variant="link" 
              size="sm" 
              className="text-warning underline"
              onClick={() => setShowSecurityAlert(true)}
            >
              Learn More
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Tagline */}
            <Link to="/website" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
              <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center border border-border/20 shadow-sm">
                <img 
                  src="/lovable-uploads/5ded23b1-7889-4913-bc29-77b1c4b4019b.png" 
                  alt="Blynk"
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-foreground tracking-tight hover:text-primary transition-colors italic">
                  blynk
                </span>
                <div className="flex items-center gap-1">
                  <Flag className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-muted-foreground font-medium">VASP • India</span>
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
              <div className="relative dropdown-container">
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
                    className="absolute top-full left-0 mt-2 w-[480px] bg-background dark:bg-background border border-border rounded-lg shadow-xl py-6 px-6 z-50 animate-fade-in"
                  >
                    <div className="grid grid-cols-1 gap-8">
                      {tradersDropdown.sections.map((section, index) => (
                        <div key={index}>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            {section.title}
                          </h3>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                className="group/item block p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                onClick={() => setActiveDropdown(null)}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground mt-1">
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
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
                    className="absolute top-full left-0 mt-2 w-[480px] bg-background dark:bg-background border border-border rounded-lg shadow-xl py-6 px-6 z-50 animate-fade-in"
                  >
                    <div className="grid grid-cols-1 gap-8">
                      {businessDropdown.sections.map((section, index) => (
                        <div key={index}>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            {section.title}
                          </h3>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                className="group/item block p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                onClick={() => setActiveDropdown(null)}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground mt-1">
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
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/compliance') && "text-foreground font-medium"
                )}
              >
                Compliance
              </Link>

              <Link
                to="/website/relationship-manager"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/relationship-manager') && "text-foreground font-medium"
                )}
              >
                Dedicated Account Manager
              </Link>

              {/* Resources Dropdown */}
              <div className="relative dropdown-container">
                <button
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleDropdown('resources')}
                >
                  Resources
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    activeDropdown === 'resources' && "rotate-180"
                  )} />
                </button>
                {activeDropdown === 'resources' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[400px] bg-background dark:bg-background border border-border rounded-lg shadow-xl py-6 px-6 z-50 animate-fade-in"
                  >
                    <div className="grid grid-cols-1 gap-8">
                      {resourcesDropdown.sections.map((section, index) => (
                        <div key={index}>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            {section.title}
                          </h3>
                          <div className="space-y-1">
                            {section.items.map((item) => (
                                <Link
                                  key={item.path}
                                  to={item.path}
                                  className="group/item block p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                  onClick={() => setActiveDropdown(null)}
                                >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors">
                                    {item.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground mt-1">
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
                to="/website/contact"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/contact') && "text-foreground font-medium"
                )}
              >
                Contact
              </Link>

              <Link
                to="/website/careers/apply"
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  isActive('/website/careers/apply') && "text-foreground font-medium"
                )}
              >
                Apply Now
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
                  Dedicated Account Manager
                </Link>

                <div>
                  <div className="font-medium text-foreground mb-2">Resources</div>
                  <div className="space-y-3 ml-4">
                    {resourcesDropdown.sections.map((section) => (
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