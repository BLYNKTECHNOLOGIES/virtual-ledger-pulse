
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, Phone, Mail, Calendar } from "lucide-react";

export function PurposeCommunication() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          Purpose & Communication
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Purpose of Buying</label>
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 ml-2">
            Investment
          </Badge>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-600">Contact Details</label>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>+91 9876543210</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>john@example.com</span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Operator Notes</label>
          <div className="bg-gray-50 p-3 rounded-lg mt-1">
            <p className="text-sm">High Value Lead, Asked for support on UPI</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Next Follow-up</label>
          <div className="flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="text-sm">18 June 2025</span>
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              Alert Set
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline">
            <MessageCircle className="h-4 w-4 mr-1" />
            Add Note
          </Button>
          <Button size="sm" variant="outline">
            Communication Log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
