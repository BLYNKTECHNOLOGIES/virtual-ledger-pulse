
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";

export function JournalEntriesTab() {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Journal Entries
          </CardTitle>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No journal entries recorded</p>
          <Button className="mt-4">Create Journal Entry</Button>
        </div>
      </CardContent>
    </Card>
  );
}
