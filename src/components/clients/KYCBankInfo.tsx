
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, AlertCircle, CreditCard, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface KYCBankInfoProps {
  clientId?: string;
}

export function KYCBankInfo({ clientId }: KYCBankInfoProps) {
  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('client_id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const handleViewDocument = (url: string, docType: string) => {
    if (url) {
      window.open(url, '_blank');
    } else {
      console.log(`No ${docType} document found`);
    }
  };

  const getStatusIcon = (hasDoc: boolean) => {
    return hasDoc ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-600" />
    );
  };

  const getStatusText = (hasDoc: boolean) => {
    return hasDoc ? "Uploaded" : "Not Uploaded";
  };

  const getStatusColor = (hasDoc: boolean) => {
    return hasDoc ? "text-green-600" : "text-red-600";
  };

  const getBankAccountBadges = () => {
    if (!client?.linked_bank_accounts) return [];
    
    try {
      let accounts;
      if (Array.isArray(client.linked_bank_accounts)) {
        accounts = client.linked_bank_accounts;
      } else if (typeof client.linked_bank_accounts === 'string') {
        accounts = JSON.parse(client.linked_bank_accounts);
      } else if (typeof client.linked_bank_accounts === 'object') {
        accounts = client.linked_bank_accounts;
      } else {
        return [];
      }
      
      return accounts.map((account: any, index: number) => (
        <Badge key={index} variant="outline" className="text-blue-600">
          {account.bankName} x{account.lastFourDigits}
        </Badge>
      ));
    } catch (error) {
      console.error('Error parsing linked bank accounts:', error);
      return [];
    }
  };

  const getKYCStatusBadge = () => {
    const status = client?.kyc_status || 'PENDING';
    const isVerified = status === 'VERIFIED';
    
    return (
      <Badge 
        variant="outline" 
        className={isVerified 
          ? "text-green-600 border-green-200 bg-green-50" 
          : "text-yellow-600 border-yellow-200 bg-yellow-50"
        }
      >
        {status}
      </Badge>
    );
  };

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            KYC & Bank Account Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No client data available</p>
        </CardContent>
      </Card>
    );
  }

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
              {getStatusIcon(!!client.pan_card_url)}
              <button
                onClick={() => handleViewDocument(client.pan_card_url, 'PAN Card')}
                className={`text-sm ${getStatusColor(!!client.pan_card_url)} hover:underline flex items-center gap-1`}
                disabled={!client.pan_card_url}
              >
                {getStatusText(!!client.pan_card_url)}
                {client.pan_card_url && <ExternalLink className="h-3 w-3" />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Aadhar Card</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(!!client.aadhar_front_url || !!client.aadhar_back_url)}
              <div className="flex gap-2">
                {client.aadhar_front_url && (
                  <button
                    onClick={() => handleViewDocument(client.aadhar_front_url, 'Aadhar Front')}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Front <ExternalLink className="h-3 w-3" />
                  </button>
                )}
                {client.aadhar_back_url && (
                  <button
                    onClick={() => handleViewDocument(client.aadhar_back_url, 'Aadhar Back')}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Back <ExternalLink className="h-3 w-3" />
                  </button>
                )}
                {!client.aadhar_front_url && !client.aadhar_back_url && (
                  <span className="text-sm text-red-600">Not Uploaded</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Other Docs</span>
            <div className="flex flex-wrap gap-2">
              {client.other_documents_urls && client.other_documents_urls.length > 0 ? (
                client.other_documents_urls.map((url: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => handleViewDocument(url, `Document ${index + 1}`)}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Doc {index + 1} <ExternalLink className="h-3 w-3" />
                  </button>
                ))
              ) : (
                <span className="text-sm text-gray-500">No additional documents</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">KYC Status</label>
          <div className="ml-2 inline-block">
            {getKYCStatusBadge()}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Linked Bank Accounts</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {getBankAccountBadges().length > 0 ? (
              getBankAccountBadges()
            ) : (
              <span className="text-sm text-gray-500">No linked bank accounts</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Pattern Mismatch</label>
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              ✅ No Alert
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
