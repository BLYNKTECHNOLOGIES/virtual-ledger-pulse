import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, CreditCard, Building, Clock, Shield, DollarSign, Zap, CheckCircle } from 'lucide-react';

export function BuyUSDTPage() {
  const [inrAmount, setInrAmount] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [currentRate] = useState(89.69); // Mock rate

  useEffect(() => {
    if (inrAmount) {
      const usdt = (parseFloat(inrAmount) / currentRate).toFixed(2);
      setUsdtAmount(usdt);
    } else {
      setUsdtAmount('');
    }
  }, [inrAmount, currentRate]);

  const sampleConversions = [
    { inr: 100, usdt: (100 / currentRate).toFixed(2) },
    { inr: 500, usdt: (500 / currentRate).toFixed(2) },
    { inr: 1000, usdt: (1000 / currentRate).toFixed(2) },
    { inr: 5000, usdt: (5000 / currentRate).toFixed(2) },
  ];

  const benefits = [
    { icon: Clock, title: 'Real-time Rates', description: 'Live market prices with no slippage surprises' },
    { icon: DollarSign, title: 'Low Fees', description: 'Zero transaction fee on UPI starting ₹500' },
    { icon: Zap, title: 'Instant Settlement', description: 'USDT credited to your wallet immediately' },
    { icon: Shield, title: 'Secure & Compliant', description: 'Fully regulated and KYC compliant platform' },
  ];

  const steps = [
    { number: '1', title: 'Enter Amount', description: 'Input INR amount and view equivalent USDT' },
    { number: '2', title: 'Choose Payment', description: 'Select your preferred payment method' },
    { number: '3', title: 'Confirm & Pay', description: 'Complete secure payment process' },
    { number: '4', title: 'Receive USDT', description: 'USDT credited to your wallet instantly' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Buy USDT with INR
          </h1>
          <p className="text-xl text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Instant
            </span>
            <span className="mx-2">•</span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              Transparent
            </span>
            <span className="mx-2">•</span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-purple-500" />
              Secure
            </span>
          </p>
        </div>

        {/* Main Conversion Card */}
        <Card className="mb-8 shadow-xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold text-foreground">Live Rate & Conversion</CardTitle>
            <div className="text-lg font-semibold text-primary">
              1 USDT = ₹{currentRate.toFixed(2)}
              <Badge variant="secondary" className="ml-2">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">You Pay (INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={inrAmount}
                    onChange={(e) => setInrAmount(e.target.value)}
                    className="pl-8 text-lg h-12"
                    min="100"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">You Get (USDT)</label>
                <div className="relative">
                  <Input
                    type="text"
                    value={usdtAmount}
                    readOnly
                    className="text-lg h-12 bg-muted/50"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">USDT</span>
                </div>
              </div>
            </div>

            {/* Sample Conversions */}
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-medium text-foreground mb-3">Quick Conversions:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sampleConversions.map((conversion, index) => (
                  <div
                    key={index}
                    className="text-center p-3 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setInrAmount(conversion.inr.toString())}
                  >
                    <div className="font-semibold text-foreground">₹{conversion.inr}</div>
                    <div className="text-sm text-muted-foreground">↓</div>
                    <div className="text-sm font-medium text-primary">{conversion.usdt} USDT</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Options */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-foreground">Payment Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg hover:bg-muted/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <Smartphone className="h-6 w-6 text-green-500" />
                  <span className="font-medium text-foreground">UPI</span>
                  <Badge variant="secondary" className="text-xs">Zero Fee ₹500+</Badge>
                </div>
                <p className="text-sm text-muted-foreground">GPay • PhonePe • Paytm • UPI</p>
              </div>
              
              <div className="p-4 border rounded-lg hover:bg-muted/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <Building className="h-6 w-6 text-blue-500" />
                  <span className="font-medium text-foreground">Bank Transfer</span>
                </div>
                <p className="text-sm text-muted-foreground">IMPS • NEFT • RTGS</p>
              </div>
              
              <div className="p-4 border rounded-lg hover:bg-muted/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard className="h-6 w-6 text-purple-500" />
                  <span className="font-medium text-foreground">Cards</span>
                </div>
                <p className="text-sm text-muted-foreground">Debit Card • Credit Card</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Benefits Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {benefits.map((benefit, index) => (
            <Card key={index} className="text-center shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <benefit.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* How It Works */}
        <Card className="mb-8 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-foreground">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {steps.map((step, index) => (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">
                    {step.number}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="text-center mb-8">
          <Button 
            size="lg" 
            className="px-12 py-6 text-lg font-semibold"
            disabled={!inrAmount || parseFloat(inrAmount) < 100}
          >
            Buy USDT
          </Button>
          {inrAmount && parseFloat(inrAmount) < 100 && (
            <p className="text-sm text-muted-foreground mt-2">Minimum amount: ₹100</p>
          )}
        </div>

        {/* FAQ Section */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-foreground">Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-b pb-4">
              <h4 className="font-medium text-foreground mb-1">Can I buy with ₹100?</h4>
              <p className="text-sm text-muted-foreground">Yes, minimum ₹100 is supported for USDT purchases.</p>
            </div>
            <div className="border-b pb-4">
              <h4 className="font-medium text-foreground mb-1">Is it legal in India?</h4>
              <p className="text-sm text-muted-foreground">Yes, crypto purchases are legal and compliant with Indian regulations.</p>
            </div>
            <div className="border-b pb-4">
              <h4 className="font-medium text-foreground mb-1">How long does it take?</h4>
              <p className="text-sm text-muted-foreground">USDT is credited instantly upon successful payment confirmation.</p>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">Are there any fees?</h4>
              <p className="text-sm text-muted-foreground">Zero transaction fee on UPI payments for orders ₹500 and above.</p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>Need help? <span className="text-primary cursor-pointer hover:underline">Contact Support</span></p>
          <p className="mt-1">Crypto purchases are subject to standard KYC and applicable tax regulations.</p>
        </div>
      </div>
    </div>
  );
}