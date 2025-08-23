import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

export function BuyUSDTPage() {
  const [inrAmount, setInrAmount] = useState('1');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [currentRate] = useState(89.69);

  useEffect(() => {
    if (inrAmount) {
      const usdt = (parseFloat(inrAmount) / currentRate).toFixed(6);
      setUsdtAmount(usdt);
    } else {
      setUsdtAmount('');
    }
  }, [inrAmount, currentRate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-muted rounded-full p-1">
            <button className="px-8 py-2 rounded-full bg-primary text-primary-foreground font-medium">
              Crypto To Fiat
            </button>
            <button className="px-8 py-2 rounded-full text-muted-foreground font-medium">
              Crypto to Crypto
            </button>
          </div>
        </div>

        {/* Main Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">USDT to INR</h1>
          <p className="text-muted-foreground">Convert Tether USDt (USDT) to Indian Rupee (INR)</p>
        </div>

        {/* Main Converter Card */}
        <div className="max-w-lg mx-auto">
          <Card className="shadow-xl border-0 bg-card rounded-3xl overflow-hidden">
            <CardContent className="p-8">
              {/* From Input */}
              <div className="mb-6">
                <label className="text-sm text-muted-foreground mb-2 block">quantity</label>
                <div className="flex items-center bg-muted/50 rounded-2xl p-4">
                  <Input
                    type="number"
                    value={inrAmount}
                    onChange={(e) => setInrAmount(e.target.value)}
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

              {/* To Input */}
              <div className="mb-6">
                <label className="text-sm text-muted-foreground mb-2 block">price</label>
                <div className="flex items-center bg-muted/50 rounded-2xl p-4">
                  <Input
                    type="text"
                    value={currentRate.toFixed(2)}
                    readOnly
                    className="border-0 bg-transparent text-2xl font-semibold h-auto p-0 focus-visible:ring-0"
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
                <p className="text-sm text-muted-foreground mb-1">As of Aug 23, 2025 at 08:38 PM</p>
                <p className="font-semibold text-foreground">1 Tether USDT = {currentRate.toFixed(2)} INR</p>
              </div>

              {/* Buy Button */}
              <Button 
                className="w-full py-4 text-lg font-semibold rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                size="lg"
              >
                Buy USDT
              </Button>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              The current price of 1 USDT is ₹{currentRate.toFixed(2)} INR. Mudrex provides you the best USDT to INR conversion rates in real time.
            </p>
          </div>

          {/* What is section */}
          <div className="text-center mt-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">What is 1 USDT to INR today?</h2>
            <p className="text-muted-foreground">
              1 Tether USDT (USDT) is ₹{currentRate.toFixed(2)} Indian Rupee(INR) as of Aug 23, 2025 08:38 PM
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
                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">₹</span>
                </div>
                <span className="font-semibold">₹{currentRate.toFixed(0)} INR</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{(100 / currentRate).toFixed(3)} USDT</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}