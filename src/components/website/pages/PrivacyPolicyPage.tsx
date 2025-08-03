
import { Shield, Lock, Eye, Users, Database, Globe, Phone, Mail, MapPin } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6">
              <Shield className="h-16 w-16 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Privacy Policy
            </h1>
            <p className="text-xl text-muted-foreground mb-4">
              Your privacy and data security are our top priorities
            </p>
            <p className="text-muted-foreground">
              <strong>Effective Date:</strong> January 1, 2024 | <strong>Last Updated:</strong> January 1, 2024
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto prose prose-lg max-w-none">
          
          {/* Introduction & Purpose */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Eye className="h-8 w-8 text-primary" />
              Introduction & Our Commitment to Your Privacy
            </h2>
            <div className="bg-primary/5 p-6 rounded-lg border border-primary/20 mb-6">
              <p className="text-foreground mb-4">
                At <strong className="italic">blynk</strong>, we believe that privacy is a fundamental right. This Privacy Policy explains how Blynk Virtual Technologies Private Limited ("Blynk," "we," "us," or "our") collects, uses, processes, and protects your personal information when you use our cryptocurrency trading platform and related services.
              </p>
              <p className="text-muted-foreground">
                We're committed to being transparent about our data practices and giving you meaningful control over your information. This policy is designed to help you understand your privacy rights and how to exercise them.
              </p>
            </div>
          </section>

          {/* Who We Are */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              Who We Are
            </h2>
            <div className="bg-card p-6 rounded-lg border mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-4">Company Information</h3>
              <div className="space-y-3 text-muted-foreground">
                <p><strong className="text-foreground">Company Name:</strong> Blynk Virtual Technologies Private Limited</p>
                <p><strong className="text-foreground">CIN:</strong> U62099MP2025PTC074915</p>
                <p><strong className="text-foreground">Website:</strong> https://www.blynkcrypto.in</p>
                <p><strong className="text-foreground">Registered Office:</strong> First Floor Balwant Arcade, Plot No. 15, Maharana Pratap Nagar, Zone II, Bhopal, 462011, Madhya Pradesh, India</p>
                <p><strong className="text-foreground">VASP Registration:</strong> Compliant with FIU-IND guidelines</p>
              </div>
            </div>
            <p className="text-muted-foreground">
              Blynk is a technology company that operates a peer-to-peer cryptocurrency trading platform in India. We facilitate secure crypto transactions while ensuring full compliance with Indian regulations, including the Financial Intelligence Unit (FIU-IND) guidelines and the Prevention of Money Laundering Act (PMLA).
            </p>
          </section>

          {/* Scope of Policy */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Globe className="h-8 w-8 text-primary" />
              Scope of This Policy
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-primary/5 p-6 rounded-lg border border-primary/20">
                <h3 className="text-lg font-semibold text-foreground mb-3">This Policy Applies To:</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Website visitors and users</li>
                  <li>• Registered account holders</li>
                  <li>• Mobile app users</li>
                  <li>• KYC verification participants</li>
                  <li>• Newsletter subscribers</li>
                  <li>• Customer support interactions</li>
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-lg font-semibold text-foreground mb-3">Services Covered:</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Cryptocurrency trading platform</li>
                  <li>• P2P trading services</li>
                  <li>• Digital wallet services</li>
                  <li>• KYC and compliance services</li>
                  <li>• Customer support</li>
                  <li>• Educational resources</li>
                </ul>
              </div>
            </div>
          </section>

          {/* What Information We Collect */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Database className="h-8 w-8 text-primary" />
              What Information We Collect
            </h2>
            
            <div className="space-y-8">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">1. Personal Identification Information</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Basic Information:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Full name as per government ID</li>
                      <li>• Date of birth</li>
                      <li>• Email address</li>
                      <li>• Mobile phone number</li>
                      <li>• Residential address</li>
                      <li>• Nationality and citizenship status</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Government Documents:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• PAN (Permanent Account Number)</li>
                      <li>• Aadhaar number and document</li>
                      <li>• Passport (if applicable)</li>
                      <li>• Driving license</li>
                      <li>• Bank account details</li>
                      <li>• Live selfie and photo verification</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">2. Financial and Transaction Data</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Transaction Information:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Cryptocurrency addresses and wallets</li>
                      <li>• Transaction amounts and timestamps</li>
                      <li>• Trading history and patterns</li>
                      <li>• Payment method preferences</li>
                      <li>• UPI IDs and bank details</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Risk Assessment Data:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Source of funds information</li>
                      <li>• Income verification documents</li>
                      <li>• Trading frequency and volume</li>
                      <li>• Risk scoring and compliance flags</li>
                      <li>• Suspicious activity reports</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">3. Technical and Usage Data</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Device Information:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• IP address and location data</li>
                      <li>• Device type, model, and OS</li>
                      <li>• Browser type and version</li>
                      <li>• Screen resolution and device ID</li>
                      <li>• App version and settings</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Behavioral Data:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Pages visited and time spent</li>
                      <li>• Click patterns and navigation</li>
                      <li>• Search queries and preferences</li>
                      <li>• Feature usage analytics</li>
                      <li>• Error logs and crash reports</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">4. Communication and Support Data</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Customer support conversations and tickets</li>
                  <li>• Live chat messages and call recordings</li>
                  <li>• Email communications and responses</li>
                  <li>• Feedback, surveys, and reviews</li>
                  <li>• Marketing communication preferences</li>
                  <li>• Social media interactions (if linked)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Collect Information */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6">How We Collect Your Information</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-primary/5 p-6 rounded-lg border border-primary/20">
                <h3 className="text-lg font-semibold text-foreground mb-4">Direct Collection Methods:</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Registration and account setup forms</li>
                  <li>• KYC verification process</li>
                  <li>• Manual document uploads</li>
                  <li>• Profile updates and settings</li>
                  <li>• Customer support interactions</li>
                  <li>• Survey responses and feedback</li>
                </ul>
              </div>
              
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Automatic Collection Methods:</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Cookies and tracking technologies</li>
                  <li>• Mobile app analytics and permissions</li>
                  <li>• Website usage and navigation data</li>
                  <li>• Transaction monitoring systems</li>
                  <li>• Security and fraud detection tools</li>
                  <li>• Third-party API integrations</li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800 mt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">Third-Party Sources:</h3>
              <p className="text-muted-foreground mb-3">
                We may also collect information about you from trusted third-party sources to verify your identity, prevent fraud, and comply with regulations:
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Government databases for identity verification</li>
                <li>• Banking partners for payment processing</li>
                <li>• Credit agencies for financial assessment</li>
                <li>• Blockchain networks for transaction verification</li>
                <li>• Security vendors for fraud prevention</li>
              </ul>
            </div>
          </section>

          {/* How We Use Your Data */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Lock className="h-8 w-8 text-primary" />
              How We Use Your Information
            </h2>
            
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">1. Regulatory Compliance & Legal Obligations</h3>
                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-muted-foreground mb-3">
                    As a VASP operating in India, we use your information to comply with various legal and regulatory requirements:
                  </p>
                  <ul className="space-y-1 text-muted-foreground text-sm">
                    <li>• <strong>FIU-IND Reporting:</strong> Suspicious transaction monitoring and reporting</li>
                    <li>• <strong>PMLA Compliance:</strong> Customer due diligence and record keeping</li>
                    <li>• <strong>Income Tax:</strong> TDS reporting and tax compliance assistance</li>
                    <li>• <strong>RBI Guidelines:</strong> Adherence to central banking directives</li>
                    <li>• <strong>Law Enforcement:</strong> Responding to lawful requests and investigations</li>
                  </ul>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">2. Platform Security & Fraud Prevention</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• <strong>Identity Verification:</strong> Confirming you are who you claim to be</li>
                  <li>• <strong>Account Security:</strong> Protecting against unauthorized access</li>
                  <li>• <strong>Transaction Monitoring:</strong> Detecting suspicious or fraudulent activity</li>
                  <li>• <strong>Risk Assessment:</strong> Evaluating transaction patterns and user behavior</li>
                  <li>• <strong>Security Alerts:</strong> Notifying you of unusual account activity</li>
                </ul>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">3. Service Provision & Enhancement</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Core Services:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Processing cryptocurrency transactions</li>
                      <li>• Matching P2P trading orders</li>
                      <li>• Facilitating INR settlements</li>
                      <li>• Managing digital wallets</li>
                      <li>• Providing trading history and reports</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Platform Improvement:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Analyzing usage patterns</li>
                      <li>• Optimizing user experience</li>
                      <li>• Developing new features</li>
                      <li>• Fixing bugs and technical issues</li>
                      <li>• Personalizing content and recommendations</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">4. Communication & Customer Support</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• <strong>Account Notifications:</strong> Transaction confirmations, security alerts, and account updates</li>
                  <li>• <strong>Customer Support:</strong> Responding to inquiries, troubleshooting, and providing assistance</li>
                  <li>• <strong>Regulatory Updates:</strong> Informing you about policy changes and compliance requirements</li>
                  <li>• <strong>Educational Content:</strong> Sharing crypto market insights and trading tips (with consent)</li>
                  <li>• <strong>Marketing Communications:</strong> Promotional offers and new feature announcements (opt-in only)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Cookies and Tracking */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6">Cookies & Tracking Technologies</h2>
            
            <div className="bg-primary/5 p-6 rounded-lg border border-primary/20 mb-6">
              <p className="text-foreground mb-4">
                We use cookies and similar tracking technologies to enhance your experience, improve our services, and ensure platform security. You have control over most cookie settings through your browser.
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">Types of Cookies We Use:</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Essential Cookies (Required):</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• User authentication and session management</li>
                      <li>• Security features and fraud prevention</li>
                      <li>• Load balancing and platform stability</li>
                      <li>• Remember your preferences and settings</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Functional Cookies (Optional):</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Language and regional preferences</li>
                      <li>• Theme and display settings</li>
                      <li>• Recently viewed items</li>
                      <li>• Customized dashboard layouts</li>
                    </ul>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Analytics Cookies (Optional):</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Google Analytics for usage statistics</li>
                      <li>• Performance monitoring and optimization</li>
                      <li>• Feature usage and engagement metrics</li>
                      <li>• Error tracking and debugging</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Marketing Cookies (Opt-in):</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Social media pixels (Facebook, LinkedIn)</li>
                      <li>• Advertising campaign tracking</li>
                      <li>• Retargeting and personalized ads</li>
                      <li>• Newsletter engagement tracking</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800">
                <h3 className="text-lg font-semibold text-foreground mb-3">Managing Your Cookie Preferences</h3>
                <p className="text-muted-foreground mb-3">
                  You can control cookie settings through:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Our cookie preference center (available on first visit)</li>
                  <li>• Your browser settings (Chrome, Firefox, Safari, Edge)</li>
                  <li>• Account settings for logged-in users</li>
                  <li>• Opting out of third-party analytics (Google Analytics opt-out)</li>
                </ul>
                <p className="text-muted-foreground mt-3 text-sm">
                  <strong>Note:</strong> Disabling essential cookies may affect platform functionality and security features.
                </p>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
              <Phone className="h-8 w-8 text-primary" />
              Contact Us About Privacy
            </h2>
            
            <div className="bg-primary/5 p-6 rounded-lg border border-primary/20 mb-6">
              <p className="text-foreground">
                We're here to help with any privacy questions or concerns. Our dedicated privacy team is committed to responding promptly and transparently.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Data Protection Officer
                </h3>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong className="text-foreground">Email:</strong> privacy@blynkcrypto.in</p>
                  <p><strong className="text-foreground">Response Time:</strong> Within 48 hours</p>
                  <p><strong className="text-foreground">Available:</strong> Monday to Friday, 9 AM - 6 PM IST</p>
                  <p className="text-sm">For urgent privacy matters or data breaches</p>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Registered Office
                </h3>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Blynk Virtual Technologies Private Limited</strong><br />
                    First Floor Balwant Arcade, Plot No. 15<br />
                    Maharana Pratap Nagar, Zone II<br />
                    Bhopal, 462011, Madhya Pradesh<br />
                    India
                  </p>
                  <p><strong className="text-foreground">CIN:</strong> U62099MP2025PTC074915</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800 mt-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">When Contacting Us, Please Include:</h3>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Your registered email address or phone number</li>
                <li>• Clear description of your privacy concern or request</li>
                <li>• Any relevant account information (without passwords)</li>
                <li>• Preferred method and language for our response</li>
              </ul>
            </div>
          </section>

          {/* Updates and Changes */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6">Policy Updates & Changes</h2>
            
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold text-foreground mb-4">How We Handle Policy Updates</h3>
                <p className="text-muted-foreground mb-4">
                  We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or business operations. Here's how we manage updates:
                </p>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Minor Changes:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• Clarifications and formatting improvements</li>
                      <li>• Contact information updates</li>
                      <li>• Non-material operational changes</li>
                      <li>• Updated immediately with notification</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Major Changes:</h4>
                    <ul className="space-y-1 text-muted-foreground text-sm">
                      <li>• New data collection practices</li>
                      <li>• Changes to data sharing policies</li>
                      <li>• Modified user rights or controls</li>
                      <li>• 30-day advance notice required</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-foreground mb-3">How We Notify You</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• <strong>Email Notice:</strong> Sent to your registered email address</li>
                  <li>• <strong>Platform Notification:</strong> Banner or popup when you log in</li>
                  <li>• <strong>Website Update:</strong> Posted prominently on our homepage</li>
                  <li>• <strong>Mobile App Alert:</strong> Push notification for significant changes</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Final Notes */}
          <section className="mb-12">
            <div className="bg-primary/10 p-8 rounded-lg border border-primary/30">
              <h2 className="text-2xl font-bold text-foreground mb-4 text-center">Thank You for Trusting Blynk</h2>
              <p className="text-center text-muted-foreground max-w-3xl mx-auto">
                Your privacy and security are at the heart of everything we do. We're committed to being transparent, 
                giving you control, and continuously improving our practices. If you have any questions or concerns, 
                please don't hesitate to reach out to our privacy team.
              </p>
              
              <div className="flex justify-center mt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Last Updated: January 1, 2024</p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Document Version:</strong> 1.0 | <strong>Effective Date:</strong> January 1, 2024
                  </p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
