
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Calendar, Users, AlertCircle } from "lucide-react";

export function ShiftAttendanceTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="shifts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shifts">Shift Scheduling</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Tracking</TabsTrigger>
          <TabsTrigger value="overtime">Overtime Management</TabsTrigger>
          <TabsTrigger value="absence">Absence Management</TabsTrigger>
        </TabsList>

        <TabsContent value="shifts">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Shift Scheduling
                </CardTitle>
                <Button>
                  <Calendar className="h-4 w-4 mr-2" />
                  Create Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Morning Shift</h3>
                  <p className="text-sm text-gray-600">9:00 AM - 6:00 PM</p>
                  <p className="text-sm text-gray-500">12 employees assigned</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Evening Shift</h3>
                  <p className="text-sm text-gray-600">2:00 PM - 11:00 PM</p>
                  <p className="text-sm text-gray-500">8 employees assigned</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Night Shift</h3>
                  <p className="text-sm text-gray-600">10:00 PM - 7:00 AM</p>
                  <p className="text-sm text-gray-500">5 employees assigned</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Attendance Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Today's Attendance</h3>
                    <p className="text-sm text-gray-600">June 16, 2025</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">18/20</div>
                    <div className="text-sm text-gray-600">Present</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overtime">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Overtime Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No overtime records for today</p>
                <Button className="mt-4">Record Overtime</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absence">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Absence Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Absent Today</h3>
                    <p className="text-sm text-gray-600">2 employees</p>
                  </div>
                  <Badge variant="secondary">2 Absences</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
