import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CryptoFeesPage() {
  const depositWithdrawalData = [
    {
      type: 'Fiat - INR',
      deposit: '0%',
      withdrawal: '0% to 1% + 1% TDS'
    },
    {
      type: 'Crypto',
      deposit: '0%',
      withdrawal: '2% (minimum $0.5)'
    }
  ];

  const spotTradingData = [
    {
      tier: 0,
      threshold: '<₹1.5L',
      fee: '0.45%'
    },
    {
      tier: 1,
      threshold: '₹1.5L – ₹7.5L',
      fee: '0.42%'
    },
    {
      tier: 2,
      threshold: '₹7.5L – ₹56L',
      fee: '0.25%'
    },
    {
      tier: 3,
      threshold: '₹56L – ₹3.7Cr',
      fee: '0.22%'
    },
    {
      tier: 4,
      threshold: '₹3.7Cr – ₹15Cr',
      fee: '0.17%'
    },
    {
      tier: 5,
      threshold: '₹15Cr – ₹37Cr',
      fee: '0.15%'
    },
    {
      tier: 6,
      threshold: '>₹37Cr',
      fee: '0.12%'
    }
  ];

  const futuresTradingData = [
    {
      tier: 0,
      threshold: '<₹37L',
      fee: '0.05%'
    },
    {
      tier: 1,
      threshold: '₹37L – ₹1.5Cr',
      fee: '0.048%'
    },
    {
      tier: 2,
      threshold: '₹1.5Cr – ₹3.7Cr',
      fee: '0.0465%'
    },
    {
      tier: 3,
      threshold: '₹3.7Cr – ₹15Cr',
      fee: '0.045%'
    },
    {
      tier: 4,
      threshold: '₹15Cr – ₹37Cr',
      fee: '0.040%'
    },
    {
      tier: 5,
      threshold: '₹37Cr – ₹187Cr',
      fee: '0.035%'
    },
    {
      tier: 6,
      threshold: '>₹187Cr',
      fee: '0.030%'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Breadcrumb */}
        <div className="mb-8">
          <nav className="flex" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-3">
              <li className="inline-flex items-center">
                <span className="text-muted-foreground">Home</span>
              </li>
              <li>
                <div className="flex items-center">
                  <span className="mx-2 text-muted-foreground">/</span>
                  <span className="text-foreground">Fee and Compliance</span>
                </div>
              </li>
            </ol>
          </nav>
        </div>

        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Know what you're paying
          </h1>
          <p className="text-xl text-muted-foreground">
            Explore our fee structure
          </p>
        </div>

        {/* Deposit & Withdrawal Section */}
        <div className="mb-16">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">Deposit & Withdrawal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Type</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Deposit</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Withdrawal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositWithdrawalData.map((row, index) => (
                      <tr key={index} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-medium text-foreground">{row.type}</td>
                        <td className="py-4 px-6 text-green-600 font-semibold">{row.deposit}</td>
                        <td className="py-4 px-6 text-muted-foreground">{row.withdrawal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Spot Trading Section */}
        <div className="mb-16">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">Spot Trading</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Tier</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Spot Trading Volume Threshold</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Spot Trading Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spotTradingData.map((row, index) => (
                      <tr key={index} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-medium text-foreground">{row.tier}</td>
                        <td className="py-4 px-6 text-muted-foreground">{row.threshold}</td>
                        <td className="py-4 px-6 text-primary font-semibold">{row.fee}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Futures Trading Section */}
        <div className="mb-16">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">Futures Trading</CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Buy (Long)</h4>
                  <p className="text-primary font-semibold">0.03% to 0.05%</p>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Sell (Short)</h4>
                  <p className="text-primary font-semibold">0.03% to 0.05%</p>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Funding Fees</h4>
                  <p className="text-primary font-semibold">Dynamic</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Tier</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Futures Trading Volume Threshold</th>
                      <th className="text-left py-4 px-6 font-semibold text-foreground">Futures Trading Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {futuresTradingData.map((row, index) => (
                      <tr key={index} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 font-medium text-foreground">{row.tier}</td>
                        <td className="py-4 px-6 text-muted-foreground">{row.threshold}</td>
                        <td className="py-4 px-6 text-primary font-semibold">{row.fee}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Services Section */}
        <div className="mb-16">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">Portfolio & Investment Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
                  <h4 className="font-semibold text-foreground mb-2">Crypto Sets</h4>
                  <p className="text-sm text-muted-foreground mb-3">Diversified crypto portfolios</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Invest:</span>
                      <span className="text-sm font-semibold text-green-600">No Fees</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Redeem:</span>
                      <span className="text-sm font-semibold text-green-600">No Fees</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Rebalancing:</span>
                      <span className="text-sm font-semibold text-green-600">No Fees</span>
                    </div>
                  </div>
                </div>

                <div className="text-center p-6 bg-gradient-to-br from-secondary/10 to-secondary/5 rounded-xl">
                  <h4 className="font-semibold text-foreground mb-2">SIP & DCA</h4>
                  <p className="text-sm text-muted-foreground mb-3">Systematic investment plans</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Setup Fee:</span>
                      <span className="text-sm font-semibold text-green-600">Free</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Monthly Fee:</span>
                      <span className="text-sm font-semibold text-green-600">Free</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Exit Fee:</span>
                      <span className="text-sm font-semibold text-green-600">Free</span>
                    </div>
                  </div>
                </div>

                <div className="text-center p-6 bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl">
                  <h4 className="font-semibold text-foreground mb-2">Premium Features</h4>
                  <p className="text-sm text-muted-foreground mb-3">Advanced trading tools</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">API Access:</span>
                      <span className="text-sm font-semibold text-primary">₹999/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Analytics:</span>
                      <span className="text-sm font-semibold text-green-600">Free</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Priority Support:</span>
                      <span className="text-sm font-semibold text-primary">₹499/month</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Note */}
        <div className="text-center text-sm text-muted-foreground">
          <p className="mb-2">* All fees are subject to change based on market conditions and regulatory requirements.</p>
          <p>** TDS (Tax Deducted at Source) is applicable as per Indian tax regulations.</p>
        </div>
      </div>
    </div>
  );
}