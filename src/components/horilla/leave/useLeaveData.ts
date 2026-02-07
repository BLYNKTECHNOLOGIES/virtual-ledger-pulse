
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["hr_employees_leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, profile_image_url")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaveRequests() {
  return useQuery({
    queryKey: ["hr_leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name, last_name, badge_id, profile_image_url), hr_leave_types(id, name, code, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaveAllocations() {
  return useQuery({
    queryKey: ["hr_leave_allocations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_allocations")
        .select("*, hr_employees(first_name, last_name, badge_id, profile_image_url), hr_leave_types(id, name, code, color)")
        .eq("year", new Date().getFullYear())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaveAllocationRequests() {
  return useQuery({
    queryKey: ["hr_leave_allocation_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_leave_allocation_requests")
        .select("*, hr_employees(first_name, last_name, badge_id, profile_image_url), hr_leave_types(id, name, code, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
