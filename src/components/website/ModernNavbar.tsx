import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronDown, Menu, X, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ModernNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const individualServices = [
    { name: 'Crypto Wallet', path: '/website/wallet' },
    { name: 'Buy Crypto', path: '/website/buy-crypto' },
    { name: 'Bill Pay', path: '/website/bill-pay' },
    { name: 'Gift Cards', path: '/website/gift-cards' }
  ];

  const businessServices = [
    { name: 'Payment Processing', path: '/website/payment-processing' },
    { name: 'Treasury Management', path: '/website/treasury' },
    { name: 'Compliance Solutions', path: '/website/compliance' },
    { name: 'API Integration', path: '/website/api' }
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Security Banner */}
      <div className="bg-warning/10 border-b border-warning/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-warning" />
          <span className="text-warning font-medium">Security Alert: Protect Yourself From Social Engineering Attacks</span>
          <Button variant="link" size="sm" className="text-warning underline">
            Learn More
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/website" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-foreground">VASPCorp</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            {/* For Individuals Dropdown */}
            <div className="relative group">
              <button
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                onMouseEnter={() => setActiveDropdown('individuals')}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                For Individuals
                <ChevronDown className="h-4 w-4" />
              </button>
              {activeDropdown === 'individuals' && (
                <div 
                  className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg py-2"
                  onMouseEnter={() => setActiveDropdown('individuals')}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  {individualServices.map((service) => (
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
                  className="absolute top-full left-0 mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg py-2"
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
              to="/website/developers"
              className={cn(
                "text-muted-foreground hover:text-foreground transition-colors",
                isActive('/website/developers') && "text-foreground font-medium"
              )}
            >
              Developers
            </Link>

            <Link
              to="/website/help"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Help
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
              className="bg-primary hover:bg-primary/90"
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
              <div>
                <div className="font-medium text-foreground mb-2">For Individuals</div>
                <div className="space-y-2 ml-4">
                  {individualServices.map((service) => (
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
                to="/website/developers"
                className="block text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Developers
              </Link>

              <Link
                to="/website/help"
                className="block text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Help
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
                  className="justify-start bg-primary hover:bg-primary/90"
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}