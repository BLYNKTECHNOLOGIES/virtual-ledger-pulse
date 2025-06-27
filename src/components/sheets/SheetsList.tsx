
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, Calendar, User, MoreHorizontal, 
  Download, Share2, Copy, Trash2, Edit3 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SheetsListProps {
  searchQuery: string;
  onOpenSheet: (sheet: any) => void;
}

export function SheetsList({ searchQuery, onOpenSheet }: SheetsListProps) {
  const [sheets, setSheets] = useState([
    {
      id: 1,
      name: 'Monthly Budget 2024',
      description: 'Company budget tracking for 2024',
      lastModified: new Date(2024, 0, 15),
      createdBy: 'John Doe',
      size: '2.5 MB',
      type: 'Budget',
      isShared: true,
      collaborators: 3
    },
    {
      id: 2,
      name: 'Employee Attendance',
      description: 'Team attendance tracker',
      lastModified: new Date(2024, 0, 10),
      createdBy: 'Jane Smith',
      size: '1.2 MB',
      type: 'HR',
      isShared: false,
      collaborators: 1
    },
    {
      id: 3,
      name: 'KYC Data Mapping',
      description: 'Manual KYC verification mapping',
      lastModified: new Date(2024, 0, 8),
      createdBy: 'Admin User',
      size: '5.8 MB',
      type: 'Compliance',
      isShared: true,
      collaborators: 5
    },
    {
      id: 4,
      name: 'Expense Tracker Q1',
      description: 'Quarterly expense tracking',
      lastModified: new Date(2024, 0, 5),
      createdBy: 'Finance Team',
      size: '3.1 MB',
      type: 'Finance',
      isShared: true,
      collaborators: 2
    },
  ]);

  const [filteredSheets, setFilteredSheets] = useState(sheets);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredSheets(sheets);
    } else {
      const filtered = sheets.filter(sheet =>
        sheet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sheet.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sheet.type.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSheets(filtered);
    }
  }, [searchQuery, sheets]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Budget': return 'bg-green-100 text-green-800';
      case 'HR': return 'bg-blue-100 text-blue-800';
      case 'Compliance': return 'bg-red-100 text-red-800';
      case 'Finance': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDuplicate = (sheet: any) => {
    const duplicated = {
      ...sheet,
      id: Date.now(),
      name: `${sheet.name} (Copy)`,
      lastModified: new Date(),
      createdBy: 'Current User'
    };
    setSheets([duplicated, ...sheets]);
  };

  const handleDelete = (sheetId: number) => {
    setSheets(sheets.filter(s => s.id !== sheetId));
  };

  return (
    <div className="space-y-6">
      {/* Recent Sheets */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Spreadsheets</h3>
        {filteredSheets.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No spreadsheets found</h3>
            <p className="text-gray-500">
              {searchQuery ? 'Try adjusting your search terms' : 'Create your first spreadsheet to get started'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSheets.map((sheet) => (
              <Card key={sheet.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-green-600" />
                      <Badge className={getTypeColor(sheet.type)}>
                        {sheet.type}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenSheet(sheet)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(sheet)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(sheet.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle 
                    className="text-base font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
                    onClick={() => onOpenSheet(sheet)}
                  >
                    {sheet.name}
                  </CardTitle>
                  <p className="text-sm text-gray-600">{sheet.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {sheet.lastModified.toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {sheet.createdBy}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{sheet.size}</span>
                      <div className="flex items-center gap-2">
                        {sheet.isShared && (
                          <Badge variant="outline" className="text-xs">
                            Shared
                          </Badge>
                        )}
                        <span>{sheet.collaborators} collaborator(s)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
