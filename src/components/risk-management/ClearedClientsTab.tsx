import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface ClearedFlag {
  id: string;
  user_id: string;
  flag_type: string;
  flag_reason: string;
  risk_score: number;
  flagged_on: string;
  resolved_on: string;
  admin_notes?: string;
  users: {
    username: string;
    email: string;
  };
  resolved_by_user?: {
    username: string;
  };
}

export function ClearedClientsTab() {
  const { data: clearedClients, isLoading } = useQuery({
    queryKey: ["cleared-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_flags")
        .select(`
          *,
          users!inner(username, email),
          resolved_by_user:users!risk_flags_resolved_by_fkey(username)
        `)
        .eq("status", "CLEARED")
        .order("resolved_on", { ascending: false });

      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) {
    return <div>Loading cleared clients...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Cleared Clients
        </CardTitle>
        <CardDescription>
          Clients whose risk flags have been cleared after review
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clearedClients && clearedClients.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Original Risk Reason</TableHead>
                <TableHead>Cleared On</TableHead>
                <TableHead>Cleared By</TableHead>
                <TableHead>Flag History</TableHead>
                <TableHead>Admin Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clearedClients.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{flag.users.username}</div>
                      <div className="text-sm text-muted-foreground">{flag.users.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm">{flag.flag_reason}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline">
                          Score: {flag.risk_score}
                        </Badge>
                        <Badge variant="secondary">
                          {flag.flag_type}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {flag.resolved_on ? format(new Date(flag.resolved_on), "MMM dd, yyyy HH:mm") : "N/A"}
                  </TableCell>
                  <TableCell>
                    {flag.resolved_by_user?.username || "System"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>Flagged: {format(new Date(flag.flagged_on), "MMM dd, yyyy")}</div>
                      <div>Duration: {
                        flag.resolved_on 
                          ? Math.ceil((new Date(flag.resolved_on).getTime() - new Date(flag.flagged_on).getTime()) / (1000 * 60 * 60 * 24))
                          : 0
                      } days</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm">{flag.admin_notes || "No notes"}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No cleared clients found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}