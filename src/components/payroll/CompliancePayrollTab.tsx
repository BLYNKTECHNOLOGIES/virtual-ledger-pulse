
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, FileText, AlertTriangle, BarChart3 } from "lucide-react";

export function CompliancePayrollTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="pf" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pf">Provident Fund (PF)</TabsTrigger>
          <TabsTrigger value="esic">ESIC Management</TabsTrigger>
          <TabsTrigger value="reports">Compliance Reports</TabsTrigger>
          <TabsTrigger value="dashboard">Status Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="pf">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Provident Fund Management
                </CardTitle>
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate PF Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">₹1,80,000</div>
                    <div className="text-sm text-gray-600">Employee Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">₹2,16,000</div>
                    <div className="text-sm text-gray-600">Employer Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">₹3,96,000</div>
                    <div className="text-sm text-gray-600">Total Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">18</div>
                    <div className="text-sm text-gray-600">Active Members</div>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Recent PF Contributions</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">May 2025</span>
                      <span className="text-sm font-medium">₹3,96,000</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">April 2025</span>
                      <span className="text-sm font-medium">₹3,84,000</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="esic">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  ESIC Management
                </CardTitle>
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate ESIC Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">₹22,500</div>
                    <div className="text-sm text-gray-600">Employee Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">₹67,500</div>
                    <div className="text-sm text-gray-600">Employer Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">₹90,000</div>
                    <div className="text-sm text-gray-600">Total Contribution</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">15</div>
                    <div className="text-sm text-gray-600">ESIC Members</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Compliance Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">Monthly PF Return</h3>
                      <p className="text-sm text-gray-600">Due: June 25, 2025</p>
                    </div>
                    <Badge variant="secondary">Due Soon</Badge>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">ESIC Monthly Return</h3>
                      <p className="text-sm text-gray-600">Due: June 21, 2025</p>
                    </div>
                    <Badge variant="secondary">Due Soon</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Compliance Status Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-green-50">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-semibold text-green-800">PF Compliance - Up to Date</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">All contributions filed on time</p>
                </div>
                <div className="p-4 border rounded-lg bg-yellow-50">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="font-semibold text-yellow-800">ESIC Return - Due Soon</span>
                  </div>
                  <p className="text-sm text-yellow-600 mt-1">Due in 5 days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
