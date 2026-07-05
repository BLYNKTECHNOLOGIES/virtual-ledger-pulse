import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Users, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import SalaryStructureTemplates from "@/components/horilla/payroll/SalaryStructureTemplates";
import SalaryStructureAssignments from "@/components/horilla/payroll/SalaryStructureAssignments";

export default function SalaryStructurePage() {
  const [tab, setTab] = useState("templates");

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Salary Structure"
        description="Create salary structure templates and assign them to employees"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <Users className="h-4 w-4" /> Employee Assignments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          <SalaryStructureTemplates />
        </TabsContent>
        <TabsContent value="assignments">
          <SalaryStructureAssignments />
        </TabsContent>
      </Tabs>
    </div>
  );
}
