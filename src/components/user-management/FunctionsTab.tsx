import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Settings2 } from "lucide-react";
import { Panel } from "@/components/finance-ui/primitives";
import { PanelMessage, PanelSkeleton, UM_TABLE, moduleLabel } from "./umUi";

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

  const rolesWith = (key: string) => roleAssignments.filter((ra) => ra.functions.includes(key));

  return (
    <Panel
      title="Module functions"
      description="Extra abilities that roles get on top of their permissions. Read-only here."
      bodyClassName="p-0 sm:p-0"
      footer="Functions are given to roles, not to individual people. To change which roles have a function, edit the role in Roles & permissions."
    >
      {isLoading ? (
        <PanelSkeleton rows={4} />
      ) : functions.length === 0 ? (
        <PanelMessage icon={Settings2} title="No module functions set up" />
      ) : (
        <div className="responsive-list">
          <div className="responsive-list-table">
            <table className={UM_TABLE}>
              <thead>
                <tr>
                  <th className="w-[38%]">Function</th>
                  <th>Module</th>
                  <th>Roles that have it</th>
                </tr>
              </thead>
              <tbody>
                {functions.map((func) => {
                  const assignedRoles = rolesWith(func.function_key);
                  return (
                    <tr key={func.id}>
                      <td>
                        <p className="font-medium text-foreground">{func.function_name}</p>
                        {func.description && <p className="mt-0.5 text-xs text-muted-foreground">{func.description}</p>}
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{func.function_key}</p>
                      </td>
                      <td>{moduleLabel(func.module)}</td>
                      <td>
                        {assignedRoles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedRoles.map((role) => (
                              <span key={role.role_id} className="ds-status ds-status-neutral">{role.role_name.trim()}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No role yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="responsive-list-cards divide-y divide-border">
            {functions.map((func) => {
              const assignedRoles = rolesWith(func.function_key);
              return (
                <li key={func.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="font-medium text-foreground">{func.function_name}</p>
                    <span className="text-xs text-muted-foreground">{moduleLabel(func.module)}</span>
                  </div>
                  {func.description && <p className="text-xs text-muted-foreground">{func.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {assignedRoles.length > 0 ? (
                      assignedRoles.map((role) => (
                        <span key={role.role_id} className="ds-status ds-status-neutral">{role.role_name.trim()}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No role yet</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
