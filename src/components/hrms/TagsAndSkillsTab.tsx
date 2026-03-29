import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Tag, Zap } from "lucide-react";
import { toast } from "sonner";

interface TagsAndSkillsTabProps {
  employeeId: string;
}

export function TagsAndSkillsTab({ employeeId }: TagsAndSkillsTabProps) {
  const qc = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [newSkill, setNewSkill] = useState("");

  // All tags (global reference)
  const { data: allTags = [] } = useQuery({
    queryKey: ["hr_employee_tags"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employee_tags").select("*").order("title");
      return data || [];
    },
  });

  // All skills (global reference)
  const { data: allSkills = [] } = useQuery({
    queryKey: ["hr_skills"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_skills").select("*").order("title");
      return data || [];
    },
  });

  // Employee's assigned tags (stored in hr_employees.tags jsonb or a junction - let's use hr_employee_tags as global list and employee profile for assignment)
  // Since there's no junction table for employee<->tag, we'll store in employee metadata
  const { data: empMeta } = useQuery({
    queryKey: ["hr_employee_meta", employeeId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees")
        .select("id, tags, skills")
        .eq("id", employeeId)
        .single();
      return data;
    },
    enabled: !!employeeId,
  });

  const assignedTags: string[] = (empMeta?.tags as string[]) || [];
  const assignedSkills: string[] = (empMeta?.skills as string[]) || [];

  const updateEmployeeMeta = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await (supabase as any).from("hr_employees").update(updates).eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_employee_meta", employeeId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagTitle: string) => {
      // Create tag if it doesn't exist
      let tag = allTags.find((t: any) => t.title.toLowerCase() === tagTitle.toLowerCase());
      if (!tag) {
        const { data, error } = await (supabase as any).from("hr_employee_tags").insert({ title: tagTitle }).select("*").single();
        if (error) throw error;
        tag = data;
        qc.invalidateQueries({ queryKey: ["hr_employee_tags"] });
      }
      // Add to employee
      if (!assignedTags.includes(tag.id)) {
        await updateEmployeeMeta.mutateAsync({ tags: [...assignedTags, tag.id] });
      }
    },
    onSuccess: () => { setNewTag(""); toast.success("Tag added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeTag = (tagId: string) => {
    updateEmployeeMeta.mutate({ tags: assignedTags.filter(t => t !== tagId) });
  };

  const addSkillMutation = useMutation({
    mutationFn: async (skillTitle: string) => {
      let skill = allSkills.find((s: any) => s.title.toLowerCase() === skillTitle.toLowerCase());
      if (!skill) {
        const { data, error } = await (supabase as any).from("hr_skills").insert({ title: skillTitle }).select("*").single();
        if (error) throw error;
        skill = data;
        qc.invalidateQueries({ queryKey: ["hr_skills"] });
      }
      if (!assignedSkills.includes(skill.id)) {
        await updateEmployeeMeta.mutateAsync({ skills: [...assignedSkills, skill.id] });
      }
    },
    onSuccess: () => { setNewSkill(""); toast.success("Skill added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeSkill = (skillId: string) => {
    updateEmployeeMeta.mutate({ skills: assignedSkills.filter(s => s !== skillId) });
  };

  const tagMap = Object.fromEntries(allTags.map((t: any) => [t.id, t]));
  const skillMap = Object.fromEntries(allSkills.map((s: any) => [s.id, s]));

  return (
    <div className="space-y-6">
      {/* Tags Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Tag className="h-4 w-4" /> Tags</h3>
        <div className="flex flex-wrap gap-1.5">
          {assignedTags.map(tagId => {
            const tag = tagMap[tagId];
            return tag ? (
              <Badge key={tagId} variant="secondary" className="gap-1" style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : {}}>
                {tag.title}
                <button onClick={() => removeTag(tagId)} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ) : null;
          })}
          {assignedTags.length === 0 && <span className="text-xs text-muted-foreground">No tags assigned</span>}
        </div>
        <div className="flex gap-2 items-center">
          <Input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            placeholder="Add tag..."
            className="w-48 h-8 text-sm"
            onKeyDown={e => e.key === "Enter" && newTag.trim() && addTagMutation.mutate(newTag.trim())}
            list="tag-suggestions"
          />
          <datalist id="tag-suggestions">
            {allTags.filter((t: any) => !assignedTags.includes(t.id)).map((t: any) => (
              <option key={t.id} value={t.title} />
            ))}
          </datalist>
          <Button size="sm" variant="outline" className="h-8" onClick={() => newTag.trim() && addTagMutation.mutate(newTag.trim())} disabled={!newTag.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Skills Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Zap className="h-4 w-4" /> Skills</h3>
        <div className="flex flex-wrap gap-1.5">
          {assignedSkills.map(skillId => {
            const skill = skillMap[skillId];
            return skill ? (
              <Badge key={skillId} variant="outline" className="gap-1">
                {skill.title}
                <button onClick={() => removeSkill(skillId)} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ) : null;
          })}
          {assignedSkills.length === 0 && <span className="text-xs text-muted-foreground">No skills assigned</span>}
        </div>
        <div className="flex gap-2 items-center">
          <Input
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            placeholder="Add skill..."
            className="w-48 h-8 text-sm"
            onKeyDown={e => e.key === "Enter" && newSkill.trim() && addSkillMutation.mutate(newSkill.trim())}
            list="skill-suggestions"
          />
          <datalist id="skill-suggestions">
            {allSkills.filter((s: any) => !assignedSkills.includes(s.id)).map((s: any) => (
              <option key={s.id} value={s.title} />
            ))}
          </datalist>
          <Button size="sm" variant="outline" className="h-8" onClick={() => newSkill.trim() && addSkillMutation.mutate(newSkill.trim())} disabled={!newSkill.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
