import { Shield, FileText, Users, CreditCard, Lock, Eye, AlertTriangle, Phone, Mail, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CompliancePage() {

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-primary/80 text-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Shield className="h-20 w-20 mx-auto mb-6 text-white/80" />
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Compliance & Security at<br />
              <span className="text-white/90">Blynk Virtual Technologies Pvt. Ltd.</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-4xl mx-auto leading-relaxed">
              We are committed to full compliance with Indian regulations, ensuring every P2P crypto transaction is transparent, secure, and legally protected.
            </p>
          </div>
        </div>
      </section>

      {/* Why Compliance Matters */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">Why Compliance Matters</h2>
          <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
            <p>We operate in accordance with Indian regulatory guidelines governing financial transactions and Virtual Digital Assets (VDAs).</p>
            <p>Our framework ensures secure trading, AML/KYC compliance, and data privacy.</p>
            <p>We strictly adhere to standards laid down by RBI, FIU-IND, and applicable IT Act provisions.</p>
          </div>
        </div>
      </section>

      {/* KYC & Identity Verification */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900">KYC & Identity Verification</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Mandatory Know Your Customer (KYC) verification for all users</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Accepted documents: Aadhaar, PAN, Passport, Driving License</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Both Manual KYC and Video KYC are supported</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Risky accounts are flagged for Re-KYC verification</p>
                </div>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-primary/5 p-12 rounded-2xl">
                <Users className="h-24 w-24 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Verified Users</h3>
                <p className="text-gray-600">All users undergo comprehensive verification</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AML & Risk Monitoring */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 text-center">
              <div className="bg-primary/5 p-12 rounded-2xl">
                <Shield className="h-24 w-24 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">24/7 Monitoring</h3>
                <p className="text-gray-600">Continuous surveillance of all transactions</p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900">AML & Risk Monitoring</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Adherence to Anti-Money Laundering (AML) policies</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">High-value or unusual transactions monitoring</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Frequent bank account changes detection</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Suspicious activity reporting to FIU-IND</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Secure Payments */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <CreditCard className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900">Secure Payments</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">All payments routed via verified Indian bank accounts</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Third-party or anonymous transactions prohibited</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Bank-grade encryption for payment security</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Real-time payment verification system</p>
                </div>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-primary/5 p-12 rounded-2xl">
                <Lock className="h-24 w-24 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Bank-Grade Security</h3>
                <p className="text-gray-600">Military-grade encryption for all transactions</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* User Protection */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 text-center">
              <div className="bg-primary/5 p-12 rounded-2xl">
                <Eye className="h-24 w-24 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Escrow Protection</h3>
                <p className="text-gray-600">Funds secured until transaction completion</p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Eye className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900">User Protection</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Escrow Mechanism: Crypto held until payment verified</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Dedicated support for appeals and disputes</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">Fraud Detection: Flagged users restricted</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 mt-1 flex-shrink-0" />
                  <p className="text-gray-700">24/7 transaction monitoring system</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Features Row */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Additional Security Measures</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mx-auto mb-6 p-4 bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center">
                <Lock className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Data Privacy & Security</h3>
              <p className="text-gray-600 leading-relaxed">Full compliance with IT Act 2000 and Indian Data Protection laws. User data encrypted and stored securely.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-6 p-4 bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center">
                <FileText className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Transparency & Reporting</h3>
              <p className="text-gray-600 leading-relaxed">Regular compliance audits and suspicious transaction logging for regulatory reporting.</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-6 p-4 bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center">
                <AlertTriangle className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Legal Disclaimer</h3>
              <p className="text-gray-600 leading-relaxed">VDA trading subject to taxation. Users responsible for tax compliance and reporting obligations.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Legal Disclaimer */}
      <section className="py-20 bg-red-50 border-y border-red-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <AlertTriangle className="h-16 w-16 mx-auto mb-6 text-red-600" />
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Important Legal Disclaimer</h2>
          <div className="bg-white p-8 rounded-xl border-l-4 border-red-500 text-left">
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">Tax Obligations:</strong> Trading of Virtual Digital Assets (VDAs) in India is subject to taxation and reporting under the Income Tax Act.
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">User Responsibility:</strong> Users are solely responsible for complying with tax filing, TDS, and GST obligations.
              </p>
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-gray-900">Liability Limitation:</strong> Blynk Virtual Technologies Pvt. Ltd. shall not be held liable for user negligence, fraudulent third-party transactions, or non-compliance with individual tax responsibilities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Compliance Team */}
      <section className="py-20 bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Contact Our Compliance Team</h2>
          <p className="text-xl text-white/90 mb-12">
            Have compliance questions? Our dedicated team is here to help with all regulatory inquiries.
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white/10 p-8 rounded-xl hover:bg-white/15 transition-colors">
              <Mail className="h-12 w-12 mx-auto mb-4 text-white" />
              <h3 className="text-xl font-semibold mb-2 text-white">Email Us</h3>
              <p className="text-white/90">compliance@blynkvirtual.com</p>
            </div>
            
            <div className="bg-white/10 p-8 rounded-xl hover:bg-white/15 transition-colors">
              <Phone className="h-12 w-12 mx-auto mb-4 text-white" />
              <h3 className="text-xl font-semibold mb-2 text-white">Call Us</h3>
              <p className="text-white/90">+91-XXXXXXXXXX</p>
            </div>
          </div>

          <Button 
            variant="secondary" 
            size="lg" 
            className="bg-white text-primary hover:bg-gray-100 px-8 py-4 text-lg rounded-full"
          >
            Get Compliance Support
          </Button>
        </div>
      </section>
    </div>
  );
}