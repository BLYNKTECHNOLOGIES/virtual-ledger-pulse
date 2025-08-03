import { Shield, Lock, Eye, Users, Database, Globe, Phone, Mail, MapPin, AlertTriangle, FileText, Gavel, Clock, Brain, Wifi, CreditCard, UserCheck } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Privacy Policy
            </h1>
            <p className="text-xl text-muted-foreground mb-4">
              Comprehensive Data Protection and Privacy Framework for P2P Cryptocurrency Trading
            </p>
            <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span><strong>Effective Date:</strong> August 3, 2025</span>
              <span><strong>Last Updated:</strong> August 3, 2025</span>
              <span><strong>Version:</strong> 2.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto space-y-16">
          
          {/* 1. Introduction and Definitions */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              1. Introduction and Definitions
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Blynk Virtual Technologies Private Limited ("Blynk," "Company," "we," "us," or "our") is committed to protecting and respecting your privacy. This Privacy Policy ("Policy") describes how we collect, use, process, store, share, and protect personal information when you access or use our peer-to-peer cryptocurrency trading platform, website, mobile applications, and related services (collectively, the "Services"). This Policy applies to all users, visitors, and others who access or use our Services ("Users," "you," or "your").
              </p>

              <p>
                As a Virtual Asset Service Provider (VASP) operating under Indian jurisdiction and complying with global standards, we adhere to the highest levels of data protection, privacy, and regulatory compliance. We are registered under the <a href="#" className="text-blue-600 hover:text-blue-800 underline">Ministry of Corporate Affairs, India</a>, bearing Company Identification Number (CIN) U62099MP2025PTC074915, and operate in full compliance with the <a href="#" className="text-blue-600 hover:text-blue-800 underline">Financial Intelligence Unit - India (FIU-IND)</a> guidelines, <a href="#" className="text-blue-600 hover:text-blue-800 underline">Prevention of Money Laundering Act (PMLA) 2002</a>, <a href="#" className="text-blue-600 hover:text-blue-800 underline">Information Technology Act 2000</a>, <a href="#" className="text-blue-600 hover:text-blue-800 underline">Digital Personal Data Protection Act 2023</a>, and other applicable laws and regulations.
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
                  <p><strong>AML:</strong> Anti-Money Laundering measures and procedures required under the Prevention of Money Laundering Act 2002 and FIU-IND guidelines.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Legal Basis for Processing Personal Data */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              2. Legal Basis for Processing Personal Data
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We process personal data only when we have a valid legal basis under applicable data protection laws including the Information Technology Act 2000, Digital Personal Data Protection Act 2023, and international standards where applicable. Our processing activities are grounded in specific legal bases that ensure compliance with Indian and international privacy regulations while enabling us to provide secure cryptocurrency trading services.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.1 Regulatory Compliance and Legal Obligations</h3>
                  <p>
                    As a VASP operating in India, we are subject to numerous legal obligations that require the processing of personal data. This includes compliance with PMLA requirements for customer due diligence and ongoing monitoring, FIU-IND reporting obligations for suspicious and cash transactions, income tax reporting requirements under the Income Tax Act 1961 including TDS deduction and filing, RBI guidelines for digital payments and virtual asset transactions, FEMA compliance for foreign exchange transactions and cross-border payments, securities regulations under SEBI for relevant investment activities, and other applicable financial services regulations. We also process data to comply with court orders, regulatory investigations, and law enforcement requests under the Code of Criminal Procedure 1973, Indian Evidence Act 1872, and other applicable laws governing financial crimes and cybersecurity.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.2 Contractual Necessity and Service Provision</h3>
                  <p>
                    We process personal data that is necessary for the performance of our Terms of Service and to provide the Services you have requested. This includes account creation and management with secure authentication systems, identity verification through comprehensive KYC processes including Aadhaar-based eKYC and document verification, transaction processing using UPI, IMPS, RTGS, and other payment systems authorized by RBI, cryptocurrency wallet management and blockchain transaction processing, customer support and dispute resolution services, platform security and fraud prevention measures, and regulatory compliance monitoring and reporting. Without this processing, we cannot provide our cryptocurrency trading services effectively, ensure user account security, or comply with the extensive regulatory framework governing VASPs and financial service providers in India.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.3 Explicit Consent and User Authorization</h3>
                  <p>
                    We process certain categories of personal data based on your explicit consent, particularly for optional services and enhanced features. Consent-based processing includes marketing communications and promotional content delivery through email, SMS, and push notifications, optional features like advanced portfolio analytics, trading insights, and market research participation, non-essential cookies for user experience enhancement and behavioral analytics, precise location tracking for fraud prevention and security verification, biometric data collection for enhanced security measures including facial recognition and fingerprint authentication, social media integration and sharing features, and third-party service integrations for enhanced functionality. You have the right to withdraw your consent at any time through your account settings, cookie preferences, or by contacting our Data Protection Officer. Withdrawal of consent does not affect the lawfulness of processing based on consent before its withdrawal and will not impact essential service functionality.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">2.4 Legitimate Interests and Business Operations</h3>
                  <p>
                    We process personal data for legitimate business interests that are not overridden by your privacy rights, ensuring we conduct appropriate balancing tests and impact assessments. Legitimate interests include comprehensive fraud prevention and security measures using advanced analytics and machine learning algorithms, improving our Services through usage analytics, user behavior analysis, and platform optimization, conducting business development activities including market research and competitive analysis, protecting our legal rights and intellectual property including enforcement of terms of service and legal agreements, ensuring network and information security through monitoring and threat detection, preventing money laundering and terrorist financing through transaction monitoring and risk assessment, maintaining business continuity and disaster recovery capabilities, and conducting internal audit and compliance monitoring activities. We regularly review our legitimate interests processing to ensure continued appropriateness and conduct privacy impact assessments for new processing activities that may affect user rights.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. What Information We Collect */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              3. What Information We Collect
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We collect various types of information to provide, maintain, protect, and improve our Services, comply with legal obligations under Indian law, and ensure the security and integrity of our cryptocurrency trading platform. The information we collect falls into several categories, each serving specific purposes in delivering secure and compliant P2P cryptocurrency trading services while adhering to FIU-IND guidelines, PMLA requirements, and DPDP Act provisions.
              </p>

              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.1 Personal Identification and KYC Information</h3>
                  <p>
                    As mandated by Indian KYC and AML regulations under PMLA 2002 and FIU-IND guidelines, we collect comprehensive personal identification information to verify your identity, assess risk, and comply with regulatory requirements. This includes your full legal name as it appears on government-issued identification documents, date of birth and age verification, gender as per official records, nationality and citizenship status with supporting documentation, current residential address with postal code and proof of address verification, permanent address if different from current address with appropriate documentation, father's name or spouse's name as required by banking regulations and government norms, and comprehensive contact information including primary and alternate email addresses with verification, mobile phone numbers with SMS and OTP verification, landline numbers where available, and emergency contact details. We also collect high-resolution photographs and live selfies for biometric verification and fraud prevention, digital signatures for document authentication and regulatory compliance, and detailed occupation information including employer details, designation, nature of business or profession, and income verification documentation.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.2 Government-Issued Documentation and Regulatory Compliance</h3>
                  <p>
                    In compliance with PMLA requirements, IT Act 2000, FIU-IND guidelines, and DPDP Act provisions, we collect and securely store copies of government-issued identification documents and supporting paperwork. This includes Permanent Account Number (PAN) cards with income tax database verification and validation, Aadhaar cards with UIDAI verification, biometric authentication, and demographic data validation, passports with embassy verification and apostille validation for foreign nationals, voter ID cards issued by the Election Commission of India, driving licenses with transport authority verification, and any other government-issued photo identification acceptable under RBI guidelines. We also collect comprehensive supporting documentation such as utility bills not older than three months for address verification, bank statements for the last six months for financial assessment and transaction pattern analysis, rental agreements or property ownership documents for address confirmation, employment certificates and salary slips for income verification, income tax returns for the previous two years with computation details, Form 16 or other income proof documents issued by employers, and GST registration documents for business accounts and professional traders. All document collection is performed through secure, encrypted channels with end-to-end encryption, multi-factor authentication, and stored with enterprise-grade security measures including access controls, audit logging, and compliance monitoring.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.3 Financial and Banking Information</h3>
                  <p>
                    To facilitate INR transactions and comply with banking regulations under RBI guidelines, we collect detailed financial information and banking details. This includes complete bank account information with account numbers, MICR code verification, and account holder name validation, IFSC codes and detailed bank branch information with location and contact details, comprehensive bank statements for transaction analysis and risk assessment, UPI IDs and virtual payment addresses with verification through authorized UPI service providers, credit and debit card information for payment processing with secure tokenization, net banking credentials through secure banking APIs and authorized payment gateways, and integrated wallet information for various payment services including Paytm, PhonePe, Google Pay, and other RBI-authorized payment systems. We also collect detailed information about your income sources including salary certificates with employer verification, business income proof with GST returns and audit reports, investment portfolio details with statements from authorized intermediaries, estimated annual income with supporting documentation, estimated transaction volumes and frequency based on financial capacity assessment, comprehensive purpose declarations for cryptocurrency trading activities, detailed source of funds declarations with supporting evidence, and wealth statements for high-value transactions including assets, liabilities, and net worth calculations. This information is essential for regulatory reporting under FEMA and income tax regulations, comprehensive transaction monitoring for AML compliance, and ensuring strict adherence to RBI guidelines for digital payments and virtual asset transactions.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">3.4 Cryptocurrency and Blockchain Transaction Data</h3>
                  <p>
                    We collect comprehensive information about your cryptocurrency transactions, trading activities, and blockchain interactions for regulatory compliance, security monitoring, and service provision. This includes all cryptocurrency wallet addresses (both receiving and sending) with ownership verification and risk assessment, detailed transaction amounts in various cryptocurrencies and their INR equivalent values at the time of transaction, precise transaction timestamps with time zone information and blockchain confirmation details, comprehensive blockchain transaction hashes and block numbers for permanent reference and audit trails, transaction fees and gas costs with network-specific details, detailed trading volumes and frequency patterns for risk assessment and regulatory reporting, complete order history including buy orders, sell orders, limit orders, market orders, and stop-loss orders with execution details, settlement information and completion confirmations with banking integration details, and counterparty information in P2P trades including reputation scores, trading history, and compliance verification. We also maintain detailed portfolio information including cryptocurrency holdings across different wallets and addresses, historical balance information with daily snapshots, comprehensive profit and loss calculations with tax implications, trading performance metrics and analytics, automated risk assessment scores based on trading patterns and transaction behavior, compliance flags for suspicious activities with investigation records, and cross-reference information with known addresses and entities for enhanced due diligence. This data is essential for regulatory compliance under PMLA and income tax regulations, comprehensive fraud prevention and security monitoring, tax reporting assistance for users and regulatory authorities, and providing detailed trading analytics and performance insights to enhance user experience while maintaining regulatory compliance.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 4. How We Collect Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              4. How We Collect Information
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We employ multiple sophisticated and secure collection methods to gather information necessary for providing our Services, ensuring compliance with regulatory requirements under Indian law, and maintaining platform security. Our collection practices are transparent, secure, legally compliant, and designed to minimize data collection to what is necessary for legitimate business purposes while maximizing user control and privacy protection in accordance with DPDP Act principles and international privacy standards.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.1 Direct Collection Through Secure User Interfaces</h3>
                  <p>
                    The majority of personal information is collected directly from you through various secure touchpoints during your interaction with our Services. This includes comprehensive information provided during account registration through our secure web platform and mobile applications with end-to-end SSL/TLS encryption and advanced security measures, detailed KYC verification processes including secure document upload through encrypted channels, real-time biometric verification through authorized service providers with liveness detection and anti-spoofing measures, continuous profile updates and account management through authenticated sessions with multi-factor authentication, comprehensive customer support interactions via secure communication channels including encrypted chat, secure email, and verified phone calls, detailed survey responses and feedback submissions with data validation and privacy protection, voluntary information sharing through user-initiated actions with clear consent mechanisms, active participation in promotional activities with transparent data usage policies and clear consent management, referral program participation with privacy protection for both referrers and referred users, and ongoing engagement with our educational content and resources with detailed usage analytics and personalization features. We also collect information during supervised video KYC sessions conducted by trained and authorized personnel with recording capabilities for compliance verification, in-person verification at authorized service centers and partner locations where applicable with proper documentation and audit trails, and through secure API interactions when you choose to connect external services to your account with comprehensive authorization and permission management systems.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">4.2 Automated Collection Technologies and Security Systems</h3>
                  <p>
                    We use various advanced automated technologies to collect information about your device and usage patterns while maintaining strict privacy controls and user consent where required by law. This includes sophisticated cookies and web beacons with granular consent management and comprehensive user control mechanisms, advanced session recording tools for user experience optimization with automatic anonymization and privacy protection features, specialized mobile application analytics SDKs with privacy-preserving configurations and data minimization practices, comprehensive security monitoring systems including behavioral analysis, anomaly detection, and threat intelligence integration, advanced fraud detection algorithms using machine learning and artificial intelligence with privacy-preserving techniques and bias mitigation measures, real-time transaction monitoring systems for AML compliance with automated risk scoring and alert generation, and automated risk assessment tools based on transaction patterns, user behavior, and regulatory requirements with human oversight and appeal mechanisms. We also employ sophisticated device fingerprinting technologies for security verification and fraud prevention without storing personally identifiable information, advanced geofencing and location-based security measures with user consent and privacy protection, comprehensive API logging and monitoring systems for security and compliance purposes, automated compliance checking systems that flag potential violations of regulatory requirements with immediate escalation procedures, and intelligent chatbot and customer service automation with natural language processing and secure data handling. All automated collection is performed with appropriate user notice and consent where required by law, comprehensive privacy impact assessments, and regular auditing to ensure continued compliance with privacy regulations and user expectations.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 5. How We Use the Collected Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              5. How We Use the Collected Information
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We use the collected information to provide, maintain, protect, and improve our Services while ensuring strict compliance with regulatory requirements under Indian law and maintaining the highest standards of security and user experience. Our data usage practices are designed to be transparent, purposeful, legally compliant, and aligned with user expectations while fulfilling our obligations as a VASP operating in India under comprehensive regulatory oversight.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.1 Core Service Provision and Platform Operations</h3>
                  <p>
                    We use your information to provide comprehensive cryptocurrency trading services and maintain platform functionality. This includes account creation and management with multi-level security, identity verification and comprehensive KYC compliance as mandated by PMLA and FIU-IND guidelines, transaction processing and settlement through secure banking channels, UPI systems, and authorized payment gateways, sophisticated order matching in P2P trades with advanced risk assessment and counterparty verification, secure digital wallet management with multi-signature security and cold storage integration, comprehensive trading history and analytics with detailed tax reporting assistance, personalized customer support and technical assistance through multiple channels with multilingual capabilities, and continuous platform maintenance and updates with security patches and feature enhancements. This usage extends to providing real-time market data and analysis with price discovery and liquidity management, facilitating cross-border transactions in compliance with FEMA regulations and international standards, managing comprehensive escrow services for secure P2P trading with dispute resolution mechanisms, implementing automated trading features with sophisticated risk controls and user-defined parameters, providing extensive educational resources about cryptocurrency trading, blockchain technology, and regulatory compliance, and maintaining robust business continuity and disaster recovery capabilities to ensure uninterrupted service availability.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">5.2 Comprehensive Regulatory Compliance and Reporting</h3>
                  <p>
                    Your information is extensively used to comply with the complex regulatory requirements applicable to VASPs in India and internationally. This includes conducting comprehensive customer due diligence and ongoing monitoring as required by PMLA 2002 with detailed risk assessment and profile updates, generating and submitting suspicious transaction reports (STRs) and cash transaction reports (CTRs) to FIU-IND within prescribed timelines with complete transaction analysis and supporting documentation, maintaining detailed transaction records for regulatory inspection and audit purposes with comprehensive data retention and retrieval systems, reporting tax-related information to income tax authorities including TDS deduction, filing, and comprehensive transaction reporting for tax compliance, ensuring strict compliance with RBI guidelines for digital payments and virtual asset transactions including reporting and monitoring requirements, and responding to regulatory inquiries and investigations from various authorities including FIU-IND, income tax department, enforcement directorate, and other law enforcement agencies. We also use information for FEMA compliance reporting for cross-border transactions with detailed documentation and approval procedures, comprehensive sanctions screening against international lists including UNSC, OFAC, EU, and other relevant databases, filing detailed returns and reports with various regulatory bodies including quarterly and annual compliance reports, maintaining comprehensive audit trails for compliance verification and regulatory examination, implementing sophisticated know-your-transaction (KYT) procedures for enhanced due diligence and risk management, and coordinating with international regulatory bodies for cross-border compliance and information sharing agreements.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Cookies and Web Beacons */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              6. Cookies and Web Beacons
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We use cookies, web beacons, and similar tracking technologies to enhance user experience, improve our Services, ensure security, maintain regulatory compliance, and prevent fraud. These technologies help us understand user behavior, prevent unauthorized access, maintain session security, provide personalized services, and comply with AML monitoring requirements while respecting user privacy preferences and providing granular control over data collection in accordance with Indian privacy laws and international standards.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.1 Essential Cookies for Platform Functionality</h3>
                  <p>
                    We deploy essential cookies that are strictly necessary for platform functionality and security compliance under Indian law. Essential cookies include session management cookies that maintain user authentication and secure sessions during platform usage with automatic timeout and security monitoring, authentication tokens for multi-factor authentication and device recognition with encrypted storage and regular rotation, security cookies for fraud prevention and account protection against unauthorized access with real-time threat detection, load balancing cookies for platform stability and optimal performance distribution across our server infrastructure, regulatory compliance cookies for AML monitoring and transaction tracking as required by PMLA with detailed audit logging, and user preference cookies for language settings, timezone configuration, accessibility features, and basic platform customization. These cookies are legally required for providing our Services and cannot be disabled without significantly affecting core platform functionality, user security, and our ability to comply with regulatory obligations under Indian financial services law.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">6.2 Analytics and Performance Enhancement Cookies</h3>
                  <p>
                    With appropriate consent, we utilize analytics cookies to understand user behavior and improve our Services while maintaining strict privacy protection. Analytics cookies include Google Analytics cookies for comprehensive usage statistics, user journey analysis, and platform performance monitoring with enhanced privacy settings and data anonymization, proprietary analytics cookies for detailed trading pattern analysis and user engagement metrics with privacy-preserving techniques, feature usage tracking cookies for product development and user experience optimization with data aggregation and anonymization, error tracking and debugging cookies for technical issue identification and resolution with automated privacy protection, A/B testing cookies for feature testing and user experience experimentation with statistical analysis and privacy safeguards, and security analytics cookies for fraud detection and suspicious activity monitoring with machine learning algorithms and privacy preservation. All analytics data is processed with advanced privacy-preserving techniques including differential privacy, k-anonymity, data aggregation, and comprehensive anonymization to ensure individual users cannot be re-identified from analytics datasets while maintaining the analytical value for service improvement and regulatory compliance.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 7. Marketing Communications & Opt-Outs */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">
              7. Marketing Communications & Opt-Outs
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We provide comprehensive control over marketing communications and promotional content, ensuring full compliance with Indian telecommunications regulations, TRAI guidelines for commercial communications, Consumer Protection Act provisions, and international standards for email marketing. Users maintain complete autonomy over their communication preferences with granular controls, easy opt-out mechanisms for all non-essential communications, and transparent information about how their contact information is used for marketing purposes.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.1 Types of Marketing Communications</h3>
                  <p>
                    Our marketing communications include comprehensive educational newsletters about cryptocurrency markets, blockchain technology, regulatory updates, and trading strategies with expert analysis and market insights, promotional emails about new features, trading opportunities, and platform enhancements with clear value propositions, SMS notifications for time-sensitive market alerts and promotional offers (with explicit consent and TRAI compliance), push notifications through our mobile applications for personalized trading insights and market updates, social media content and advertising on platforms where you have engaged with our content including Facebook, Instagram, LinkedIn, and Twitter, webinar invitations and educational event notifications including expert speaker sessions and regulatory update briefings, referral program communications and rewards notifications with clear terms and privacy protection, seasonal promotional campaigns with special offers and trading incentives, and personalized recommendations based on trading patterns and user preferences. All marketing communications are clearly identified as promotional content, include comprehensive unsubscribe mechanisms, comply with TRAI regulations for commercial communications and DND preferences, respect user preferences for frequency and timing of communications, and provide clear value to recipients through relevant and timely information about cryptocurrency trading and market developments.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">7.2 Comprehensive Opt-Out Mechanisms and User Control</h3>
                  <p>
                    We provide multiple easy-to-use opt-out mechanisms for all marketing communications with immediate effect and comprehensive user control over communication preferences. This includes one-click unsubscribe links in all promotional emails with immediate processing and confirmation, SMS opt-out through reply with "STOP," "UNSUBSCRIBE," or other standard keywords with automatic processing, comprehensive account settings dashboard for granular control over communication preferences with category-specific controls for different types of content, customer support assisted opt-out through phone, email, or chat support with immediate processing and confirmation, automatic opt-out processing within 24 hours of any unsubscribe request with system-wide updates, push notification preference management through mobile app settings with real-time updates, social media advertising preference control through platform-specific tools and our privacy settings, and separate preference management for different types of communications including market alerts, educational content, promotional offers, event notifications, and regulatory updates. Users can also set communication frequency preferences, choose preferred communication channels, manage time-based preferences for different types of messages, and maintain separate settings for different product categories and service types while ensuring that essential account and security communications remain unaffected by marketing opt-out preferences.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 8. AI Usage for KYC Screening and Fraud Prevention */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary" />
              8. AI Usage for KYC Screening and Fraud Prevention
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We utilize advanced artificial intelligence and machine learning technologies to enhance KYC verification processes, detect fraudulent activities, prevent money laundering, and ensure regulatory compliance while maintaining user privacy and providing transparency about automated decision-making processes. Our AI systems are designed with privacy-by-design principles, comprehensive human oversight mechanisms, bias detection and mitigation measures, and extensive audit capabilities to ensure fair, accurate, and legally compliant processing of user data.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">8.1 AI-Powered KYC and Document Verification</h3>
                  <p>
                    We employ sophisticated AI technologies for automated KYC processing and document verification to improve efficiency, accuracy, and user experience while maintaining strict regulatory compliance and privacy protection. AI-powered KYC includes advanced optical character recognition (OCR) for automatic extraction of information from government-issued documents with high accuracy rates, error detection capabilities, and format standardization across different document types, state-of-the-art facial recognition and liveness detection for identity verification and prevention of document fraud using advanced biometric algorithms with anti-spoofing measures and demographic bias mitigation, comprehensive document authenticity verification using machine learning models trained to detect forged, manipulated, or fraudulent documents with continuous model updates and accuracy improvements, automated risk scoring based on document quality, consistency checks, cross-reference verification with government databases, and behavioral pattern analysis, and intelligent workflow automation for KYC processing with human oversight for complex cases, appeals, and edge cases requiring manual review. All AI processing includes comprehensive explainability features to provide clear reasoning for automated decisions, maintains detailed audit trails for regulatory compliance and user transparency, implements advanced bias detection and mitigation measures to ensure fair treatment across all user demographics and geographic regions, and provides clear appeal mechanisms for users who disagree with automated decisions or require human review of their applications.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">8.2 Advanced Fraud Detection and Prevention Systems</h3>
                  <p>
                    Our AI-powered fraud detection systems continuously monitor user behavior, transaction patterns, and platform interactions to identify potential fraudulent activities and protect user accounts from unauthorized access and financial crimes. Advanced fraud detection includes real-time behavioral analysis using sophisticated machine learning algorithms to detect unusual account access patterns, device fingerprinting anomalies, and location-based suspicious activities, comprehensive transaction pattern analysis for identifying potentially suspicious activities including money laundering, terrorist financing, structuring, and other financial crimes with regulatory compliance monitoring, automated risk scoring for transactions and user activities with dynamic threshold adjustment based on risk assessment, user profiling, and regulatory requirements, predictive analytics for identifying potential account takeovers, social engineering attacks, phishing attempts, and other security threats using ensemble learning methods and threat intelligence integration, intelligent alert generation with sophisticated prioritization and escalation procedures for human review and investigation with case management capabilities, and comprehensive fraud prevention measures including real-time transaction blocking, account protection protocols, and user notification systems. Our fraud prevention systems maintain exceptionally low false positive rates through continuous model refinement, feature engineering, and feedback loop optimization, provide clear explanations for flagged activities and risk decisions, include comprehensive appeal processes for users who believe they have been incorrectly identified as engaging in suspicious behavior, and integrate seamlessly with our customer support and compliance teams for efficient resolution of fraud-related issues while maintaining user privacy and regulatory compliance throughout the entire process.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 9. User Rights Under DPDP Act and International Laws */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <UserCheck className="h-8 w-8 text-primary" />
              9. User Rights Under DPDP Act and International Laws
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Under the Digital Personal Data Protection Act 2023, Information Technology Act 2000, and other applicable privacy laws, you have comprehensive rights regarding your personal data. We are committed to facilitating the exercise of these rights through user-friendly mechanisms, clear processes, timely responses, and transparent communication while balancing these rights with regulatory obligations, legitimate business interests, and security requirements in accordance with Indian law and international standards.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">9.1 Right to Access and Data Portability</h3>
                  <p>
                    You have the comprehensive right to access your personal data and receive detailed information about how we process it, with mechanisms for both self-service access and assisted retrieval. Access rights include obtaining complete copies of all personal data we hold about you in structured, commonly used, and machine-readable formats including JSON, CSV, and PDF formats, receiving comprehensive information about the purposes of processing, categories of data, retention periods, sharing practices, and automated decision-making with detailed explanations of logic and consequences, accessing your complete transaction history, trading records, and account activity with detailed timestamps, amounts, and counterparty information, downloading your KYC documents and verification records through secure authenticated channels with audit logging, requesting information about automated decision-making including risk scoring, fraud detection, and algorithmic processing with explanations of the logic involved, and obtaining details about data sharing with third parties including purposes, legal basis, and safeguards implemented. Data portability allows you to receive your data in standard formats for transfer to other service providers, subject to technical feasibility and regulatory compliance requirements, with assistance for complex data exports and migration support. We provide comprehensive self-service data access through your account dashboard with immediate download capabilities, detailed data export tools with customizable date ranges and data categories, and manual assistance available for complex requests, historical data retrieval, and specialized export formats with dedicated customer support for data portability requests.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">9.2 Right to Correction and Data Accuracy</h3>
                  <p>
                    You have the comprehensive right to correct inaccurate or incomplete personal data and update your information as circumstances change, with immediate effect on platform functionality and regulatory compliance. Correction rights include updating basic profile information including name, address, contact details, and communication preferences through your account settings with real-time synchronization, correcting errors in KYC documentation through our secure verification update process with appropriate document submission and verification procedures, modifying communication preferences and marketing consent settings with immediate effect across all communication channels, updating financial information including bank account details and payment preferences through secure verification processes with multi-factor authentication, correcting inaccuracies in transaction records through our comprehensive dispute resolution process with proper documentation and investigation procedures, and updating emergency contact information and security settings with immediate security protocol updates. We implement real-time updates for most data categories with immediate system synchronization, maintain comprehensive audit trails of all corrections for regulatory compliance and security monitoring, provide immediate confirmation of updates through secure communication channels, and ensure that corrections are propagated across all relevant systems and third-party integrations. Complex corrections may require additional verification and documentation to ensure accuracy and prevent fraud, with dedicated support staff available to assist with verification processes and dispute resolution procedures.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">9.3 Right to Erasure and Data Deletion</h3>
                  <p>
                    You have the right to request deletion of your personal data, subject to legal and regulatory limitations applicable to financial service providers and VASPs operating under Indian law. Erasure rights include requesting immediate deletion of marketing and communication data with immediate effect on future processing and communication, removing optional account information and preferences not required for regulatory compliance or security purposes, deleting social media linkages and third-party integrations through account management tools with immediate disconnection, requesting account closure with deletion of non-essential data while maintaining regulatory records as required by law, and removing biometric data and optional security features with appropriate security impact notifications. Important limitations include mandatory retention requirements for KYC data (5 years from account closure), transaction records (5 years from transaction date), compliance documentation as mandated by PMLA and income tax regulations, audit trails required for regulatory inspection, and security logs necessary for ongoing fraud prevention and investigation. We provide clear, detailed information about what can and cannot be deleted with specific legal citations and regulatory requirements, implement comprehensive pseudonymization for retained data where possible to minimize privacy impact, ensure that deleted data is permanently removed from active systems with secure deletion protocols, and maintain secure archived copies only for regulatory compliance purposes with restricted access and enhanced security measures. Users receive detailed confirmation of deletion activities and clear timelines for complete data removal from all systems.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 10. Information Security Measures */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              10. Information Security Measures
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We implement comprehensive, multi-layered security measures to protect your personal information and cryptocurrency assets from unauthorized access, theft, manipulation, and disclosure. Our security framework combines industry-leading technologies, rigorous operational procedures, continuous monitoring, regular auditing, and incident response capabilities to ensure the highest levels of protection for user data and platform integrity in accordance with international security standards, Indian regulatory requirements, and best practices for financial service providers.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">10.1 Advanced Encryption and Data Protection</h3>
                  <p>
                    We employ state-of-the-art encryption technologies and data protection measures throughout our platform infrastructure with regular updates and security enhancements. Encryption measures include military-grade AES-256 encryption for all data at rest including databases, file storage, backup systems, and archived records with separate key management and regular key rotation, TLS 1.3 encryption for all data in transit between user devices and our servers with perfect forward secrecy and certificate pinning, comprehensive end-to-end encryption for sensitive communications including customer support conversations and verification processes, advanced database-level encryption with separate key management systems using hardware security modules (HSMs) and multi-party key management, encrypted backup storage with geographically distributed key management and secure key escrow procedures, and sophisticated field-level encryption for highly sensitive data including PAN numbers, Aadhaar details, biometric information, and financial account details. All encryption keys are managed through dedicated, certified key management systems with strict role-based access controls, automated key rotation schedules, secure key backup and recovery procedures, and comprehensive audit logging of all key management activities for regulatory compliance and security monitoring.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">10.2 Comprehensive Access Controls and Authentication</h3>
                  <p>
                    We implement sophisticated access control systems and multi-factor authentication to prevent unauthorized access to user accounts and platform infrastructure. Access controls include mandatory two-factor authentication (2FA) for all user accounts with support for TOTP, SMS, hardware tokens, and biometric authentication, advanced role-based access control (RBAC) for internal systems with principle of least privilege implementation and regular access reviews, comprehensive biometric authentication options including fingerprint recognition, facial recognition, and voice authentication where supported by user devices, intelligent device recognition and trusted device management with behavioral analysis and anomaly detection, IP whitelisting and geolocation controls for enhanced account security with user-configurable settings, session management with automatic logout, concurrent session monitoring, and suspicious activity detection, and advanced authentication protocols including OAuth 2.0, SAML, and proprietary security measures for API access and third-party integrations. Internal access controls include sophisticated privileged access management (PAM) for administrative functions with just-in-time access provisioning, comprehensive audit logging of all access attempts and administrative actions with real-time monitoring, regular access reviews and certification processes to ensure appropriate permissions, and emergency access procedures with proper authorization and logging for critical system maintenance and incident response.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 11. Blockchain Transaction Information */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-primary" />
              11. Blockchain Transaction Information
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Cryptocurrency transactions occur on public blockchain networks, which creates unique privacy considerations and data handling requirements under Indian law and international standards. We provide comprehensive information about how blockchain transactions relate to personal data, what information is publicly available on blockchain networks, how we handle blockchain-related data in compliance with privacy regulations, and what users can expect regarding privacy and transparency in cryptocurrency transactions.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">11.1 Public Nature of Blockchain Networks and Privacy Implications</h3>
                  <p>
                    Blockchain networks are generally public and transparent, meaning that transaction information is permanently recorded on distributed ledgers and publicly viewable by anyone with access to blockchain explorers and analytical tools. Public blockchain data includes cryptocurrency wallet addresses for sending and receiving transactions with permanent immutable records, transaction amounts in the respective cryptocurrency denominations with precise decimal accuracy, exact timestamps of transaction confirmation on the blockchain network with block height information, transaction fees paid to miners or validators with gas price details, comprehensive transaction hashes and block numbers for permanent reference and verification, and the complete transaction flow between different wallet addresses with input and output analysis. While blockchain addresses are pseudonymous rather than directly identifying individuals, they can potentially be linked to personal identities through various sophisticated analysis techniques including clustering analysis of address relationships, timing correlation with known activities, exchange transaction linking through deposit and withdrawal patterns, cross-referencing with known address databases and sanctions lists, and behavioral pattern analysis across multiple transactions. We provide comprehensive education to users about the public nature of blockchain transactions, their permanent and immutable characteristics, potential privacy implications and risks, and best practices for maintaining privacy within the cryptocurrency ecosystem through our educational resources, user guides, and regular communication updates.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">11.2 Transaction Monitoring and Regulatory Compliance</h3>
                  <p>
                    We monitor blockchain transactions comprehensively for compliance with Indian AML laws, international sanctions, and platform security requirements while balancing user privacy considerations with regulatory obligations under PMLA and FIU-IND guidelines. Transaction monitoring includes comprehensive screening of all transactions against sanctions lists and known illicit addresses using advanced blockchain analytics tools and real-time updates, detailed analysis of transaction patterns for AML compliance as required by PMLA with automated risk scoring and manual review procedures, systematic tracking of fund flows for regulatory reporting and suspicious activity detection with complete audit trails, identification of potentially suspicious activities through behavioral analysis, pattern recognition, and machine learning algorithms, maintenance of comprehensive records of all monitored transactions for regulatory inspection and law enforcement cooperation, and coordination with law enforcement and regulatory authorities when required by law with proper legal procedures and documentation. This monitoring is essential for maintaining our VASP operating permissions, ensuring platform security and user protection, protecting users and the platform from financial crimes and regulatory violations, and complying with the extensive regulatory framework governing cryptocurrency transactions in India including reporting obligations to FIU-IND and other relevant authorities.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 12. Third-Party Services and Integrations */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">12. Third-Party Services and Integrations</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We integrate with various third-party services to provide comprehensive cryptocurrency trading services, ensure regulatory compliance, and enhance user experience. These integrations are carefully selected based on security standards, privacy protection measures, and regulatory compliance requirements under Indian law. We maintain strict contractual obligations with all third-party providers to ensure your data is protected and used only for authorized purposes.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">12.1 Payment Gateway and Banking Integrations</h3>
                  <p>
                    We integrate with authorized Indian payment gateways and banking services to facilitate INR transactions and comply with RBI regulations. Payment integrations include UPI service providers authorized by NPCI for instant payments and real-time settlement, major Indian banks for IMPS, NEFT, and RTGS transactions with secure API integration, authorized payment gateways including Razorpay, Payu, CCAvenue, and others for card transactions, digital wallet services including Paytm, PhonePe, Google Pay, and other RBI-authorized payment systems, and banking APIs for account verification, balance inquiry, and transaction processing with end-to-end encryption. All payment integrations are secured through tokenization, PCI DSS compliance, and comprehensive fraud monitoring with real-time transaction verification and risk assessment.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">12.2 KYC and Identity Verification Services</h3>
                  <p>
                    We partner with authorized KYC service providers to ensure comprehensive identity verification and regulatory compliance. KYC integrations include UIDAI-authorized Aadhaar verification services for biometric authentication and demographic verification, income tax database integration for PAN verification and validation, specialized document verification services for passport, driving license, and other government-issued documents, video KYC service providers authorized by RBI for remote customer onboarding, and biometric verification services for enhanced security and fraud prevention. All KYC providers are bound by strict data protection agreements and must comply with Indian privacy laws and regulatory requirements.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">12.3 Security and Compliance Services</h3>
                  <p>
                    We utilize specialized security and compliance services to maintain platform integrity and regulatory adherence. Security integrations include cybersecurity vendors for threat detection, prevention, and incident response, blockchain analytics platforms for transaction monitoring and AML compliance, fraud detection services using machine learning and artificial intelligence, and compliance monitoring tools for regulatory reporting and audit management. All security providers undergo rigorous security assessments and are bound by comprehensive confidentiality agreements with regular security audits and compliance reviews.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 13. Data Storage, Transfer, and Retention (Expanded) */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">13. Data Storage, Transfer, and Retention</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We implement comprehensive data storage, transfer, and retention practices that comply with Indian data localization requirements, international security standards, and regulatory mandates for financial services. Our data management practices are designed to ensure security, availability, integrity, and compliance while respecting user privacy rights and providing transparency about data handling throughout its lifecycle.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">13.1 Data Localization and Storage Infrastructure</h3>
                  <p>
                    Our primary data storage infrastructure is located within India to comply with RBI data localization requirements for payment system operators and financial service providers. Data storage includes secure data centers in Mumbai, Bangalore, and Delhi with ISO 27001 certification, comprehensive physical security measures, and 24/7 monitoring, cloud infrastructure with leading providers including AWS Asia Pacific (Mumbai) and Google Cloud India with strict data residency guarantees and compliance certifications, encrypted databases with AES-256 encryption at rest and comprehensive access controls with role-based permissions, automated backup systems with geographically distributed backup locations within India and real-time synchronization, comprehensive disaster recovery infrastructure with multiple availability zones and automatic failover capabilities, and specialized secure storage for sensitive documents including KYC documentation with enhanced encryption, access logging, and audit trails. All storage infrastructure maintains 99.9% uptime guarantees with SLA monitoring, undergoes regular security audits and penetration testing by certified professionals, and implements comprehensive monitoring, incident response, and business continuity capabilities with detailed documentation and regular testing procedures.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">13.2 Comprehensive Data Retention Policies</h3>
                  <p>
                    We maintain detailed data retention policies that balance regulatory requirements with user privacy rights and operational efficiency. Retention periods include KYC and identity verification data retained for five years after account closure as mandated by PMLA regulations with secure archival and restricted access, comprehensive transaction records and financial data retained for five years from transaction date for regulatory compliance, audit purposes, and tax reporting assistance, customer communication records including support conversations retained for three years for dispute resolution and regulatory inspection with comprehensive indexing and search capabilities, marketing and analytics data retained for two years or until user withdrawal of consent with immediate deletion upon consent withdrawal, comprehensive security logs and audit trails retained for seven years for forensic analysis, regulatory compliance, and incident investigation, tax-related documentation retained as per income tax regulations and user requirements with specialized secure storage, and blockchain transaction records maintained permanently due to the immutable nature of blockchain technology with appropriate privacy protection measures. Users can request earlier deletion of certain data categories where legally permissible and not required for regulatory compliance, and we provide annual data retention reviews, automated deletion of expired data in accordance with our retention schedules, and comprehensive documentation of all retention and deletion activities for audit and compliance purposes.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 14. Children's Privacy */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">14. Children's Privacy</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Our Services are not intended for individuals under the age of 18 years, and we do not knowingly collect, process, or store personal information from minors. This policy is in compliance with the Digital Personal Data Protection Act 2023, Information Technology Act 2000, and other applicable Indian laws regarding children's privacy and protection. We have implemented comprehensive measures to prevent minors from accessing our cryptocurrency trading platform and to immediately address any inadvertent collection of children's data.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">14.1 Age Verification and Prevention Measures</h3>
                  <p>
                    We implement robust age verification measures to prevent minors from creating accounts or accessing our Services. Age verification includes mandatory date of birth verification during account registration with cross-reference against government-issued identification documents, comprehensive KYC procedures that require government-issued photo identification proving age majority, additional verification for users who appear to be close to the minimum age requirement with enhanced documentation requirements, automated systems that flag and prevent account creation for users under 18 years of age, and regular audit and monitoring of user accounts to identify any potential underage users with immediate account suspension and investigation procedures. All age verification processes are designed to be thorough while maintaining user privacy and complying with applicable data protection laws.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">14.2 Inadvertent Collection and Immediate Response Procedures</h3>
                  <p>
                    In the unlikely event that we discover we have inadvertently collected personal information from a minor, we have established immediate response procedures to protect the child's privacy and comply with legal requirements. Response procedures include immediate suspension of the account upon discovery of underage use with prevention of further access to Services, prompt notification to parents or legal guardians where contact information is available with explanation of the situation and our response, immediate deletion of all personal information related to the minor's account except where retention is required by law for regulatory compliance, comprehensive investigation to determine how the underage account was created and implementation of additional safeguards to prevent similar occurrences, and coordination with legal authorities where required by law or where there are concerns about the minor's safety or welfare. We encourage parents and guardians to monitor their children's internet activities and to contact us immediately if they believe their child has provided personal information to our platform without proper age verification.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 15. Biometric and OTP-based Authentication */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">15. Biometric and OTP-based Authentication</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We utilize advanced biometric authentication and OTP-based verification systems to enhance security, prevent fraud, and comply with Indian digital identity regulations. These authentication methods are implemented with strict privacy protection measures, user consent requirements, and compliance with UIDAI guidelines and other applicable Indian laws governing biometric data collection and processing.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">15.1 Biometric Authentication and Data Protection</h3>
                  <p>
                    We implement biometric authentication with the highest levels of privacy protection and security. Biometric systems include facial recognition technology for identity verification during KYC processes with liveness detection and anti-spoofing measures, fingerprint authentication where supported by user devices with local storage and encrypted transmission, voice recognition for phone-based verification and customer support authentication, and Aadhaar-based biometric authentication through authorized UIDAI service providers with strict compliance to UIDAI guidelines and data protection requirements. All biometric data is processed with explicit user consent, encrypted using advanced encryption algorithms, stored with enhanced security measures including access controls and audit logging, and used only for the specific purposes disclosed to users with comprehensive audit trails and regular security assessments.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">15.2 OTP and Multi-Factor Authentication Systems</h3>
                  <p>
                    We utilize comprehensive OTP and multi-factor authentication systems to ensure account security and transaction verification. OTP systems include SMS-based OTP for account verification and transaction authorization with secure delivery through authorized telecom providers, email-based OTP for account recovery and security verification with encrypted delivery and time-based expiration, TOTP (Time-based One-Time Password) support for enhanced security using authenticator apps with industry-standard algorithms, and hardware token support for high-security requirements with certified security devices and comprehensive backup procedures. All OTP systems include rate limiting to prevent abuse, secure generation and transmission with encryption, comprehensive logging for security monitoring and audit purposes, and user-friendly backup and recovery mechanisms to ensure account accessibility while maintaining security standards.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 16. International Data Transfers */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">16. International Data Transfers</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                While we primarily store and process data within India in compliance with data localization requirements, certain limited data transfers may occur internationally for specific business purposes, regulatory compliance, or technical requirements. All international data transfers are conducted with appropriate safeguards, legal protections, and user consent where required by applicable laws.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">16.1 Limited International Data Transfers and Safeguards</h3>
                  <p>
                    International data transfers are limited to specific circumstances and conducted with comprehensive safeguards. Transfer circumstances include blockchain transaction processing where cryptocurrency networks are inherently global and decentralized, sanctions screening and compliance verification using international databases and security services, cybersecurity threat intelligence and incident response coordination with global security providers, regulatory compliance and reporting for international cooperation agreements and mutual legal assistance treaties, and technical support and infrastructure management for global service providers with Indian operations. All international transfers include comprehensive data processing agreements with equivalent privacy protection standards, standard contractual clauses or adequacy decisions where applicable, encryption and security measures during transfer and storage, limited purpose and duration with clear data retention and deletion schedules, and regular monitoring and audit of international service providers to ensure continued compliance with privacy protection standards.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">16.2 Cross-Border Regulatory Compliance</h3>
                  <p>
                    We ensure compliance with both Indian and applicable international regulations for any cross-border data transfers. Compliance measures include adherence to RBI guidelines for data localization with primary data storage within India, compliance with international sanctions and anti-money laundering requirements through authorized global databases, coordination with international law enforcement and regulatory authorities as required by mutual legal assistance treaties and regulatory cooperation agreements, implementation of privacy protection measures that meet or exceed Indian standards for any international processing, and regular assessment of international data protection laws and regulations to ensure continued compliance with evolving global privacy standards. We provide transparency about any international data transfers through this privacy policy and direct user notifications where required by law.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 17. Data Breach Notification Policy */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-primary" />
              17. Data Breach Notification Policy
            </h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                We have established comprehensive data breach response and notification procedures in compliance with the Digital Personal Data Protection Act 2023, Information Technology Act 2000, and other applicable Indian laws. Our breach response framework is designed to minimize impact, protect user data, ensure regulatory compliance, and maintain transparency throughout the incident response process.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">17.1 Incident Detection and Response Procedures</h3>
                  <p>
                    We maintain comprehensive incident detection and response capabilities to identify and address potential data breaches immediately. Detection systems include 24/7 security monitoring with automated threat detection and real-time alerting, comprehensive audit logging and analysis with machine learning-based anomaly detection, regular security assessments and penetration testing with immediate escalation procedures, employee training and reporting mechanisms for potential security incidents, and coordinated incident response procedures with defined roles, responsibilities, and escalation paths. Upon detection of a potential breach, we immediately activate our incident response team, conduct preliminary assessment and containment procedures, preserve evidence for investigation and regulatory reporting, and begin comprehensive impact assessment and user notification procedures in accordance with legal requirements and best practices.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">17.2 User and Regulatory Notification Requirements</h3>
                  <p>
                    We are committed to prompt and transparent notification of data breaches in accordance with Indian law and regulatory requirements. Notification procedures include immediate notification to relevant regulatory authorities including CERT-In and other applicable agencies within required timeframes, comprehensive user notification for breaches that may pose significant risk to user rights and interests with clear information about the nature of the breach, data involved, and protective measures taken, detailed communication about steps taken to address the breach and prevent future incidents, guidance for users on protective measures they can take to protect their accounts and personal information, and ongoing updates throughout the investigation and remediation process. All notifications include clear, non-technical language explaining the nature of the incident, comprehensive information about affected data and potential risks, detailed steps taken to address the breach and enhance security, and specific recommendations for users to protect their accounts and personal information with dedicated support channels for breach-related inquiries and assistance.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 18. Consent and Withdrawal Mechanisms */}
          <section>
            <h2 className="text-3xl font-bold text-foreground mb-8">18. Consent and Withdrawal Mechanisms</h2>
            
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p className="text-lg">
                Under the Digital Personal Data Protection Act 2023 and other applicable Indian privacy laws, we ensure that all data processing based on consent is conducted with clear, informed, and freely given consent. We provide comprehensive mechanisms for users to provide consent and withdraw consent at any time, with immediate effect on data processing activities while maintaining essential service functionality and regulatory compliance.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">18.1 Informed Consent and Granular Control</h3>
                  <p>
                    We obtain informed consent through clear, understandable language and granular control mechanisms. Consent processes include detailed explanation of data processing purposes with specific use cases and benefits, granular consent options for different categories of data processing including marketing, analytics, and optional features, clear information about data sharing with third parties and user control over such sharing, comprehensive explanation of user rights and withdrawal mechanisms with easy access to consent management tools, and regular consent renewal and confirmation procedures to ensure continued user agreement with data processing activities. All consent is obtained through active user engagement rather than pre-checked boxes or assumed consent, with clear documentation of consent decisions and regular opportunities for users to review and modify their consent preferences through user-friendly account management interfaces.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">18.2 Consent Withdrawal and Data Processing Impact</h3>
                  <p>
                    Users can withdraw consent at any time through multiple mechanisms with immediate effect on future data processing. Withdrawal mechanisms include comprehensive account settings with granular control over different types of consent, one-click withdrawal options for marketing and optional data processing, customer support assisted withdrawal with immediate processing and confirmation, and clear information about the impact of consent withdrawal on service functionality and user experience. Upon consent withdrawal, we immediately cease the relevant data processing activities, update our systems to reflect the withdrawal with comprehensive audit logging, provide confirmation of the withdrawal and its effective date, and continue to provide essential services based on other legal grounds including contractual necessity and regulatory compliance requirements. We ensure that consent withdrawal does not affect the lawfulness of processing based on consent before its withdrawal and maintain clear records of all consent decisions and withdrawals for regulatory compliance and user transparency.
                  </p>
                </div>
              </div>
            </div>
          </section>
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
                    <p><strong className="text-foreground">Grievance Officer:</strong> grievance@blynkcrypto.in</p>
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
                    <p><strong className="text-foreground">GSTIN:</strong> 23AANCB2572J1ZK</p>
                    <p><strong className="text-foreground">Phone:</strong> +91-XXX-XXX-XXXX</p>
                    <p><strong className="text-foreground">Fax:</strong> +91-XXX-XXX-XXXX</p>
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
                  <li>• Preferred language for response (English, Hindi, or other regional languages)</li>
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
                  This Privacy Policy and all matters relating to your privacy rights and our data processing activities shall be governed by and construed in accordance with the laws of India, including but not limited to the Information Technology Act 2000, Digital Personal Data Protection Act 2023, Prevention of Money Laundering Act 2002, Indian Contract Act 1872, Consumer Protection Act 2019, and other applicable central and state laws, rules, and regulations. Any disputes arising out of or in connection with this Privacy Policy, including disputes relating to data processing, privacy rights, or regulatory compliance, shall be subject to the exclusive jurisdiction of the courts in Bhopal, Madhya Pradesh, India. However, we retain the right to bring proceedings against you for breach of this Privacy Policy in your country of residence or any other relevant country with appropriate jurisdiction. For international users, we will comply with applicable international privacy laws and treaties while maintaining primary compliance with Indian data protection regulations.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-foreground mb-3">Material Changes Notification Process</h3>
                <p className="text-muted-foreground mb-3">
                  For material changes to this Policy that may significantly affect your rights or how we process your personal data, we will provide at least 30 days advance notice through multiple channels:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Email notification to your registered email address with delivery confirmation and read receipts</li>
                  <li>• Prominent banner notice on our website and mobile applications with acknowledgment requirements</li>
                  <li>• In-app notifications with acknowledgment requirements for active users and push notifications</li>
                  <li>• SMS notification to your registered mobile number for critical changes affecting user rights</li>
                  <li>• Publication in leading English and Hindi newspapers for significant policy overhauls</li>
                  <li>• Updated version history with detailed change summaries and impact assessments</li>
                  <li>• Personal communication through customer support for high-value or frequent users</li>
                </ul>
              </div>

              <div className="bg-primary/10 p-8 rounded-lg border border-primary/30">
                <h3 className="text-2xl font-bold text-foreground mb-4 text-center">Thank You for Trusting Blynk with Your Privacy</h3>
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground max-w-4xl mx-auto">
                    Your privacy and data security are fundamental to our mission of providing secure, compliant, and user-centric cryptocurrency trading services in India. We are committed to maintaining the highest standards of data protection, regulatory compliance, and transparency in all our operations. This comprehensive Privacy Policy reflects our dedication to protecting your personal information while enabling us to provide innovative financial services in the evolving digital asset ecosystem under the regulatory framework established by Indian authorities.
                  </p>
                  <div className="space-y-2">
                    <p className="text-muted-foreground"><strong>Current Policy Version:</strong> 2.0</p>
                    <p className="text-muted-foreground"><strong>Effective Date:</strong> August 3, 2025</p>
                    <p className="text-muted-foreground"><strong>Last Comprehensive Review:</strong> August 3, 2025</p>
                    <p className="text-muted-foreground"><strong>Next Scheduled Review:</strong> July 1, 2026</p>
                    <p className="text-muted-foreground"><strong>Regulatory Compliance:</strong> DPDP Act 2023, PMLA 2002, IT Act 2000, FIU-IND Guidelines, RBI Regulations</p>
                    <p className="text-muted-foreground"><strong>International Standards:</strong> ISO 27001, SOC 2 Type II, Privacy by Design</p>
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