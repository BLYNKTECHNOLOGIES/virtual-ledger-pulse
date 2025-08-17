
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

      {/* Contact Methods */}
      <section className="py-20 -mt-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            <div className="text-center group">
              <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 group-hover:border-primary/20 transition-all duration-500 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent group-hover:from-primary/10 transition-all duration-500" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300 mb-6">
                    <Phone className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-foreground">Call Us</h3>
                  <p className="text-xl font-semibold text-primary mb-2">+91 9266712788</p>
                  <p className="text-muted-foreground">Mon-Fri 9am-6pm IST</p>
                </div>
              </div>
            </div>

            <div className="text-center group">
              <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 group-hover:border-primary/20 transition-all duration-500 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent group-hover:from-primary/10 transition-all duration-500" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300 mb-6">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-foreground">Email Us</h3>
                  <p className="text-xl font-semibold text-primary mb-2">support@blynkex.com</p>
                  <p className="text-muted-foreground">24-hour response time</p>
                </div>
              </div>
            </div>

            <div className="text-center group">
              <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 group-hover:border-primary/20 transition-all duration-500 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent group-hover:from-primary/10 transition-all duration-500" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300 mb-6">
                    <MessageSquare className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-foreground">Live Chat</h3>
                  <p className="text-xl font-semibold text-primary mb-2">Instant support</p>
                  <p className="text-muted-foreground">Available 24/7</p>
                </div>
              </div>
            </div>

            <div className="text-center group">
              <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 group-hover:border-primary/20 transition-all duration-500 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-primary/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent group-hover:from-primary/10 transition-all duration-500" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300 mb-6">
                    <Headphones className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-2xl mb-3 text-foreground">Support</h3>
                  <p className="text-xl font-semibold text-primary mb-2">Help Center</p>
                  <p className="text-muted-foreground">FAQs & Guides</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-20">
            {/* Contact Form */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl" />
              <div className="relative bg-background/80 backdrop-blur-sm border border-primary/10 rounded-3xl p-8 shadow-2xl">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold mb-4 flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                      <Send className="h-6 w-6 text-primary" />
                    </div>
                    Send us a Message
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Tell us about your project and we'll get back to you within 24 hours.
                  </p>
                </div>
                
                <form className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-base font-medium">First Name *</Label>
                      <Input id="firstName" placeholder="John" className="h-12 border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-base font-medium">Last Name *</Label>
                      <Input id="lastName" placeholder="Doe" className="h-12 border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-base font-medium">Email Address *</Label>
                    <Input id="email" type="email" placeholder="john@example.com" className="h-12 border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-base font-medium">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="+91 98765 43210" className="h-12 border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subject" className="text-base font-medium">Subject *</Label>
                    <Input id="subject" placeholder="How can we help you?" className="h-12 border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-base font-medium">Message *</Label>
                    <Textarea 
                      id="message" 
                      placeholder="Tell us about your project requirements, timeline, and budget..."
                      rows={6}
                      className="border-primary/20 bg-background/50 focus:border-primary focus:ring-primary/20 resize-none"
                    />
                  </div>
                  
                  <Button className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground text-lg py-4 h-14 rounded-xl shadow-lg hover:shadow-primary/20 transition-all duration-300">
                    <Send className="mr-3 h-5 w-5" />
                    Send Message
                  </Button>
                </form>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-8">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl" />
                <div className="relative bg-background/80 backdrop-blur-sm border border-primary/10 rounded-3xl p-8 shadow-2xl">
                  <div className="mb-8">
                    <h2 className="text-3xl font-bold mb-4 flex items-center gap-3">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                        <MapPin className="h-6 w-6 text-primary" />
                      </div>
                      Our Office
                    </h2>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="flex items-start space-x-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 flex-shrink-0">
                        <MapPin className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl mb-3 text-foreground">Address</h3>
                        <p className="text-muted-foreground leading-relaxed text-base">
                          First Floor Balwant Arcade, Plot No. 15<br />
                          Maharana Pratap Nagar, Zone II<br />
                          Bhopal, 462011, Madhya Pradesh, India
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 flex-shrink-0">
                        <Clock className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl mb-3 text-foreground">Business Hours</h3>
                        <div className="text-muted-foreground space-y-2 text-base">
                          <div className="flex justify-between items-center">
                            <span>Monday - Friday:</span>
                            <span className="font-medium">9:00 AM - 6:00 PM</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Saturday:</span>
                            <span className="font-medium">10:00 AM - 4:00 PM</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Sunday:</span>
                            <span className="font-medium">Closed</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start space-x-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 flex-shrink-0">
                        <Globe className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl mb-3 text-foreground">Service Areas</h3>
                        <p className="text-muted-foreground text-base">
                          We serve clients globally with our remote-first approach, specializing in VASP solutions for India and international markets.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map Placeholder */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl" />
                <div className="relative bg-background/80 backdrop-blur-sm border border-primary/10 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-64 flex items-center justify-center">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
                        <MapPin className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-bold text-xl mb-2">Interactive Map</h3>
                      <p className="text-muted-foreground">Coming Soon</p>
                    </div>
                  </div>
                </div>
              </div>
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
