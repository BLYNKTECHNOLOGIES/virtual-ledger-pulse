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

          {/* 4. What Information We Collect */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Database className="h-8 w-8 text-primary" />
              4. What Information We Collect
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We collect various types of information to provide, maintain, protect, and improve our Services, comply with legal obligations under Indian law, and ensure the security and integrity of our cryptocurrency trading platform. The information we collect falls into several categories, each serving specific purposes in delivering secure and compliant P2P cryptocurrency trading services while adhering to FIU-IND guidelines and PMLA requirements.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.1 Personal Identification and KYC Information</h3>
                  <p>
                    As mandated by Indian KYC and AML regulations under PMLA 2002 and FIU-IND guidelines, we collect comprehensive personal identification information to verify your identity, assess risk, and comply with regulatory requirements. This includes your full legal name as it appears on government-issued identification documents, date of birth, gender as per official records, nationality and citizenship status, current residential address with postal code, permanent address if different from current address, father's/spouse's name as required by banking regulations, and contact information including primary and alternate email addresses, mobile phone numbers with SMS verification, and landline numbers where available. We also collect photographs and selfies for biometric verification, signatures in digital format for document authentication, and occupation details including employer information, designation, and nature of business or profession.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.2 Government-Issued Documentation and Regulatory Compliance</h3>
                  <p>
                    In compliance with PMLA requirements, IT Act 2000, and FIU-IND guidelines, we collect and securely store copies of government-issued identification documents including Permanent Account Number (PAN) cards with income tax database verification, Aadhaar cards with UIDAI verification and biometric authentication, passports with embassy verification for foreign nationals, voter ID cards, driving licenses, and any other government-issued photo identification. We also collect supporting documentation such as utility bills not older than three months, bank statements for the last six months, rental agreements or property ownership documents, employment certificates and salary slips, income tax returns for the previous two years, and Form 16 or other income proof documents. All document collection is performed through secure, encrypted channels with end-to-end encryption and stored with enterprise-grade security measures including access controls and audit logging.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.3 Financial and Banking Information</h3>
                  <p>
                    To facilitate INR transactions and comply with banking regulations under RBI guidelines, we collect detailed financial information including bank account numbers with MICR code verification, IFSC codes and bank branch details, account holder names with bank verification, bank statements for transaction analysis, UPI IDs and virtual payment addresses, credit and debit card information for payment processing, net banking credentials (securely tokenized), and wallet information for integrated payment services. We also collect information about your income sources including salary certificates, business income proofs, investment portfolios, estimated annual income, estimated transaction volumes and frequency, the purpose of cryptocurrency trading activities, source of funds declarations, and wealth statements for high-value transactions. This information is essential for regulatory reporting under FEMA, transaction monitoring for AML compliance, and ensuring adherence to RBI guidelines for digital payments.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.4 Biometric and Advanced Authentication Data</h3>
                  <p>
                    For enhanced security and compliance with digital identity verification standards under the IT Act 2000 and Aadhaar Authentication regulations, we may collect biometric information including facial recognition data through live selfie verification with liveness detection, facial geometry mapping for identity verification, voice patterns for phone-based authentication and verification calls, and fingerprint data where supported by your device and legally permitted. We also collect authentication credentials including usernames and encrypted passwords, security questions and encrypted answers, two-factor authentication tokens and backup codes, device-specific authentication certificates, and behavioral biometrics such as typing patterns and device usage patterns. All biometric data is processed in accordance with applicable privacy laws, UIDAI guidelines, and industry best practices including encryption at rest and in transit, limited access controls, and regular security audits.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.5 Cryptocurrency and Blockchain Transaction Data</h3>
                  <p>
                    We collect comprehensive information about your cryptocurrency transactions, trading activities, and blockchain interactions. This includes cryptocurrency wallet addresses (both receiving and sending), transaction amounts in various cryptocurrencies and their INR equivalent values, transaction timestamps with precise time zone information, blockchain transaction hashes and confirmation details, transaction fees and gas costs, trading volumes and frequency patterns, order history including buy/sell orders, limit orders, and market orders, settlement details and completion confirmations, and counterparty information in P2P trades including reputation scores and trading history. We also track your portfolio information including cryptocurrency holdings, historical balances, profit and loss calculations, trading performance metrics, risk assessment scores based on trading patterns, and compliance flags for suspicious activities. This data is essential for regulatory compliance under PMLA, fraud prevention, tax reporting assistance, and providing comprehensive trading analytics to users.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.6 Technical and Device Information</h3>
                  <p>
                    We automatically collect comprehensive technical information about your devices and how you interact with our Services for security, performance optimization, and fraud prevention. This includes detailed IP addresses with geolocation data, browser types and versions with security patch information, operating systems and their versions, device identifiers including IMEI numbers (with consent), mobile network information including carrier details and network type, screen resolution and device characteristics, time zone settings and system language preferences, browser plug-in types and versions, installed applications information (with consent), and device security settings including biometric capabilities and security patch levels. We also collect extensive log data including access times with precise timestamps, pages viewed and interaction patterns, time spent on different sections, click-through rates and navigation paths, search queries within our platform, feature usage analytics, error logs and crash reports with stack traces, API usage patterns and request/response logs, and security event logs including failed login attempts and suspicious activities.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.7 Location and Geolocation Data</h3>
                  <p>
                    For security, compliance, and fraud prevention purposes mandated by AML regulations, we collect comprehensive location information including your general geographic location based on IP address analysis, precise location data from mobile devices (with explicit consent), time zone information and travel patterns, location history when relevant to transaction verification and risk assessment, Wi-Fi network information for device fingerprinting, cellular tower information for location verification, and GPS coordinates when accessing our services from mobile devices. This information helps us comply with geographic restrictions under FEMA and other regulations, detect suspicious activities such as account takeovers and location-based fraud, provide location-relevant services including local payment methods and currency preferences, ensure compliance with sanctions and embargo lists, and implement risk-based authentication based on unusual location patterns.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.8 Communication and Customer Support Data</h3>
                  <p>
                    We collect and maintain comprehensive records of all communications and customer support interactions as required by regulatory guidelines and for service improvement. This includes customer support conversations and ticket histories with complete transcripts, live chat messages with timestamps and user identification, email communications and automated responses with delivery confirmations, phone call recordings (with consent and legal notice), video call recordings for video KYC and support sessions, feedback submissions and survey responses with analytics, review and rating data, social media interactions when you mention or tag our official accounts, and correspondence related to complaints and grievance redressal. We also maintain records of notification preferences, communication consent status, language preferences for multilingual support, communication frequency settings, and opt-out requests with timestamps. All communication data is stored securely with appropriate retention periods as mandated by Indian law and regulatory guidelines.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. How We Collect Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Globe className="h-8 w-8 text-primary" />
              5. How We Collect Information
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We employ multiple sophisticated and secure collection methods to gather information necessary for providing our Services, ensuring compliance with regulatory requirements under Indian law, and maintaining platform security. Our collection practices are transparent, secure, legally compliant, and designed to minimize data collection to what is necessary for legitimate business purposes while maximizing user control and privacy protection.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.1 Direct Collection from Users Through Secure Channels</h3>
                  <p>
                    The majority of personal information is collected directly from you through various secure touchpoints during your interaction with our Services. This includes information provided during account registration through our secure web platform and mobile applications with SSL/TLS encryption, comprehensive KYC verification processes including document upload through encrypted channels, biometric verification through authorized service providers, profile updates and account management through authenticated sessions, customer support interactions via secure communication channels, survey responses and feedback submissions with data validation, voluntary information sharing through user-initiated actions, participation in promotional activities with clear consent mechanisms, referral program participation with privacy protection for referred users, and engagement with our educational content and resources with usage analytics. We also collect information during video KYC sessions conducted by authorized personnel, in-person verification at authorized centers where applicable, and through secure API interactions when you connect external services to your account.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.2 Automated Collection Technologies and Security Systems</h3>
                  <p>
                    We use various advanced automated technologies to collect information about your device and usage patterns while maintaining strict privacy controls. This includes sophisticated cookies and web beacons with granular consent management, session recording tools for user experience optimization (with anonymization), mobile application analytics SDKs with privacy-preserving features, comprehensive security monitoring systems including behavioral analysis, fraud detection algorithms using machine learning with privacy preservation, real-time transaction monitoring systems for AML compliance, and automated risk assessment tools based on transaction patterns. We also employ device fingerprinting technologies for security verification, geofencing and location-based security measures, API logging and monitoring systems, and automated compliance checking systems that flag potential violations of regulatory requirements. All automated collection is performed with appropriate user notice and consent where required by law.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.3 Third-Party Sources and Regulatory Integrations</h3>
                  <p>
                    We may collect information from trusted third-party sources to verify your identity, prevent fraud, and comply with regulatory requirements under Indian law. This includes data from government databases such as UIDAI for Aadhaar verification, income tax databases for PAN validation, passport databases for document verification, and voter registration databases for identity confirmation. We also collect information from credit agencies and financial institutions for creditworthiness assessment, banking partners for payment processing and account verification, blockchain networks and cryptocurrency exchanges for transaction validation and compliance screening, security vendors specializing in fraud prevention and anti-money laundering, KYC service providers authorized by regulatory bodies, and sanctions screening databases including UNSC, OFAC, EU, and other international lists. We ensure that all third-party data collection is performed with appropriate legal basis, data processing agreements, and privacy protection measures.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.4 API Integrations and Connected Services</h3>
                  <p>
                    When you choose to connect external services, wallets, or applications to our platform, we collect information through authorized API connections with robust security measures. This includes cryptocurrency wallet addresses and transaction histories from connected hardware and software wallets, portfolio information from integrated cryptocurrency tracking services, bank account details from connected financial institutions through secure banking APIs, trading data from other cryptocurrency exchanges (with your authorization), tax calculation services for automated reporting assistance, and identity verification services for enhanced KYC compliance. All API data collection is performed with explicit user authorization, appropriate OAuth 2.0 and similar security protocols, comprehensive data encryption in transit and at rest, regular security audits of integration partners, and clear documentation of data sharing scope and purposes. Users maintain full control over connected services and can revoke access at any time through their account settings.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. How We Use the Collected Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Lock className="h-8 w-8 text-primary" />
              6. How We Use the Collected Information
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We use the collected information to provide, maintain, protect, and improve our Services while ensuring strict compliance with regulatory requirements under Indian law and maintaining the highest standards of security and user experience. Our data usage practices are designed to be transparent, purposeful, legally compliant, and aligned with user expectations while fulfilling our obligations as a VASP operating in India.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.1 Core Service Provision and Platform Operations</h3>
                  <p>
                    We use your information to provide comprehensive cryptocurrency trading services including account creation and management with multi-level security, identity verification and KYC compliance as mandated by PMLA and FIU-IND guidelines, transaction processing and settlement through secure banking channels and UPI systems, sophisticated order matching in P2P trades with risk assessment, secure digital wallet management with multi-signature security, comprehensive trading history and analytics with tax reporting assistance, personalized customer support and technical assistance through multiple channels, and continuous platform maintenance and updates with security patches. This usage extends to providing real-time market data and analysis, facilitating cross-border transactions in compliance with FEMA regulations, managing escrow services for secure P2P trading, implementing automated trading features with risk controls, and providing educational resources about cryptocurrency trading and regulatory compliance.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.2 Comprehensive Regulatory Compliance and Reporting</h3>
                  <p>
                    Your information is extensively used to comply with regulatory requirements applicable to VASPs in India and internationally. This includes conducting comprehensive customer due diligence and ongoing monitoring as required by PMLA 2002, generating and submitting suspicious transaction reports (STRs) and cash transaction reports (CTRs) to FIU-IND within prescribed timelines, maintaining detailed transaction records for regulatory inspection and audit purposes, reporting tax-related information to income tax authorities including TDS deduction and filing, ensuring compliance with RBI guidelines for digital payments and virtual asset transactions, and responding to regulatory inquiries and investigations from various authorities. We also use information for FEMA compliance reporting for cross-border transactions, sanctions screening against international lists, filing returns and reports with various regulatory bodies, maintaining audit trails for compliance verification, and implementing know-your-transaction (KYT) procedures for enhanced due diligence.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.3 Advanced Security and Fraud Prevention</h3>
                  <p>
                    We employ your personal information in sophisticated security measures to protect your account and maintain platform integrity. This includes real-time monitoring for suspicious activities and potential fraud using machine learning algorithms, implementing multi-factor authentication and advanced device recognition systems, conducting comprehensive risk assessments for transactions based on behavioral patterns and historical data, preventing unauthorized access and account takeovers through behavioral analysis, detecting and preventing money laundering activities through transaction pattern analysis, maintaining detailed audit trails for security investigations and forensic analysis, and implementing dynamic security controls based on risk assessment. Our security systems also use information for geolocation-based access controls, device fingerprinting for fraud detection, social engineering attack prevention, phishing detection and prevention, and coordinating with law enforcement agencies for cybercrime investigation when legally required.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.4 Platform Improvement and Advanced Analytics</h3>
                  <p>
                    We analyze usage patterns and user behavior to continuously improve our Services while maintaining strict privacy protections. This includes conducting comprehensive platform performance analytics with anonymized data, identifying and fixing technical issues through error analysis and user feedback, developing new features and services based on user needs and market trends, optimizing user interfaces and user experience through A/B testing and usability studies, conducting market research and trend analysis for service enhancement, personalizing content and recommendations while respecting privacy preferences, and implementing predictive analytics for better service delivery. Our analytics also extend to cryptocurrency market analysis for user benefit, risk modeling for enhanced security, performance optimization for faster transaction processing, and research and development for innovative financial services while ensuring all analytics comply with privacy regulations and user consent requirements.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.5 Communication and Customer Engagement</h3>
                  <p>
                    We use your contact information to maintain comprehensive communication about your account and our Services. This includes sending transaction confirmations and security alerts with detailed information, providing multi-channel customer support and technical assistance in multiple languages, sharing important policy and regulatory updates affecting your account, delivering educational content about cryptocurrency trading and regulatory compliance, sending marketing communications and promotional offers (with explicit consent), providing tax-related information and assistance during filing season, and facilitating community engagement through user forums and educational webinars. We maintain separate communication preferences for different types of messages including transactional notifications, security alerts, regulatory updates, educational content, and marketing communications, allowing users granular control over what they receive and through which channels.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 7. Information Sharing and Disclosure */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">7. Information Sharing and Disclosure</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We maintain strict controls over the sharing and disclosure of personal information in accordance with Indian privacy laws and international standards. We do not sell, rent, or trade personal information to third parties for their commercial purposes. Information sharing is limited to specific circumstances that are necessary for service provision, regulatory compliance mandated by Indian law, user protection, or with explicit user consent, and is always conducted with appropriate safeguards, legal protections, and contractual obligations.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.1 Mandatory Regulatory and Law Enforcement Disclosures</h3>
                  <p>
                    We are legally obligated to share certain information with regulatory authorities and law enforcement agencies as mandated by Indian law. This includes reporting suspicious transactions and cash transactions to FIU-IND as required by PMLA 2002 with detailed transaction analysis and customer information, providing comprehensive transaction records and customer data to income tax authorities for tax compliance and investigation purposes, responding to court orders, summons, and legal process issued by competent courts and tribunals, cooperating with law enforcement investigations including CBI, ED, and state police forces with appropriate legal documentation, sharing information with RBI and other financial regulators as required by banking and financial services regulations, complying with FEMA reporting requirements for cross-border transactions and foreign exchange compliance, and participating in international regulatory cooperation agreements and mutual legal assistance treaties. All such disclosures are made strictly in accordance with applicable laws, with appropriate legal review and documentation, and with consideration for user privacy rights within the bounds of legal requirements.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.2 Service Providers and Business Partners</h3>
                  <p>
                    We share information with carefully selected and rigorously vetted third-party service providers who assist us in delivering our Services under strict contractual obligations. This includes cloud infrastructure providers such as AWS, Google Cloud, and Microsoft Azure for secure data storage and processing with data localization compliance, payment processors and banking partners including major Indian banks and payment gateways for INR transactions and UPI processing, specialized identity verification services authorized by regulatory bodies for KYC compliance and document verification, cybersecurity vendors providing threat detection, prevention, and incident response services, customer support platforms and communication tools for multi-channel user assistance, analytics providers for platform improvement and user experience optimization with data anonymization, and legal and compliance service providers for regulatory guidance and audit support. All service providers are bound by comprehensive data processing agreements requiring strict adherence to privacy protection standards, data minimization principles, security requirements equivalent to our own standards, and compliance with Indian data protection laws.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.3 Business Transactions and Corporate Changes</h3>
                  <p>
                    In the event of significant corporate changes such as merger, acquisition, reorganization, or sale of assets, personal information may be transferred as part of the business transaction in accordance with applicable laws. We commit to providing substantial advance notice of any such transaction through multiple communication channels, ensuring that the receiving entity maintains equivalent or higher levels of privacy protection and security standards, conducting thorough due diligence on data protection practices of the acquiring entity, negotiating appropriate data protection clauses in transaction agreements, and providing users with clear options regarding the continued processing of their personal information including the right to request data deletion where legally permissible. Users will be notified of any material changes to data handling practices resulting from such transactions with at least 60 days advance notice, and appropriate choices will be provided regarding consent to new processing arrangements, migration of data to new systems, or discontinuation of services where requested.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.4 User Consent and Authorized Disclosures</h3>
                  <p>
                    We may share information with explicit user consent or at user direction through our platform features and integrations. This includes sharing information with third-party applications or services that users choose to connect to their accounts through secure API integrations, providing information to financial advisors, accountants, or tax consultants upon user request with appropriate verification procedures, sharing anonymized or aggregated data for research, industry analysis, or academic purposes with privacy protection measures, facilitating social features such as referral programs or community interactions with appropriate privacy controls, and enabling integration with external portfolio management tools or tax calculation services with user authorization. Users maintain complete control over these disclosures through granular permission settings, can review and modify connected services at any time, receive clear information about data sharing scope and purposes, and can revoke authorization through simple account management tools with immediate effect on future data sharing.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.5 Emergency and Safety Disclosures</h3>
                  <p>
                    In exceptional circumstances involving immediate threats to health, safety, or security, we may disclose personal information without prior consent as permitted by law. This includes emergency situations involving potential harm to users or others, suspected terrorist financing or national security threats requiring immediate intervention, situations involving imminent financial fraud or cybersecurity attacks, medical emergencies where user safety is at risk, and legal obligations to prevent serious crimes or protect public safety. All emergency disclosures are subject to strict internal review procedures, limited to information directly relevant to the emergency situation, documented with detailed justification and legal basis, reported to relevant authorities as required, and followed by user notification as soon as legally permissible and safe to do so.
                  </p>
                </div>
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