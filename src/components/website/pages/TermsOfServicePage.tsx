
import { FileText, Mail, MapPin } from 'lucide-react';

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-6 text-blue-200" />
            <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
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
            <div className="text-gray-700 space-y-2">
              <p><strong>Company:</strong> Blynk Virtual Technologies Private Limited</p>
              <p><strong>CIN:</strong> U62099MP2025PTC074915</p>
              <p><strong>Registered Office:</strong> Bhopal, Madhya Pradesh, India</p>
              <p><strong>Website:</strong> www.blynkex.com</p>
            </div>
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing or using our website, CRM systems, services, or products offered by Blynk Virtual Technologies 
                Private Limited ("Blynk", "we", "us", "our"), you agree to be bound by these Terms of Service ("Terms"). 
                If you do not agree, please discontinue use of our services immediately.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">2. Services Provided</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Blynk offers a wide range of services, including:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Custom web & app development</li>
                <li>SEO & digital marketing services</li>
                <li>Cloud hosting and software solutions</li>
                <li>Virtual Asset Service Provider (VASP) features like P2P onboarding, KYC verification, and AEML compliance</li>
              </ul>
              <p className="text-gray-700 mt-4">
                Some services may require signing of separate Service Level Agreements (SLAs) or contracts.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">3. Eligibility</h2>
              <p className="text-gray-700 leading-relaxed mb-4">To use our services, you must:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Be at least 18 years old</li>
                <li>Provide accurate and up-to-date registration information</li>
                <li>Not be barred from using our services under applicable laws (including crypto-related laws in your country)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">4. User Accounts</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Upon registration:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>You are responsible for maintaining confidentiality of your login credentials.</li>
                <li>You must not share login details with unauthorized individuals.</li>
                <li>If you suspect a security breach, you must notify us immediately.</li>
                <li>For internal staff login to CRM systems, separate access controls and permissions apply.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">5. Payment Terms</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Services are billed as per project terms or monthly/annual subscription plans.</li>
                <li>VASP/P2P transactions must comply with internal KYC and regulatory processes.</li>
                <li>Delays in payment may lead to service suspension or termination.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">6. KYC & Compliance (For P2P Clients)</h2>
              <p className="text-gray-700 leading-relaxed mb-4">To use our P2P trading services:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>You must complete full KYC (Know Your Customer) verification.</li>
                <li>We adhere to all applicable Anti-Money Laundering (AML) and AEML Guidelines.</li>
                <li>We reserve the right to suspend or reject onboarding at our sole discretion if suspicious activity is detected.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">7. Acceptable Use</h2>
              <p className="text-gray-700 leading-relaxed mb-4">You agree not to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Violate any laws or third-party rights</li>
                <li>Use our services to promote illegal crypto activity, scams, or terrorism financing</li>
                <li>Interfere with our systems or attempt unauthorized access</li>
              </ul>
              <p className="text-gray-700 mt-4">
                Violation of this policy may result in account termination and legal consequences.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">8. Intellectual Property</h2>
              <p className="text-gray-700 leading-relaxed">
                All content on this website and within our systems (logos, source code, designs, graphics, texts, etc.) 
                is the exclusive property of Blynk Virtual Technologies Pvt Ltd or licensed to us. You may not use, 
                reproduce, or modify it without written permission.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">9. Termination of Services</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We may suspend or terminate your access:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>For breach of terms</li>
                <li>For suspicious activity flagged by our security/KYC team</li>
                <li>Upon your request to delete or deactivate your account</li>
              </ul>
              <p className="text-gray-700 mt-4">
                All obligations, such as pending payments or legal liabilities, survive account termination.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">10. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">
                We may integrate third-party platforms (payment gateways, analytics tools, KYC providers). We are not 
                liable for actions taken by such third parties or downtime/issues caused by their systems.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">11. Disclaimer of Warranties</h2>
              <p className="text-gray-700 leading-relaxed">
                Services are provided on an "as-is" and "as-available" basis. We make no guarantees that our website or 
                systems will always be available, error-free, or compatible with your device or software.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">12. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                To the fullest extent permitted by law, Blynk Virtual Technologies Private Limited shall not be liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Loss of profits or business</li>
                <li>Data loss or unauthorized access</li>
                <li>Downtime caused by third-party integrations or user errors</li>
              </ul>
              <p className="text-gray-700 mt-4">
                Total liability shall not exceed the amount paid by you for the relevant service in the past 3 months.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">13. Governing Law & Jurisdiction</h2>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by the laws of India, with jurisdiction exclusively in the courts of 
                Bhopal, Madhya Pradesh.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">14. Changes to These Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update these Terms at any time. Changes will be posted on this page. Continued use of our 
                services after updates implies acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">15. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed mb-4">For any queries or disputes:</p>
              <div className="bg-gray-50 p-6 rounded-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-600" />
                    <a href="mailto:legal@blynkex.com" className="text-blue-600 hover:underline">
                      legal@blynkex.com
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    <span className="text-gray-700">Bhopal, Madhya Pradesh, India</span>
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
