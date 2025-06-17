
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Calendar, Users, AlertCircle, Edit, Trash2 } from "lucide-react";
import { ShiftManagementDialog } from "./ShiftManagementDialog";
import { OvertimeRecordDialog } from "./OvertimeRecordDialog";

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  employeeCount: number;
}

export function ShiftAttendanceTab() {
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [showOvertimeDialog, setShowOvertimeDialog] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Mock data for shifts
  const shifts: Shift[] = [
    { id: '1', name: 'Morning Shift', startTime: '09:00', endTime: '18:00', employeeCount: 12 },
    { id: '2', name: 'Evening Shift', startTime: '14:00', endTime: '23:00', employeeCount: 8 },
    { id: '3', name: 'Night Shift', startTime: '22:00', endTime: '07:00', employeeCount: 5 },
  ];

  const handleCreateShift = () => {
    setSelectedShift(null);
    setIsEditMode(false);
    setShowShiftDialog(true);
  };

  const handleEditShift = (shift: Shift) => {
    setSelectedShift(shift);
    setIsEditMode(true);
    setShowShiftDialog(true);
  };

  const handleDeleteShift = (shift: Shift) => {
    // For demo purposes, just show an alert
    alert(`Delete shift: ${shift.name}`);
  };

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
                <Button onClick={handleCreateShift}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Create Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shifts.map((shift) => (
                  <div key={shift.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{shift.name}</h3>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditShift(shift)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDeleteShift(shift)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{shift.startTime} - {shift.endTime}</p>
                    <p className="text-sm text-gray-500">{shift.employeeCount} employees assigned</p>
                  </div>
                ))}
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
                <Button className="mt-4" onClick={() => setShowOvertimeDialog(true)}>
                  Record Overtime
                </Button>
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

      <ShiftManagementDialog
        open={showShiftDialog}
        onOpenChange={setShowShiftDialog}
        shift={selectedShift}
        isEditMode={isEditMode}
      />

      <OvertimeRecordDialog
        open={showOvertimeDialog}
        onOpenChange={setShowOvertimeDialog}
      />
    </div>
  );
}
