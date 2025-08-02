import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Twitter, Github, Linkedin, Mail } from 'lucide-react';

export function ModernFooter() {
  const currentYear = new Date().getFullYear();

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

  const quickLinks = [
    { name: 'About Us', path: '/website/about' },
    { name: 'Security', path: '/website/security' },
    { name: 'Privacy Policy', path: '/website/privacy' },
    { name: 'Terms of Service', path: '/website/terms' }
  ];

  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/website" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-foreground">VASPCorp</span>
            </Link>
            
            <p className="text-muted-foreground max-w-md">
              Leading the future of digital finance with secure, compliant, and innovative 
              cryptocurrency solutions for individuals and businesses worldwide.
            </p>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Github className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Linkedin className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* For Individuals */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">For Individuals</h3>
            <ul className="space-y-2">
              {individualServices.map((service) => (
                <li key={service.path}>
                  <Link 
                    to={service.path} 
                    className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  >
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* For Businesses */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">For Businesses</h3>
            <ul className="space-y-2">
              {businessServices.map((service) => (
                <li key={service.path}>
                  <Link 
                    to={service.path} 
                    className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  >
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Company</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link 
                    to={link.path} 
                    className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
            
            {/* Contact Info */}
            <div className="space-y-2 pt-4">
              <div className="text-sm text-muted-foreground">
                <strong className="text-foreground">Email:</strong><br />
                contact@vaspcorp.com
              </div>
              <div className="text-sm text-muted-foreground">
                <strong className="text-foreground">Phone:</strong><br />
                +1 (555) 123-4567
              </div>
            </div>
          </div>
        </div>

        {/* Newsletter Signup */}
        <div className="border-t border-border mt-12 pt-8">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Stay Updated</h3>
              <p className="text-sm text-muted-foreground">
                Get the latest news and updates about cryptocurrency markets and our services.
              </p>
            </div>
            
            <div className="flex gap-2">
              <Input 
                type="email" 
                placeholder="Enter your email"
                className="flex-1"
              />
              <Button className="bg-primary hover:bg-primary/90">
                Subscribe
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            © {currentYear} VASPCorp. All rights reserved.
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <Link to="/website/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/website/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link to="/website/cookies" className="text-muted-foreground hover:text-foreground transition-colors">
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}