
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, AlertCircle, CreditCard } from "lucide-react";

interface KYCBankInfoProps {
  clientId?: string;
}

export function KYCBankInfo({ clientId }: KYCBankInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          KYC & Bank Account Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">PAN Card</span>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">Uploaded</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Aadhar Card</span>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">Uploaded</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Other Docs</span>
            <span className="text-sm text-blue-600">Passport.pdf</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">KYC Status</label>
          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 ml-2">
            Verified
          </Badge>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Linked Bank Accounts</label>
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge variant="outline" className="text-blue-600">SBI x5123</Badge>
            <Badge variant="outline" className="text-blue-600">HDFC x2301</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Pattern Mismatch</label>
            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
              ❌ No Alert
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Re-KYC Needed</label>
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              No
            </Badge>
          </div>
        </div>

        <Button size="sm" variant="outline" className="w-full">
          <CreditCard className="h-4 w-4 mr-2" />
          Manage KYC Documents
        </Button>
      </CardContent>
    </Card>
  );
}
