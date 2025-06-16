
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, FileText, Phone, Clock } from "lucide-react";

export function BankingComplianceTab() {
  const [liens] = useState([
    { 
      id: "LIEN001", 
      location: "SBI Connaught Place", 
      amount: 500000, 
      type: "Fraud-related", 
      status: "Active", 
      dateImposed: "2025-05-15",
      lastUpdate: "Investigation ongoing"
    },
    { 
      id: "LIEN002", 
      location: "HDFC Sector 18", 
      amount: 250000, 
      type: "Legal-related", 
      status: "Released", 
      dateImposed: "2025-04-10",
      lastUpdate: "Court case resolved"
    },
  ]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="liens" className="space-y-4">
        <TabsList>
          <TabsTrigger value="liens">Lien Tracking</TabsTrigger>
          <TabsTrigger value="history">Case History</TabsTrigger>
          <TabsTrigger value="accounts">Account Status</TabsTrigger>
          <TabsTrigger value="communications">Bank Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="liens">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Lien Cases Tracking
                </CardTitle>
                <Button>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Report New Lien
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {liens.map((lien) => (
                  <div key={lien.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{lien.id}</h3>
                        <p className="text-sm text-gray-600">{lien.location}</p>
                      </div>
                      <Badge variant={lien.status === "Active" ? "destructive" : "default"}>
                        {lien.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Amount: </span>
                        <span className="font-medium">₹{lien.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Type: </span>
                        <span className="font-medium">{lien.type}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Date Imposed: </span>
                        <span className="font-medium">{lien.dateImposed}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Update: </span>
                        <span className="font-medium">{lien.lastUpdate}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm">View Timeline</Button>
                      <Button variant="outline" size="sm">Add Update</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Case History & Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">LIEN001 - Timeline</h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Lien imposed by SBI</p>
                        <p className="text-xs text-gray-500">May 15, 2025</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Bank contacted for clarification</p>
                        <p className="text-xs text-gray-500">May 18, 2025</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Investigation ongoing</p>
                        <p className="text-xs text-gray-500">June 16, 2025</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Bank Account Status Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="font-semibold">SBI Account - Restricted</span>
                  </div>
                  <p className="text-sm text-gray-600">Account: ****5123</p>
                  <p className="text-sm text-gray-500">Issue: Fraud investigation</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-semibold">HDFC Account - Active</span>
                  </div>
                  <p className="text-sm text-gray-600">Account: ****2301</p>
                  <p className="text-sm text-gray-500">Status: Normal operations</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Bank Communications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold">SBI Branch Manager Call</h3>
                    <span className="text-sm text-gray-500">June 14, 2025</span>
                  </div>
                  <p className="text-sm text-gray-600">Discussed lien status and provided additional documentation</p>
                  <p className="text-sm text-gray-500">Contact: Mr. Rajesh Kumar</p>
                </div>
                <Button>
                  <Phone className="h-4 w-4 mr-2" />
                  Log New Communication
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
