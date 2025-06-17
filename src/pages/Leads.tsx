
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, Phone, Mail, UserPlus } from "lucide-react";

// Mock data for leads
const mockLeads = [
  {
    id: 1,
    name: "Rahul Sharma",
    email: "rahul.sharma@example.com",
    phone: "+91 9876543210",
    company: "Tech Solutions Pvt Ltd",
    status: "Hot",
    source: "Website",
    value: 250000,
    createdDate: "2025-06-15"
  },
  {
    id: 2,
    name: "Priya Patel",
    email: "priya.patel@example.com",
    phone: "+91 9876543211",
    company: "Digital Marketing Co",
    status: "Warm",
    source: "Referral",
    value: 150000,
    createdDate: "2025-06-14"
  },
  {
    id: 3,
    name: "Amit Kumar",
    email: "amit.kumar@example.com",
    phone: "+91 9876543212",
    company: "Trading House",
    status: "Cold",
    source: "Social Media",
    value: 100000,
    createdDate: "2025-06-13"
  }
];

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All Leads");

  const filteredLeads = mockLeads.filter(lead =>
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Hot":
        return <Badge className="bg-red-100 text-red-800">Hot</Badge>;
      case "Warm":
        return <Badge className="bg-yellow-100 text-yellow-800">Warm</Badge>;
      case "Cold":
        return <Badge className="bg-blue-100 text-blue-800">Cold</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Leads Management</h1>
        <p className="text-gray-600 mt-1">Manage and track your sales leads</p>
      </div>

      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Leads</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Today
              </Button>
              <Button variant="outline" size="sm">
                This Week
              </Button>
              <Button variant="outline" size="sm">
                This Month
              </Button>
              <Button variant="outline" size="sm">
                Last Month
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                {filterStatus}
              </Button>
              <Button variant="outline" size="sm">
                🔄 Refresh
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                <UserPlus className="h-4 w-4 mr-2" />
                New Lead
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLeads.map((lead) => (
          <Card key={lead.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                  {getStatusBadge(lead.status)}
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">{lead.company}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {lead.email}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </p>
                  <p className="text-sm font-medium text-green-600">
                    Est. Value: ₹{lead.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Source: {lead.source}</p>
                  <p className="text-xs text-gray-500">Created: {lead.createdDate}</p>
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2">
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:text-red-700">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLeads.length === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              No leads found matching your search criteria.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
