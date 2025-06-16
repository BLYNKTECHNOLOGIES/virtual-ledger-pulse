
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { History, Search, Download, Filter } from "lucide-react";

const orderHistory = [
  {
    orderId: "#ORD1023",
    date: "01 June 2025",
    type: "Buy",
    amount: "₹35,000",
    status: "Completed",
    statusColor: "text-green-700 bg-green-100 border-green-300"
  },
  {
    orderId: "#ORD1024",
    date: "03 June 2025",
    type: "Sell",
    amount: "₹28,000",
    status: "Completed",
    statusColor: "text-green-700 bg-green-100 border-green-300"
  },
  {
    orderId: "#ORD1025",
    date: "06 June 2025",
    type: "Buy",
    amount: "₹85,000",
    status: "Cosmos Alert ⚠️",
    statusColor: "text-red-700 bg-red-100 border-red-300"
  },
  {
    orderId: "#ORD1026",
    date: "08 June 2025",
    type: "Buy",
    amount: "₹42,000",
    status: "Completed",
    statusColor: "text-green-700 bg-green-100 border-green-300"
  },
  {
    orderId: "#ORD1027",
    date: "10 June 2025",
    type: "Sell",
    amount: "₹31,500",
    status: "Processing",
    statusColor: "text-yellow-700 bg-yellow-100 border-yellow-300"
  }
];

export function OrderHistoryModule() {
  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-gray-50 to-blue-50">
      <CardHeader className="bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History Module
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input 
                placeholder="Search orders..." 
                className="pl-10 w-48 bg-white/90 border-gray-300"
              />
            </div>
            <Button size="sm" variant="outline" className="bg-white/90 text-gray-700 border-gray-300 hover:bg-white">
              <Filter className="h-4 w-4 mr-1" />
              Filter
            </Button>
            <Button size="sm" variant="outline" className="bg-white/90 text-gray-700 border-gray-300 hover:bg-white">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold text-gray-700">Order ID</TableHead>
                <TableHead className="font-semibold text-gray-700">Date</TableHead>
                <TableHead className="font-semibold text-gray-700">Type</TableHead>
                <TableHead className="font-semibold text-gray-700">Amount</TableHead>
                <TableHead className="font-semibold text-gray-700">Status</TableHead>
                <TableHead className="font-semibold text-gray-700">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderHistory.map((order, index) => (
                <TableRow key={index} className="hover:bg-blue-50/50 border-b border-gray-100">
                  <TableCell className="font-medium text-blue-600 font-mono">
                    {order.orderId}
                  </TableCell>
                  <TableCell className="text-gray-700">{order.date}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={order.type === 'Buy' ? 'text-green-700 bg-green-100 border-green-300' : 'text-red-700 bg-red-100 border-red-300'}
                    >
                      {order.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-gray-800">{order.amount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={order.statusColor}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="text-blue-600 hover:bg-blue-50">
                      View Details
                    </Button>
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
