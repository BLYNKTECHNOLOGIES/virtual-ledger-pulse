
import { Shield, Mail, MapPin, Phone } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Shield className="h-16 w-16 mx-auto mb-6 text-blue-200" />
            <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-xl text-blue-100">
              Effective Date: 19 February 2025
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-lg max-w-none">
          <div className="bg-blue-50 p-6 rounded-lg mb-8">
            <p className="text-lg text-gray-700 mb-0">
              Welcome to <strong>Blynk Virtual Technologies Private Limited</strong> ("Company", "we", "our", "us"). 
              Your privacy is critically important to us. This Privacy Policy explains how we collect, use, disclose, 
              and safeguard your information when you visit our website, use our services, or interact with our CRM systems.
            </p>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">1. Who We Are</h2>
              <p className="text-gray-700 leading-relaxed">
                Blynk Virtual Technologies Private Limited is a private limited company registered under the Ministry of 
                Corporate Affairs, India, bearing CIN <strong>U62099MP2025PTC074915</strong>. We specialize in:
              </p>
              <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
                <li>Web development & custom IT solutions</li>
                <li>App development & UI/UX services</li>
                <li>SEO, marketing & analytics consulting</li>
                <li>Virtual Asset Service Provider (VASP) services including KYC, P2P crypto onboarding & regulatory compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We collect the following types of data:</p>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">a. Personal Data</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li>Name, Email Address, Phone Number</li>
                    <li>Company name, Designation</li>
                    <li>Government-issued ID proofs (Aadhaar, PAN, etc. for KYC)</li>
                    <li>Payment and transaction data (for P2P clients)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">b. Technical Data</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    <li>IP address, Browser type, Device information</li>
                    <li>Session logs and activity within our CRM</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">c. Cookies and Usage Data</h3>
                  <p className="text-gray-700">
                    We may use cookies to track user behavior and usage trends for website optimization and security.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">3. How We Use Your Data</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Your data is used for the following purposes:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>To provide and manage our IT, SEO, and app development services</li>
                <li>To onboard and verify users for our VASP (P2P trading) platform</li>
                <li>To improve customer experience and UI/UX optimization</li>
                <li>To comply with legal and regulatory requirements (e.g., AEML guidelines)</li>
                <li>To detect and prevent fraudulent or unauthorized activity</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">4. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We do not sell or rent your data. We may share data only with:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Regulatory bodies (upon legal request)</li>
                <li>Payment processors and banking partners</li>
                <li>Internal team for analytics, support, and security monitoring</li>
                <li>Third-party vendors under strict confidentiality agreements (e.g., KYC verification tools)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">5. Data Security</h2>
              <p className="text-gray-700 leading-relaxed">
                We implement industry-standard encryption, two-factor authentication, firewalls, and access control 
                to ensure your data is stored and transmitted securely.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">6. Your Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-4">As a user, you have the right to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Access, modify, or delete your personal data</li>
                <li>Withdraw consent (where applicable)</li>
                <li>Raise complaints about misuse of data</li>
                <li>Request data portability (if legally allowed)</li>
              </ul>
              <p className="text-gray-700 mt-4">
                To exercise any of these rights, please contact: 
                <a href="mailto:compliance@blynkvirtual.com" className="text-blue-600 hover:underline ml-2">
                  compliance@blynkvirtual.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">7. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Our services are not intended for individuals under 18 years of age. We do not knowingly collect 
                personal data from minors.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">8. Third-Party Links</h2>
              <p className="text-gray-700 leading-relaxed">
                Our website may contain links to external sites (e.g., UPI gateways, analytics tools). We are not 
                responsible for the privacy practices or content of those sites.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">9. Updates to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify this Privacy Policy at any time. Any changes will be posted on this page 
                with a revised date at the top. Continued use of our website and services constitutes your acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">10. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                If you have any questions or concerns about this policy, contact us at:
              </p>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-4">Blynk Virtual Technologies Private Limited</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    <span className="text-gray-700">
                      Registered Office: First Floor Balwant Arcade, Plot No. 15<br />
                      Maharana Pratap Nagar, Zone II<br />
                      Bhopal, 462011, Madhya Pradesh, India
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-600" />
                    <a href="mailto:privacy@blynkex.com" className="text-blue-600 hover:underline">
                      privacy@blynkex.com
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="h-5 w-5 text-blue-600 flex items-center justify-center text-sm font-bold">🌐</span>
                    <a href="https://www.blynkex.com" className="text-blue-600 hover:underline">
                      www.blynkex.com
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
