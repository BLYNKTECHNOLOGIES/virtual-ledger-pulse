import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, FileText, MapPin, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddSubsidiaryDialog } from "./AddSubsidiaryDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

const firmCompositionLabels: Record<string, string> = {
  SOLE_PROPRIETORSHIP: "Sole Proprietorship",
  LLP: "LLP",
  TRUST: "Trust",
  PRIVATE_LIMITED: "Private Limited",
  PUBLIC_LIMITED: "Public Limited",
};

export function CompanyComplianceTab() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: subsidiaries, isLoading, refetch } = useQuery({
    queryKey: ["subsidiaries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsidiaries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle>Company Compliance</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage subsidiaries of Blynk Virtual Technologies
                </p>
              </div>
            </div>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Firm
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !subsidiaries || subsidiaries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No firms added yet</p>
              <p className="text-sm">Click "Add Firm" to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {subsidiaries.map((subsidiary) => (
                <Card key={subsidiary.id} className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{subsidiary.firm_name}</h3>
                            <Badge variant="outline" className="mt-1">
                              {firmCompositionLabels[subsidiary.firm_composition] || subsidiary.firm_composition}
                            </Badge>
                          </div>
                          <Badge variant={subsidiary.status === "ACTIVE" ? "default" : "secondary"}>
                            {subsidiary.status}
                          </Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                          {subsidiary.gst_number && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">GST:</span>
                              <span className="font-medium">{subsidiary.gst_number}</span>
                            </div>
                          )}
                          {subsidiary.pan_number && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">PAN:</span>
                              <span className="font-medium">{subsidiary.pan_number}</span>
                            </div>
                          )}
                          {subsidiary.registration_number && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Registration:</span>
                              <span className="font-medium">{subsidiary.registration_number}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        {subsidiary.registered_address && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <span className="text-muted-foreground">Address:</span>
                              <p className="font-medium">
                                {subsidiary.registered_address}
                                {subsidiary.city && `, ${subsidiary.city}`}
                                {subsidiary.state && `, ${subsidiary.state}`}
                                {subsidiary.pincode && ` - ${subsidiary.pincode}`}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {subsidiary.contact_person && (
                          <div>
                            <span className="text-muted-foreground">Contact Person:</span>
                            <p className="font-medium">{subsidiary.contact_person}</p>
                          </div>
                        )}
                        
                        {subsidiary.contact_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{subsidiary.contact_email}</span>
                          </div>
                        )}
                        
                        {subsidiary.contact_phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{subsidiary.contact_phone}</span>
                          </div>
                        )}

                        {subsidiary.date_of_incorporation && (
                          <div>
                            <span className="text-muted-foreground">Incorporated:</span>
                            <span className="font-medium ml-2">
                              {format(new Date(subsidiary.date_of_incorporation), "dd MMM yyyy")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {subsidiary.compliance_notes && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Notes:</p>
                        <p className="text-sm mt-1">{subsidiary.compliance_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddSubsidiaryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={refetch}
      />
    </div>
  );
}
