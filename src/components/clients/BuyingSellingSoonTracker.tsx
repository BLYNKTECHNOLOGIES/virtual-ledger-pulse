
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Phone, MessageCircle } from "lucide-react";

const buyingSellingSoonData = [
  {
    clientName: "John Doe",
    lastInteraction: "10 June 2025",
    intent: "Buying Soon",
    assignedOperator: "Ravi Sharma",
    followupAction: "Reminder on 14th",
    intentColor: "text-green-600 bg-green-50 border-green-200"
  },
  {
    clientName: "Sara Ali",
    lastInteraction: "09 June 2025",
    intent: "Selling Soon",
    assignedOperator: "Kavita Mehta",
    followupAction: "Call Scheduled",
    intentColor: "text-blue-600 bg-blue-50 border-blue-200"
  },
  {
    clientName: "Raj Kumar",
    lastInteraction: "11 June 2025",
    intent: "Buying Soon",
    assignedOperator: "Amit Singh",
    followupAction: "WhatsApp sent",
    intentColor: "text-green-600 bg-green-50 border-green-200"
  },
  {
    clientName: "Priya Patel",
    lastInteraction: "08 June 2025",
    intent: "Selling Soon",
    assignedOperator: "Ravi Sharma",
    followupAction: "Meeting today",
    intentColor: "text-blue-600 bg-blue-50 border-blue-200"
  }
];

export function BuyingSellingSoonTracker() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-600" />
          Buying/Selling Soon Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Last Interaction</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Assigned Operator</TableHead>
                <TableHead>Follow-up Action</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyingSellingSoonData.map((client, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{client.clientName}</TableCell>
                  <TableCell>{client.lastInteraction}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={client.intentColor}>
                      {client.intent}
                    </Badge>
                  </TableCell>
                  <TableCell>{client.assignedOperator}</TableCell>
                  <TableCell>{client.followupAction}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
