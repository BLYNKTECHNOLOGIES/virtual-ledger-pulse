import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Settings2, Package } from "lucide-react";

interface SystemFunction {
  id: string;
  function_key: string;
  function_name: string;
  description: string;
  module: string;
}

interface RoleFunctionAssignment {
  role_id: string;
  role_name: string;
  functions: string[];
}

export function FunctionsTab() {
  const [functions, setFunctions] = useState<SystemFunction[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleFunctionAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all system functions
      const { data: funcsData, error: funcsError } = await supabase
        .from('system_functions')
        .select('*')
        .order('module', { ascending: true });

      if (funcsError) throw funcsError;
      setFunctions(funcsData || []);

      // Fetch roles with their assigned functions
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          id,
          name,
          role_functions (
            function_id,
            system_functions (
              function_key
            )
          )
        `)
        .order('name');

      if (rolesError) throw rolesError;

      const assignments: RoleFunctionAssignment[] = (rolesData || []).map((role: any) => ({
        role_id: role.id,
        role_name: role.name,
        functions: role.role_functions?.map((rf: any) => rf.system_functions?.function_key).filter(Boolean) || []
      }));

      setRoleAssignments(assignments);
    } catch (error) {
      console.error('Error fetching functions data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group functions by module
  const functionsByModule = functions.reduce((acc, func) => {
    if (!acc[func.module]) {
      acc[func.module] = [];
    }
    acc[func.module].push(func);
    return acc;
  }, {} as Record<string, SystemFunction[]>);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Loading functions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>System Functions</CardTitle>
              <CardDescription>
                Functions define specific capabilities within modules. Assign functions to roles to control user access.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Functions by Module */}
      {Object.entries(functionsByModule).map(([module, moduleFunctions]) => (
        <Card key={module}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg capitalize">{module} Module</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {moduleFunctions.map((func) => {
                // Find roles that have this function
                const assignedRoles = roleAssignments.filter(ra => 
                  ra.functions.includes(func.function_key)
                );

                return (
                  <div key={func.id} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{func.function_name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {func.function_key}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {func.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {assignedRoles.length > 0 ? (
                          assignedRoles.map(role => (
                            <Badge key={role.role_id} variant="secondary" className="text-xs">
                              {role.role_name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Not assigned to any role
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="text-primary">ℹ️</div>
            <div className="space-y-2">
              <p className="text-sm font-medium">How Functions Work</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Functions are assigned to <strong>Roles</strong>, not individual users</li>
                <li>Users inherit functions through their assigned role</li>
                <li>To assign functions, edit a role in the "Roles & Permissions" tab</li>
                <li>For Purchase module: if a role has Purchase Tab access, it must have at least one purchase function</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
