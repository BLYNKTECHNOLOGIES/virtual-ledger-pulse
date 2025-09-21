import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

export function SellUSDTPage() {
  const [usdtAmount, setUsdtAmount] = useState('1');
  const [inrAmount, setInrAmount] = useState('');
  const [currentRate] = useState(95.5); // Current selling rate

  useEffect(() => {
    if (usdtAmount) {
      const inr = (parseFloat(usdtAmount) * currentRate).toFixed(2);
      setInrAmount(inr);
    } else {
      setInrAmount('');
    }
  }, [usdtAmount, currentRate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-muted rounded-full p-1">
            <button className="px-12 py-3 rounded-full bg-primary text-primary-foreground font-medium">
              Crypto To Fiat
            </button>
          </div>
        </div>

        {/* Main Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">USDT to INR</h1>
          <p className="text-muted-foreground">Sell Tether USDt (USDT) and get Indian Rupee (INR)</p>
        </div>

        {/* Main Converter Card */}
        <div className="max-w-lg mx-auto">
          <Card className="shadow-xl border-0 bg-card rounded-3xl overflow-hidden">
            <CardContent className="p-8">
              {/* From Input - USDT */}
              <div className="mb-6">
                <label className="text-sm text-muted-foreground mb-2 block">quantity to sell</label>
                <div className="flex items-center bg-muted/50 rounded-2xl p-4">
                  <Input
                    type="number"
                    value={usdtAmount}
                    onChange={(e) => setUsdtAmount(e.target.value)}
                    className="border-0 bg-transparent text-2xl font-semibold h-auto p-0 focus-visible:ring-0"
                    placeholder="1"
                  />
                  <div className="flex items-center gap-2 ml-4">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">₮</span>
                    </div>
                    <span className="font-semibold">USDT</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* To Input - INR */}
              <div className="mb-6">
                <label className="text-sm text-muted-foreground mb-2 block">you will receive</label>
                <div className="flex items-center bg-muted/50 rounded-2xl p-4">
                  <Input
                    type="text"
                    value={inrAmount}
                    readOnly
                    className="border-0 bg-transparent text-2xl font-semibold h-auto p-0 focus-visible:ring-0"
                    placeholder="0.00"
                  />
                  <div className="flex items-center gap-2 ml-4">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">₹</span>
                    </div>
                    <span className="font-semibold">INR</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Live Rate */}
              <div className="text-center mb-6">
                <p className="text-sm text-muted-foreground mb-1">Updated today - Sep 21, 2025 at 11:30 PM</p>
                <p className="font-semibold text-foreground">1 Tether USDT = ₹{currentRate.toFixed(2)} INR</p>
              </div>

              {/* Sell Button */}
              <Button 
                className="w-full py-4 text-lg font-semibold rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                size="lg"
              >
                Sell USDT
              </Button>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              The current selling rate of 1 USDT is ₹{currentRate.toFixed(2)} INR. Blynk provides you the best USDT to INR conversion rates with instant settlement.
            </p>
          </div>

          {/* What is section */}
          <div className="text-center mt-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">Sell 1 USDT for INR today</h2>
            <p className="text-muted-foreground">
              1 Tether USDT (USDT) can be sold for ₹{currentRate.toFixed(2)} Indian Rupee(INR) as of Sep 21, 2025 11:30 PM
            </p>
          </div>

          {/* Conversion Examples */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">₮</span>
                </div>
                <span className="font-semibold">1 USDT</span>
              </div>
              <div className="text-2xl font-bold text-foreground">₹{currentRate.toFixed(2)}</div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">₮</span>
                </div>
                <span className="font-semibold">100 USDT</span>
              </div>
              <div className="text-2xl font-bold text-foreground">₹{(100 * currentRate).toFixed(0)}</div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mt-12 space-y-4">
            <h3 className="text-xl font-bold text-foreground text-center mb-6">Why Sell USDT with Blynk?</h3>
            <div className="grid gap-4">
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <div>
                  <div className="font-semibold text-foreground">Instant Settlement</div>
                  <div className="text-sm text-muted-foreground">Get INR in your bank account within minutes</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">₹</span>
                </div>
                <div>
                  <div className="font-semibold text-foreground">Best Rates</div>
                  <div className="text-sm text-muted-foreground">Competitive selling rates with transparent pricing</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">🛡</span>
                </div>
                <div>
                  <div className="font-semibold text-foreground">Secure & Compliant</div>
                  <div className="text-sm text-muted-foreground">100% regulated and KYC verified platform</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}