
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RaciRole {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  display_order: number;
  is_active: boolean;
  color: string | null;
}

export interface RaciCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
}

export interface RaciTask {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface RaciAssignment {
  id: string;
  task_id: string;
  role_id: string;
  assignment_type: 'R' | 'A' | 'C' | 'I' | 'A/R';
  notes: string | null;
}

export interface RoleKra {
  id: string;
  role_id: string;
  title: string;
  description: string | null;
  weightage: number | null;
  display_order: number;
  is_active: boolean;
}

export interface RoleKpi {
  id: string;
  kra_id: string;
  role_id: string;
  metric: string;
  target: string | null;
  measurement_method: string | null;
  frequency: string | null;
  display_order: number;
  is_active: boolean;
}

export function useRaciRoles() {
  return useQuery({
    queryKey: ['raci-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raci_roles')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as RaciRole[];
    },
  });
}

export function useRaciCategories() {
  return useQuery({
    queryKey: ['raci-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raci_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as RaciCategory[];
    },
  });
}

export function useRaciTasks() {
  return useQuery({
    queryKey: ['raci-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raci_tasks')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return data as RaciTask[];
    },
  });
}

export function useRaciAssignments() {
  return useQuery({
    queryKey: ['raci-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raci_assignments')
        .select('*');
      if (error) throw error;
      return data as RaciAssignment[];
    },
  });
}

export function useRoleKras(roleId?: string) {
  return useQuery({
    queryKey: ['role-kras', roleId],
    queryFn: async () => {
      let query = supabase
        .from('role_kras')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (roleId) query = query.eq('role_id', roleId);
      const { data, error } = await query;
      if (error) throw error;
      return data as RoleKra[];
    },
  });
}

export function useRoleKpis(roleId?: string) {
  return useQuery({
    queryKey: ['role-kpis', roleId],
    queryFn: async () => {
      let query = supabase
        .from('role_kpis')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (roleId) query = query.eq('role_id', roleId);
      const { data, error } = await query;
      if (error) throw error;
      return data as RoleKpi[];
    },
  });
}

// Mutation hooks for admin editing
export function useRaciMutations() {
  const qc = useQueryClient();

  const upsertRole = useMutation({
    mutationFn: async (role: Partial<RaciRole> & { name: string }) => {
      const { data, error } = await supabase
        .from('raci_roles')
        .upsert(role as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-roles'] }),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raci_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-roles'] }),
  });

  const upsertCategory = useMutation({
    mutationFn: async (cat: Partial<RaciCategory> & { name: string }) => {
      const { data, error } = await supabase
        .from('raci_categories')
        .upsert(cat as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-categories'] }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raci_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-categories'] }),
  });

  const upsertTask = useMutation({
    mutationFn: async (task: Partial<RaciTask> & { name: string; category_id: string }) => {
      const { data, error } = await supabase
        .from('raci_tasks')
        .upsert(task as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-tasks'] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raci_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-tasks'] }),
  });

  const upsertAssignment = useMutation({
    mutationFn: async (a: { task_id: string; role_id: string; assignment_type: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('raci_assignments')
        .upsert(a as any, { onConflict: 'task_id,role_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-assignments'] }),
  });

  const deleteAssignment = useMutation({
    mutationFn: async ({ taskId, roleId }: { taskId: string; roleId: string }) => {
      const { error } = await supabase
        .from('raci_assignments')
        .delete()
        .eq('task_id', taskId)
        .eq('role_id', roleId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raci-assignments'] }),
  });

  const upsertKra = useMutation({
    mutationFn: async (kra: Partial<RoleKra> & { role_id: string; title: string }) => {
      const { data, error } = await supabase
        .from('role_kras')
        .upsert(kra as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-kras'] }),
  });

  const deleteKra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('role_kras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-kras'] }),
  });

  const upsertKpi = useMutation({
    mutationFn: async (kpi: Partial<RoleKpi> & { kra_id: string; role_id: string; metric: string }) => {
      const { data, error } = await supabase
        .from('role_kpis')
        .upsert(kpi as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-kpis'] }),
  });

  const deleteKpi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('role_kpis').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role-kpis'] }),
  });

  return {
    upsertRole, deleteRole,
    upsertCategory, deleteCategory,
    upsertTask, deleteTask,
    upsertAssignment, deleteAssignment,
    upsertKra, deleteKra,
    upsertKpi, deleteKpi,
  };
}
