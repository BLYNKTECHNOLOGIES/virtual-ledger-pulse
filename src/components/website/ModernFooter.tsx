import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Twitter, Linkedin, Mail, MessageCircle, Phone, MapPin, Shield, CheckCircle, Flag } from 'lucide-react';

export function ModernFooter() {
  const currentYear = new Date().getFullYear();

  const individualServices = [
    { name: 'P2P Trading Platform', path: '/website/p2p-trading' },
    { name: 'Buy USDT with INR', path: '/website/buy-usdt' },
    { name: 'Sell Crypto Instantly', path: '/website/sell-crypto' },
    { name: '24/7 Support via WhatsApp', path: '/website/support' }
  ];

  const businessServices = [
    { name: 'Bulk Crypto Orders', path: '/website/bulk-orders' },
    { name: 'INR Settlements for Institutions', path: '/website/institutional' },
    { name: 'Dedicated OTC Desk', path: '/website/otc' },
    { name: 'KYC Verification Support', path: '/website/kyc-support' }
  ];

  const companyLinks = [
    { name: 'About Us', path: '/website/about' },
    { name: 'Legal & Compliance', path: '/website/compliance' },
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
              <strong className="text-foreground">VASPCorp</strong><br />
              Registered Virtual Asset Service Provider (VASP) in India.<br />
              We provide secure, compliant, and efficient P2P crypto services with instant INR settlements.
            </p>
            
            {/* Trust Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                <Shield className="h-3 w-3" />
                Escrow Protected
              </div>
              <div className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
                <CheckCircle className="h-3 w-3" />
                100% KYC Compliant
              </div>
              <div className="flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 px-2 py-1 rounded">
                <Flag className="h-3 w-3" />
                Indian VASP Registered
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Linkedin className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MessageCircle className="h-4 w-4" />
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

          {/* Company Links */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Company</h3>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
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
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Contact Info</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <div>
                  <strong className="text-foreground">Email:</strong><br />
                  contact@vaspcorp.in
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 text-primary" />
                <div>
                  <strong className="text-foreground">Phone:</strong><br />
                  +91-9266712788
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary mt-1" />
                <div>
                  <strong className="text-foreground">Location:</strong><br />
                  India
                </div>
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
                Get real-time updates on crypto trends, P2P offers, compliance alerts, and policy changes.
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
            © {currentYear} VASPCorp. All rights reserved. | Registered in India | VASP ID: VASP-IN-2024-001
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <Link to="/website/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/website/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link to="/website/compliance" className="text-muted-foreground hover:text-foreground transition-colors">
              AML & KYC Compliance
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}