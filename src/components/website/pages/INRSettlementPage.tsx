import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  CreditCard, 
  Shield, 
  Clock, 
  FileText, 
  Download,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle,
  Zap,
  BarChart3,
  Lock,
  RefreshCw,
  Calendar,
  Database
} from "lucide-react";

export function INRSettlementPage() {
  const settlementCycles = [
    {
      type: "T+0 (Instant)",
      cutoff: "Before 3:00 PM IST",
      credit: "Same Day (within 2–3 hours)",
      badge: "fastest"
    },
    {
      type: "T+1 (Standard)",
      cutoff: "Before 6:00 PM IST",
      credit: "Next Business Day",
      badge: "standard"
    },
    {
      type: "Bulk Settlement",
      cutoff: "Custom schedule",
      credit: "Based on SLA",
      badge: "custom"
    }
  ];

  const eligibilityRequirements = [
    "Be a registered entity (Company, LLP, Society, or Trust)",
    "Have a verified institutional account on our platform",
    "GST Certificate / CIN / PAN",
    "Cancelled cheque or bank proof",
    "Authorized signatory details",
    "Settlement mandate form"
  ];

  const supportedBankTypes = [
    "Current Accounts (preferred)",
    "Escrow Accounts", 
    "Nodal Accounts (for marketplaces)",
    "Settlement-specific accounts with matching UPI/IFSC details"
  ];

  const integrationOptions = [
    {
      icon: <Database className="h-5 w-5" />,
      title: "Dashboard (manual request)",
      description: "Easy-to-use web interface for manual settlements"
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "API (for automated payouts)",
      description: "RESTful API for seamless automation"
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      title: "Scheduled Mandates",
      description: "Fixed daily/weekly automatic settlements"
    }
  ];

  const whyChooseUs = [
    { icon: <RefreshCw className="h-4 w-4" />, text: "Fast and predictable settlement cycles" },
    { icon: <Shield className="h-4 w-4" />, text: "Fully compliant with Indian financial laws" },
    { icon: <BarChart3 className="h-4 w-4" />, text: "Transparent reporting and reconciliation" },
    { icon: <Building2 className="h-4 w-4" />, text: "Dedicated institutional support" },
    { icon: <Zap className="h-4 w-4" />, text: "API-ready for automation" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              INR Settlement for Institutions
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Seamless and reliable INR settlement services for registered institutions, partners, 
            and enterprise clients. Manage high-volume transactions with speed, compliance, and traceability.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pb-16 space-y-12">
        {/* What is INR Settlement */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-primary" />
              What is INR Settlement?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              INR Settlement refers to the process of transferring Indian Rupees (₹) from your wallet/account 
              on our platform to your linked institutional bank account. This is essential for:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                "Clearing user withdrawals",
                "Payouts to vendors or partners", 
                "Internal fund transfers",
                "Large-scale reconciliations"
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Eligibility */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Eligibility Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              To enable INR settlements, institutions must:
            </p>
            <div className="space-y-3">
              {eligibilityRequirements.map((requirement, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{requirement}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 mt-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                  All documents must be verified by our compliance team before settlement activation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supported Bank Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Supported Bank Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {supportedBankTypes.map((bankType, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-sm font-medium">{bankType}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Settlement Cycles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Settlement Cycles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Type</th>
                    <th className="text-left py-3 px-4 font-semibold">Cut-off Time</th>
                    <th className="text-left py-3 px-4 font-semibold">Credit Time</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementCycles.map((cycle, index) => (
                    <tr key={index} className="border-b hover:bg-secondary/30">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cycle.type}</span>
                          {cycle.badge === "fastest" && (
                            <Badge variant="default" className="text-xs">Fastest</Badge>
                          )}
                          {cycle.badge === "standard" && (
                            <Badge variant="secondary" className="text-xs">Standard</Badge>
                          )}
                          {cycle.badge === "custom" && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">{cycle.cutoff}</td>
                      <td className="py-4 px-4 text-muted-foreground">{cycle.credit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              <strong>Note:</strong> Settlement timelines may vary on weekends, bank holidays, or during system downtimes.
            </p>
          </CardContent>
        </Card>

        {/* Settlement Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Settlement Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You'll receive daily and monthly settlement reports, including:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                "UTR numbers",
                "Settlement reference IDs",
                "Gross amount, fees, and net credited amount", 
                "Status (Success / Failed / Pending)"
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              These reports can be downloaded from your Institution Dashboard or delivered via secure API/webhook integration.
            </p>
          </CardContent>
        </Card>

        {/* Security & Compliance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-6 w-6 text-primary" />
              Security & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              We follow RBI & FIU-IND guidelines for all institutional settlements:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                "PAN & GST verification",
                "KYC/AML monitoring",
                "Reconciliation audit trails",
                "256-bit encryption on all fund flow operations"
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Integration Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Integration Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">You can initiate settlements via:</p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {integrationOptions.map((option, index) => (
                <div key={index} className="text-center p-6 bg-secondary/50 rounded-lg">
                  <div className="flex justify-center mb-4 text-primary">
                    {option.icon}
                  </div>
                  <h3 className="font-semibold mb-2">{option.title}</h3>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              ))}
            </div>

            <div className="bg-primary/5 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Our API supports:</h4>
              <div className="grid md:grid-cols-3 gap-4">
                {["Batch settlements", "Callback notifications", "Real-time status check"].map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Need Assistance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-6 w-6 text-primary" />
              Need Assistance?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">For settlement-related queries or onboarding:</p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg">
                <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">settlement@blynkvirtual.com</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-lg">
                <Phone className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium">Support Line</p>
                  <p className="text-sm text-muted-foreground">+91-XXXXXXXXXX</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Support Hours: 9:00 AM – 8:00 PM IST (Mon–Sat)</span>
            </div>
          </CardContent>
        </Card>

        {/* Why Choose Us */}
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-primary" />
              Why Choose Us?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {whyChooseUs.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <div className="text-primary">{item.icon}</div>
                  <span className="text-sm font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Downloads */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-6 w-6 text-primary" />
              Documents & Forms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <Button variant="outline" className="justify-start gap-2">
                <Download className="h-4 w-4" />
                Settlement Policy PDF
              </Button>
              <Button variant="outline" className="justify-start gap-2">
                <Download className="h-4 w-4" />
                Institution Onboarding Form
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card className="border-2 border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
              Important Disclaimer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              INR Settlement services are provided only to verified institutions. Misuse, third-party routing, 
              or suspicious activity may lead to account suspension and reporting to regulatory bodies.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}