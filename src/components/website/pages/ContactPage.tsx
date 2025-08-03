
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Headphones, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-24 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/10 bg-grid-16 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              Get in Touch
            </h1>
            <p className="text-xl text-primary-foreground/90 max-w-3xl mx-auto">
              Ready to transform your business? Our team of experts is here to help you achieve your goals with cutting-edge technology solutions.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Methods Cards */}
      <section className="py-16 -mt-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <Card className="border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-4">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Call Us</h3>
                <p className="text-muted-foreground text-sm mb-2">+91 9266712788</p>
                <p className="text-xs text-muted-foreground">Mon-Fri 9am-6pm IST</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-4">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Email Us</h3>
                <p className="text-muted-foreground text-sm mb-2">support@blynkex.com</p>
                <p className="text-xs text-muted-foreground">24-hour response time</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-4">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Live Chat</h3>
                <p className="text-muted-foreground text-sm mb-2">Instant support</p>
                <p className="text-xs text-muted-foreground">Available 24/7</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6 text-center">
                <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-4">
                  <Headphones className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Support</h3>
                <p className="text-muted-foreground text-sm mb-2">Help Center</p>
                <p className="text-xs text-muted-foreground">FAQs & Guides</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-16">
            {/* Contact Form */}
            <div>
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Send className="h-6 w-6 text-primary" />
                    Send us a Message
                  </CardTitle>
                  <p className="text-muted-foreground">
                    Tell us about your project and we'll get back to you within 24 hours.
                  </p>
                </CardHeader>
                <CardContent>
                  <form className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input id="firstName" placeholder="John" className="border-border/50" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input id="lastName" placeholder="Doe" className="border-border/50" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input id="email" type="email" placeholder="john@example.com" className="border-border/50" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input id="phone" type="tel" placeholder="+91 98765 43210" className="border-border/50" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject *</Label>
                      <Input id="subject" placeholder="How can we help you?" className="border-border/50" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="message">Message *</Label>
                      <Textarea 
                        id="message" 
                        placeholder="Tell us about your project requirements, timeline, and budget..."
                        rows={5}
                        className="border-border/50"
                      />
                    </div>
                    
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-lg py-3 h-12">
                      <Send className="mr-2 h-5 w-5" />
                      Send Message
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Contact Information */}
            <div className="space-y-8">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <MapPin className="h-6 w-6 text-primary" />
                    Our Office
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="bg-primary/10 p-3 rounded-lg flex-shrink-0">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Address</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        First Floor Balwant Arcade, Plot No. 15<br />
                        Maharana Pratap Nagar, Zone II<br />
                        Bhopal, 462011, Madhya Pradesh, India
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="bg-primary/10 p-3 rounded-lg flex-shrink-0">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Business Hours</h3>
                      <div className="text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Monday - Friday:</span>
                          <span>9:00 AM - 6:00 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Saturday:</span>
                          <span>10:00 AM - 4:00 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sunday:</span>
                          <span>Closed</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="bg-primary/10 p-3 rounded-lg flex-shrink-0">
                      <Globe className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Service Areas</h3>
                      <p className="text-muted-foreground">
                        We serve clients globally with our remote-first approach, specializing in VASP solutions for India and international markets.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Map Placeholder */}
              <Card className="border-border/50">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg h-64 flex items-center justify-center border border-border/50">
                    <div className="text-center">
                      <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
                      <h3 className="font-semibold text-lg mb-2">Interactive Map</h3>
                      <p className="text-muted-foreground">Coming Soon</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
          <p className="text-muted-foreground mb-12">
            Can't find what you're looking for? Contact us directly and we'll be happy to help.
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 text-left">
            <div>
              <h3 className="font-semibold text-lg mb-2">What services do you offer?</h3>
              <p className="text-muted-foreground">
                We specialize in web development, mobile apps, VASP solutions, CRM/ERP systems, and blockchain development.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">How long does a project take?</h3>
              <p className="text-muted-foreground">
                Project timelines vary based on complexity. We provide detailed estimates during our initial consultation.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">Do you work with international clients?</h3>
              <p className="text-muted-foreground">
                Yes, we work with clients globally and are experienced in international compliance requirements.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">What is your support policy?</h3>
              <p className="text-muted-foreground">
                We offer 24/7 support for critical issues and provide ongoing maintenance for all our solutions.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
