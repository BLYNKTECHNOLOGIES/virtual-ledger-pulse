import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Plus, Edit, Trash2, X, ChevronDown, ChevronRight, Eye, FileText, CheckSquare, List } from "lucide-react";
import { toast } from "sonner";

const QUESTION_TYPES = [
  { value: "text", label: "Text", icon: FileText },
  { value: "rating", label: "Rating (1-5)", icon: List },
  { value: "yes_no", label: "Yes / No", icon: CheckSquare },
  { value: "multiple_choice", label: "Multiple Choice", icon: List },
];

export default function RecruitmentSurveyPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", is_general_template: false });
  const [expanded, setExpanded] = useState<string[]>([]);

  // Question form
  const [qForm, setQForm] = useState({ question: "", question_type: "text", is_required: true, options: "" });
  const [addQTo, setAddQTo] = useState<string | null>(null);
  const [viewResponses, setViewResponses] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["hr_survey_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_survey_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["hr_survey_questions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_survey_questions").select("*").order("sequence");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["hr_survey_responses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_survey_responses").select("*, hr_candidates(name, email)").order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!form.title) throw new Error("Title required");
      if (editTemplate) {
        const { error } = await supabase.from("hr_survey_templates").update({
          title: form.title,
          description: form.description || null,
          is_general_template: form.is_general_template,
        }).eq("id", editTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_survey_templates").insert({
          title: form.title,
          description: form.description || null,
          is_general_template: form.is_general_template,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editTemplate ? "Template updated" : "Template created");
      queryClient.invalidateQueries({ queryKey: ["hr_survey_templates"] });
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_survey_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_survey_templates"] });
      queryClient.invalidateQueries({ queryKey: ["hr_survey_questions"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!qForm.question) throw new Error("Question required");
      const tplQuestions = questions.filter((q: any) => q.template_id === templateId);
      const maxSeq = tplQuestions.reduce((m: number, q: any) => Math.max(m, q.sequence || 0), 0);
      const optionsJson = qForm.question_type === "multiple_choice" && qForm.options
        ? qForm.options.split(",").map(o => o.trim()).filter(Boolean)
        : null;
      const { error } = await supabase.from("hr_survey_questions").insert({
        template_id: templateId,
        question: qForm.question,
        question_type: qForm.question_type,
        is_required: qForm.is_required,
        options: optionsJson,
        sequence: maxSeq + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question added");
      queryClient.invalidateQueries({ queryKey: ["hr_survey_questions"] });
      setQForm({ question: "", question_type: "text", is_required: true, options: "" });
      setAddQTo(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add question"),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_survey_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_survey_questions"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const closeDialog = () => {
    setCreateOpen(false);
    setEditTemplate(null);
    setForm({ title: "", description: "", is_general_template: false });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const getQuestionsForTemplate = (id: string) => questions.filter((q: any) => q.template_id === id);
  const getResponsesForTemplate = (id: string) => responses.filter((r: any) => r.template_id === id);

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recruitment Survey</h1>
          <p className="text-xs text-gray-500 mt-0.5">Create and manage survey templates for recruitment</p>
        </div>
        <button
          onClick={() => { closeDialog(); setCreateOpen(true); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Create Template
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0"><ClipboardList className="h-5 w-5 text-violet-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{templates.length}</p><p className="text-xs text-gray-500">Templates</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0"><FileText className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{questions.length}</p><p className="text-xs text-gray-500">Total Questions</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0"><CheckSquare className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="text-2xl font-bold text-gray-900">{responses.length}</p><p className="text-xs text-gray-500">Responses</p></div>
        </div>
      </div>

      {/* Templates */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No survey templates yet. Create one to start collecting candidate feedback.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl: any) => {
            const tplQuestions = getQuestionsForTemplate(tpl.id);
            const tplResponses = getResponsesForTemplate(tpl.id);
            const isExpanded = expanded.includes(tpl.id);
            return (
              <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(tpl.id)}>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <ClipboardList className="h-4 w-4 text-[#E8604C]" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{tpl.title}</span>
                    {tpl.is_general_template && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">General</span>}
                    {tpl.description && <p className="text-xs text-gray-400 mt-0.5">{tpl.description}</p>}
                  </div>
                  <span className="text-xs text-gray-500">{tplQuestions.length} Q&apos;s</span>
                  <span className="text-xs text-gray-500">{tplResponses.length} responses</span>
                  <button onClick={(e) => { e.stopPropagation(); setViewResponses(viewResponses === tpl.id ? null : tpl.id); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="View Responses">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setForm({ title: tpl.title, description: tpl.description || "", is_general_template: tpl.is_general_template }); setEditTemplate(tpl); setCreateOpen(true); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${tpl.title}"?`)) deleteTemplateMutation.mutate(tpl.id); }}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {tplQuestions.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-400">No questions added yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {tplQuestions.map((q: any, i: number) => (
                          <div key={q.id} className="flex items-center gap-3 px-4 py-2 pl-12">
                            <span className="text-xs text-gray-400 font-mono w-5">{i + 1}.</span>
                            <div className="flex-1">
                              <p className="text-sm text-gray-900">{q.question}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{q.question_type}</span>
                                {q.is_required && <span className="text-[10px] text-red-400">Required</span>}
                                {q.options && <span className="text-[10px] text-gray-400">Options: {(q.options as string[]).join(", ")}</span>}
                              </div>
                            </div>
                            <button onClick={() => deleteQuestionMutation.mutate(q.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add question */}
                    <div className="px-4 py-2 border-t border-gray-100">
                      {addQTo === tpl.id ? (
                        <div className="space-y-2">
                          <input value={qForm.question} onChange={e => setQForm({ ...qForm, question: e.target.value })} className={inputCls} placeholder="Enter question..." />
                          <div className="flex gap-2">
                            <select value={qForm.question_type} onChange={e => setQForm({ ...qForm, question_type: e.target.value })} className={inputCls + " flex-1"}>
                              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                              <input type="checkbox" checked={qForm.is_required} onChange={e => setQForm({ ...qForm, is_required: e.target.checked })} /> Required
                            </label>
                          </div>
                          {qForm.question_type === "multiple_choice" && (
                            <input value={qForm.options} onChange={e => setQForm({ ...qForm, options: e.target.value })} className={inputCls} placeholder="Comma-separated options..." />
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => addQuestionMutation.mutate(tpl.id)} disabled={!qForm.question}
                              className="px-3 py-1.5 text-xs bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">Add</button>
                            <button onClick={() => { setAddQTo(null); setQForm({ question: "", question_type: "text", is_required: true, options: "" }); }}
                              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAddQTo(tpl.id)} className="text-xs text-[#E8604C] hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Add Question
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Responses panel */}
                {viewResponses === tpl.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Responses ({tplResponses.length})</h4>
                    {tplResponses.length === 0 ? (
                      <p className="text-xs text-gray-400">No responses yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {tplResponses.map((r: any) => (
                          <div key={r.id} className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900">{r.hr_candidates?.name || r.respondent_name || "Anonymous"}</span>
                              <span className="text-[10px] text-gray-400">{new Date(r.submitted_at).toLocaleDateString()}</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              {Object.entries(r.answers || {}).map(([qId, ans]) => (
                                <p key={qId} className="mb-0.5"><strong className="text-gray-700">Q:</strong> {String(ans)}</p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editTemplate ? "Edit" : "Create"} Survey Template</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="e.g. Post-Interview Feedback" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} placeholder="Survey description..." />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_general_template} onChange={e => setForm({ ...form, is_general_template: e.target.checked })} />
                General Template (applies to all recruitments)
              </label>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeDialog} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => saveTemplateMutation.mutate()} disabled={!form.title} className="px-4 py-2 text-sm bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {editTemplate ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
