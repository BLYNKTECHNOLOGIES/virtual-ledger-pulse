import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Shield, CheckCircle, Star, Heart } from 'lucide-react';

interface FIUTrustBannerProps {
  variant?: 'compact' | 'full' | 'hero';
  className?: string;
}

export function FIUTrustBanner({ variant = 'compact', className = '' }: FIUTrustBannerProps) {
  if (variant === 'hero') {
    return (
      <div className={`inline-flex items-center gap-3 bg-gradient-to-r from-blue-50 to-green-50 px-6 py-3 rounded-full text-sm border border-blue-200 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-blue-600 font-semibold">🔒 FIU-IND Registered</span>
          <span className="text-gray-600">•</span>
          <span className="text-green-600 font-medium">VA00293094</span>
        </div>
        <div className="h-4 w-px bg-gray-300"></div>
        <span className="text-gray-600">Trade with Confidence</span>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <Card className={`p-6 bg-gradient-to-r from-blue-50 via-white to-green-50 border-blue-200 ${className}`}>
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Star className="h-5 w-5 text-yellow-500 fill-current" />
            <span className="text-lg font-bold text-foreground">Trust. Transparency. Security.</span>
            <Star className="h-5 w-5 text-yellow-500 fill-current" />
          </div>
          
          <p className="text-muted-foreground">
            At Blynk Virtual Technologies Pvt Ltd, your trust is our biggest asset. 💙
          </p>
          
          <div className="bg-blue-100 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-foreground">FIU Registration Number: VA00293094</span>
            </div>
            <p className="text-sm text-muted-foreground">
              We are officially registered with the Financial Intelligence Unit – India (FIU-IND), 
              ensuring complete compliance with the highest standards of AML and KYC regulations.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">This means every transaction on Blynk is:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Safe – monitored under strict compliance</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Transparent – in line with India's financial laws</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Reliable – backed by global AML best practices</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-4">
            <Heart className="h-4 w-4 text-red-500 fill-current" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Blynk Virtual Technologies Pvt Ltd</strong> – Your Trusted, FIU-Registered Crypto Partner.
            </p>
            <Heart className="h-4 w-4 text-red-500 fill-current" />
          </div>
        </div>
      </Card>
    );
  }

  // Default compact variant
  return (
    <div className={`flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-full text-xs border border-blue-200 dark:border-blue-800 ${className}`}>
      <Shield className="h-3 w-3 text-blue-600" />
      <span className="font-medium text-foreground">FIU-IND Registered</span>
      <span className="text-muted-foreground">•</span>
      <span className="text-green-600 font-medium">VA00293094</span>
    </div>
  );
}