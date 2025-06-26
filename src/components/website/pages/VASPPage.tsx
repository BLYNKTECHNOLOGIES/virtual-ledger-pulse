
import { Shield, Users, FileCheck, AlertCircle, Scale, HelpCircle } from 'lucide-react';

export function VASPPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-900 to-purple-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">VASP - Virtual Asset Service Provider</h1>
            <p className="text-xl text-indigo-100 max-w-4xl mx-auto">
              Comprehensive crypto business solutions with full compliance, KYC processes, and regulatory adherence for Virtual Asset Service Providers.
            </p>
          </div>
        </div>
      </section>

      {/* What is VASP */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-6">What is a VASP?</h2>
            <div className="max-w-4xl mx-auto">
              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                A Virtual Asset Service Provider (VASP) is defined by the Financial Action Task Force (FATF) as any natural or legal person who conducts one or more virtual asset activities or operations for or on behalf of another natural or legal person.
              </p>
              <p className="text-lg text-gray-700 leading-relaxed">
                As a licensed VASP, we provide secure, compliant, and transparent virtual asset services while adhering to international regulatory standards and anti-money laundering (AML) requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Crypto Business Model */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Crypto Business Model</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-semibold mb-6">P2P Exchange Platform</h3>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                  <span>Integration with major exchanges like Bybit and Bitget for liquidity</span>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                  <span>Secure Over-The-Counter (OTC) trading services</span>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                  <span>USDT and major cryptocurrency trading pairs</span>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                  <span>Real-time market data and competitive pricing</span>
                </li>
                <li className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3"></div>
                  <span>Multi-currency support and instant settlements</span>
                </li>
              </ul>
            </div>
            <div>
              <img 
                src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=400&fit=crop" 
                alt="Crypto Trading"
                className="rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* KYC & AML Process */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">KYC & AML Process</h2>
            <p className="text-xl text-gray-600">Comprehensive identity verification and compliance procedures</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <Users className="h-12 w-12 text-blue-600 mb-6" />
              <h3 className="text-xl font-semibold mb-4">User Verification</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Identity document verification</li>
                <li>• Address proof validation</li>
                <li>• Biometric authentication</li>
                <li>• Phone and email verification</li>
              </ul>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <FileCheck className="h-12 w-12 text-green-600 mb-6" />
              <h3 className="text-xl font-semibold mb-4">Document Checks</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Aadhaar card verification</li>
                <li>• PAN card validation</li>
                <li>• Bank account verification</li>
                <li>• Utility bill confirmation</li>
              </ul>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <Shield className="h-12 w-12 text-purple-600 mb-6" />
              <h3 className="text-xl font-semibold mb-4">Video KYC</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Live video verification</li>
                <li>• Real-time document validation</li>
                <li>• Face matching technology</li>
                <li>• Secure video recording</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Regulatory Compliance */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Regulatory Compliance</h2>
            <p className="text-xl text-gray-600">Full adherence to Indian and international regulations</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold mb-6">RBI & FIU Compliance</h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <Scale className="h-6 w-6 text-blue-600 mt-1 mr-3" />
                  <div>
                    <h4 className="font-semibold">Reserve Bank of India Guidelines</h4>
                    <p className="text-gray-600">Strict adherence to RBI's virtual asset regulations and reporting requirements</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <AlertCircle className="h-6 w-6 text-red-600 mt-1 mr-3" />
                  <div>
                    <h4 className="font-semibold">Financial Intelligence Unit Reporting</h4>
                    <p className="text-gray-600">Regular STR and CTR submissions to FIU-IND for suspicious transactions</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-semibold mb-6">AML/CFT Policies</h3>
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Daily Reporting</h4>
                  <p className="text-gray-600">Automated daily transaction monitoring and reporting systems</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Monthly Compliance</h4>
                  <p className="text-gray-600">Comprehensive monthly compliance reports and audit trails</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Source of Funds</h4>
                  <p className="text-gray-600">Rigorous source of funds verification and documentation</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Management */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Risk Management</h2>
            <p className="text-xl text-gray-600">Advanced security measures and fraud prevention</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { title: 'Fraud Prevention', description: 'AI-powered fraud detection and prevention systems' },
              { title: 'Transaction Monitoring', description: 'Real-time suspicious transaction reporting and alerts' },
              { title: 'Third-Party Detection', description: 'Advanced algorithms to detect third-party transactions' },
              { title: 'Risk Scoring', description: 'Dynamic risk assessment and user scoring mechanisms' }
            ].map((item, index) => (
              <div key={index} className="bg-white p-6 rounded-xl shadow-lg text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dispute Resolution */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Dispute Resolution</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold mb-6">Appeals System</h3>
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Multi-tier Resolution</h4>
                  <p className="text-gray-600">Structured appeals process with escalation mechanisms</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Timeline Commitments</h4>
                  <p className="text-gray-600">Guaranteed response times for all dispute categories</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-semibold mb-6">User Feedback</h3>
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Rating System</h4>
                  <p className="text-gray-600">Comprehensive user rating and review mechanism</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-semibold mb-2">Feedback Integration</h4>
                  <p className="text-gray-600">Continuous improvement based on user feedback</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-6">
            {[
              {
                question: 'What is the difference between a VASP and a regular crypto exchange?',
                answer: 'A VASP is a regulated entity that complies with FATF guidelines and local regulations, providing additional security, compliance, and consumer protection compared to unregulated platforms.'
              },
              {
                question: 'How long does the KYC verification process take?',
                answer: 'Our KYC process typically takes 24-48 hours for document verification and up to 72 hours for video KYC completion, depending on document quality and verification requirements.'
              },
              {
                question: 'What cryptocurrencies do you support?',
                answer: 'We support major cryptocurrencies including Bitcoin (BTC), Ethereum (ETH), Tether (USDT), and other popular altcoins, with regular additions based on market demand and regulatory approval.'
              },
              {
                question: 'How do you ensure the security of user funds?',
                answer: 'We employ multi-signature wallets, cold storage solutions, insurance coverage, and regular security audits to ensure maximum protection of user assets.'
              },
              {
                question: 'What are your transaction limits?',
                answer: 'Transaction limits vary based on KYC level and user verification status. Basic KYC allows up to ₹50,000 per day, while full verification enables higher limits based on risk assessment.'
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-lg">
                <div className="flex items-start">
                  <HelpCircle className="h-6 w-6 text-blue-600 mt-1 mr-4 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
