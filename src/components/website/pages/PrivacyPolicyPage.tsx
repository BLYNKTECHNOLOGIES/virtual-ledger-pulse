import { Shield, Lock, Eye, Users, Database, Globe, Phone, Mail, MapPin, AlertTriangle, FileText, Gavel, Clock } from 'lucide-react';

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
              Comprehensive Data Protection and Privacy Framework
            </p>
            <p className="text-muted-foreground">
              <strong>Effective Date:</strong> January 1, 2024 | <strong>Last Updated:</strong> January 1, 2024 | <strong>Version:</strong> 2.0
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto space-y-16">
          
          {/* 1. Introduction and Definitions */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Eye className="h-8 w-8 text-primary" />
              1. Introduction and Definitions
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Blynk Virtual Technologies Private Limited ("Blynk," "Company," "we," "us," or "our") is committed to protecting and respecting your privacy. This Privacy Policy ("Policy") describes how we collect, use, process, store, share, and protect personal information when you access or use our peer-to-peer cryptocurrency trading platform, website, mobile applications, and related services (collectively, the "Services"). This Policy applies to all users, visitors, and others who access or use our Services ("Users," "you," or "your").
              </p>

              <p>
                As a Virtual Asset Service Provider (VASP) operating under Indian jurisdiction and complying with global standards, we adhere to the highest levels of data protection, privacy, and regulatory compliance. We are registered under the Ministry of Corporate Affairs, India, bearing Company Identification Number (CIN) U62099MP2025PTC074915, and operate in full compliance with the Financial Intelligence Unit - India (FIU-IND) guidelines, Prevention of Money Laundering Act (PMLA) 2002, Information Technology Act 2000, Digital Personal Data Protection Act 2023, and other applicable laws and regulations.
              </p>

              <p>
                This Policy is designed to be transparent, comprehensive, and user-centric. We believe that privacy is a fundamental right, and we have structured our data practices to give you meaningful control over your personal information. By accessing or using our Services, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy and our Terms of Service.
              </p>

              <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-lg border border-amber-200 dark:border-amber-800 mt-6">
                <h3 className="text-xl font-semibold text-foreground mb-4">Key Definitions</h3>
                <div className="space-y-3 text-sm">
                  <p><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person, including but not limited to name, identification numbers, location data, online identifiers, or factors specific to physical, physiological, genetic, mental, economic, cultural, or social identity.</p>
                  <p><strong>Processing:</strong> Any operation performed on personal data, including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, dissemination, restriction, erasure, or destruction.</p>
                  <p><strong>VASP:</strong> Virtual Asset Service Provider as defined under applicable Indian and international regulations for entities providing services related to virtual assets including cryptocurrency trading, wallet services, and related financial services.</p>
                  <p><strong>KYC:</strong> Know Your Customer procedures mandated under Indian law for identity verification, risk assessment, and customer due diligence.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Legal Basis for Processing Personal Data */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Gavel className="h-8 w-8 text-primary" />
              2. Legal Basis for Processing Personal Data
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We process personal data only when we have a valid legal basis under applicable data protection laws including the Information Technology Act 2000, Digital Personal Data Protection Act 2023, and international standards where applicable. Our processing activities are grounded in specific legal bases that ensure compliance with Indian and international privacy regulations.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.1 Regulatory Compliance and Legal Obligations</h3>
                  <p>
                    As a VASP operating in India, we are subject to numerous legal obligations that require the processing of personal data. This includes compliance with PMLA requirements for customer due diligence, FIU-IND reporting obligations for suspicious transactions, income tax reporting requirements under the Income Tax Act 1961, RBI guidelines for digital payments, FEMA compliance for foreign exchange transactions, and other applicable financial services regulations. We also process data to comply with court orders, regulatory investigations, and law enforcement requests under the Code of Criminal Procedure 1973 and other applicable laws.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.2 Contractual Necessity</h3>
                  <p>
                    We process personal data that is necessary for the performance of our Terms of Service and to provide the Services you have requested. This includes account creation, identity verification through Aadhaar-based eKYC, transaction processing using UPI and IMPS systems, customer support, and platform security measures. Without this processing, we cannot provide our cryptocurrency trading services effectively or comply with the regulatory framework governing VASPs in India.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.3 Consent</h3>
                  <p>
                    We process certain categories of personal data based on your explicit consent, particularly for marketing communications, optional features like portfolio analytics, non-essential cookies for user experience enhancement, precise location tracking for fraud prevention, and biometric data for enhanced security. You have the right to withdraw your consent at any time through your account settings or by contacting our Data Protection Officer. Withdrawal of consent does not affect the lawfulness of processing based on consent before its withdrawal.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.4 Legitimate Interests</h3>
                  <p>
                    We process personal data for legitimate business interests that are not overridden by your privacy rights. These interests include fraud prevention and security measures using advanced analytics, improving our Services through usage analytics and user behavior analysis, conducting business development activities, protecting our legal rights and intellectual property, ensuring network and information security, and preventing money laundering and terrorist financing. We conduct periodic balancing tests to ensure that our legitimate interests do not outweigh your fundamental rights and freedoms.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. KYC/AML Data and Financial Record Handling */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              3. KYC/AML Data and Financial Record Handling
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                As a VASP operating under Indian jurisdiction, we maintain comprehensive KYC and AML procedures that involve the collection, processing, and retention of extensive financial and personal information. These procedures are mandated by the Prevention of Money Laundering Act (PMLA) 2002, FIU-IND guidelines, RBI Master Directions, and other applicable regulations, and are essential for maintaining the integrity of the financial system and preventing financial crimes.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.1 Comprehensive KYC Documentation Requirements</h3>
                  <p>
                    Our KYC process involves comprehensive identity verification that includes collecting and verifying Aadhaar cards with biometric authentication, PAN cards with income tax database verification, passport and visa documentation for foreign nationals, voter ID cards and driving licenses as additional proof, bank account statements for last six months, salary certificates and employment verification letters, and income tax returns for previous two years. We conduct address verification through utility bills, rental agreements, bank statements, and property documents. Live photograph verification includes selfie with document verification, video KYC through authorized intermediaries, and biometric verification using fingerprint and facial recognition technology where legally permitted.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.2 Enhanced Due Diligence and Risk Assessment</h3>
                  <p>
                    We implement risk-based KYC procedures that include enhanced due diligence for high-net-worth individuals with transaction volumes exceeding specified thresholds, politically exposed persons (PEPs) screening through global databases, sanctions list screening against UNSC, EU, OFAC, and other international lists, adverse media screening for negative news and litigation history, and source of wealth verification for large transactions. Our risk assessment framework evaluates customer risk profiles based on geographic location, transaction patterns, occupation and business activity, source of funds and wealth, and relationships with high-risk entities. We maintain detailed risk assessment documentation and conduct periodic reviews as mandated by regulatory guidelines.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.3 Transaction Monitoring and Suspicious Activity Reporting</h3>
                  <p>
                    We implement sophisticated anti-money laundering monitoring systems that analyze transaction patterns using machine learning algorithms, identify suspicious activities through behavioral analysis and pattern recognition, generate automated alerts for manual review by compliance officers, maintain comprehensive audit trails with blockchain integration for transparency, and ensure timely reporting to FIU-IND within prescribed timelines. Our AML procedures include ongoing customer monitoring with real-time transaction analysis, periodic review of customer risk profiles with automated triggers, screening against sanctions lists and politically exposed persons databases with daily updates, and maintaining detailed records of all compliance activities including investigation reports and regulatory correspondence.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.4 Cross-Border Transaction Compliance</h3>
                  <p>
                    For transactions involving international elements, we implement enhanced monitoring procedures that include verification of source and destination of funds through correspondent banking networks, compliance with foreign exchange regulations under FEMA 1999, screening for sanctions and embargo compliance across multiple international databases, reporting to FEMA authorities for transactions exceeding specified limits, and maintenance of detailed records for cross-border transaction analysis. We also ensure compliance with international standards including FATF recommendations, correspondent banking requirements, and bilateral regulatory agreements between India and other jurisdictions.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Phone className="h-8 w-8 text-primary" />
              Contact Information - Data Protection Officer
            </h2>
            
            <div className="bg-primary/5 p-8 rounded-lg border border-primary/20">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Privacy and Data Protection Inquiries
                  </h3>
                  <div className="space-y-3 text-muted-foreground">
                    <p><strong className="text-foreground">Email:</strong> privacy@blynkcrypto.in</p>
                    <p><strong className="text-foreground">Data Protection Officer:</strong> dpo@blynkcrypto.in</p>
                    <p><strong className="text-foreground">Compliance Officer:</strong> compliance@blynkcrypto.in</p>
                    <p><strong className="text-foreground">Response Time:</strong> Within 72 hours for all privacy requests</p>
                    <p><strong className="text-foreground">Support Hours:</strong> Monday to Friday, 9:00 AM - 6:00 PM IST</p>
                    <p><strong className="text-foreground">Emergency Contact:</strong> Available 24/7 for data breach notifications</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Registered Office and Legal Address
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
                    <p><strong className="text-foreground">GSTIN:</strong> [GST Registration Number]</p>
                    <p><strong className="text-foreground">Phone:</strong> +91-XXX-XXX-XXXX</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-background/50 rounded-lg border">
                <h4 className="text-lg font-semibold text-foreground mb-3">For Data Subject Requests Under DPDP Act 2023, Please Include:</h4>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Your full legal name as per government-issued identification</li>
                  <li>• Registered email address and verified mobile number</li>
                  <li>• Specific nature of your privacy request (access, portability, correction, erasure, etc.)</li>
                  <li>• Account verification information (we may request additional KYC verification for security)</li>
                  <li>• Preferred method of response (secure email, registered post, in-person collection)</li>
                  <li>• Any supporting documentation relevant to your request</li>
                  <li>• Clear statement of consent for processing your request</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Policy Updates and Governing Law */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              Policy Updates, Governing Law, and Jurisdiction
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-4">Governing Law and Jurisdiction</h3>
                <p>
                  This Privacy Policy and all matters relating to your privacy rights and our data processing activities shall be governed by and construed in accordance with the laws of India, including but not limited to the Information Technology Act 2000, Digital Personal Data Protection Act 2023, Prevention of Money Laundering Act 2002, Indian Contract Act 1872, and other applicable central and state laws. Any disputes arising out of or in connection with this Privacy Policy shall be subject to the exclusive jurisdiction of the courts in Bhopal, Madhya Pradesh, India. However, we retain the right to bring proceedings against you for breach of this Privacy Policy in your country of residence or any other relevant country.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-foreground mb-3">Material Changes Notification Process</h3>
                <p className="text-muted-foreground mb-3">
                  For material changes to this Policy that may affect your rights or how we process your personal data, we will provide at least 30 days advance notice through multiple channels:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Email notification to your registered email address with delivery confirmation</li>
                  <li>• Prominent banner notice on our website and mobile applications</li>
                  <li>• In-app notifications with acknowledgment requirements for active users</li>
                  <li>• SMS notification to your registered mobile number for critical changes</li>
                  <li>• Publication in leading English and Hindi newspapers for significant policy overhauls</li>
                  <li>• Updated version history with detailed change summaries and impact assessments</li>
                </ul>
              </div>

              <div className="bg-primary/10 p-8 rounded-lg border border-primary/30">
                <h3 className="text-2xl font-bold text-foreground mb-4 text-center">Thank You for Trusting Blynk with Your Privacy</h3>
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground max-w-4xl mx-auto">
                    Your privacy and data security are fundamental to our mission of providing secure, compliant, and user-centric cryptocurrency trading services in India. We are committed to maintaining the highest standards of data protection, regulatory compliance, and transparency in all our operations. This comprehensive Privacy Policy reflects our dedication to protecting your personal information while enabling us to provide innovative financial services in the evolving digital asset ecosystem.
                  </p>
                  <div className="space-y-2">
                    <p className="text-muted-foreground"><strong>Current Policy Version:</strong> 2.0</p>
                    <p className="text-muted-foreground"><strong>Effective Date:</strong> January 1, 2024</p>
                    <p className="text-muted-foreground"><strong>Last Comprehensive Review:</strong> January 1, 2024</p>
                    <p className="text-muted-foreground"><strong>Next Scheduled Review:</strong> July 1, 2024</p>
                    <p className="text-muted-foreground"><strong>Regulatory Compliance:</strong> DPDP Act 2023, PMLA 2002, IT Act 2000, FIU-IND Guidelines</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}