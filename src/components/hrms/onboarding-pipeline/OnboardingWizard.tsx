import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Stage1BasicDetails } from "./Stage1BasicDetails";
import { Stage2SalaryConfig } from "./Stage2SalaryConfig";
import { Stage3Documents } from "./Stage3Documents";
import { Stage4OfferPolicy } from "./Stage4OfferPolicy";
import { Stage5Finalization } from "./Stage5Finalization";
import OnboardingTaskManager from "./OnboardingTaskManager";

const STAGE_LABELS = ["Basic Details", "Salary Config", "Documents", "Offer & Policy", "Finalization"];

interface OnboardingWizardProps {
  onboardingId: string | null; // null = new
  onBack: () => void;
}

export function OnboardingWizard({ onboardingId, onBack }: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [recordId, setRecordId] = useState<string | null>(onboardingId);
  const [activeStage, setActiveStage] = useState(1);

  const { data: record, refetch } = useQuery({
    queryKey: ["onboarding-record", recordId],
    queryFn: async () => {
      if (!recordId) return null;
      const { data, error } = await supabase
        .from("hr_employee_onboarding")
        .select("*")
        .eq("id", recordId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!recordId,
  });

  useEffect(() => {
    if (record) {
      setActiveStage(record.current_stage || 1);
    }
  }, [record]);

  const isCompleted = record?.status === "completed";

  // Create new record if none exists
  const createRecord = async (stageData: any) => {
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("hr_employee_onboarding")
      .insert({ ...stageData, status: "draft", current_stage: 1, created_by: user?.user?.id })
      .select("id")
      .single();
    if (error) throw error;
    setRecordId(data.id);
    await logAudit(data.id, 1, "created", stageData);
    return data.id;
  };

  const updateRecord = async (updates: any) => {
    if (!recordId) return;

    const normalizedUpdates = {
      ...updates,
      reporting_manager_id: updates.reporting_manager_id || null,
      erp_role_id: updates.create_erp_account ? (updates.erp_role_id || null) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("hr_employee_onboarding")
      .update(normalizedUpdates)
      .eq("id", recordId);
    if (error) throw error;
  };

  const logAudit = async (onbId: string, stage: number, action: string, changedFields?: any) => {
    const { data: user } = await supabase.auth.getUser();
    await supabase.from("hr_onboarding_audit_log").insert({
      onboarding_id: onbId,
      stage,
      action,
      changed_fields: changedFields || null,
      performed_by: user?.user?.id,
    });
  };

  // Generic save draft handler
  const handleSaveDraft = async (stage: number, stageData: any) => {
    try {
      if (!recordId) {
        await createRecord(stageData);
      } else {
        await updateRecord(stageData);
      }
      await refetch();
      toast.success("Draft saved");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Generic stage complete handler
  const handleStageComplete = async (stage: number, stageData: any) => {
    try {
      const completions = (record?.stage_completions as Record<string, any>) || {};
      const { data: user } = await supabase.auth.getUser();
      const updatedCompletions = {
        ...completions,
        [`stage_${stage}`]: { completed_at: new Date().toISOString(), completed_by: user?.user?.id },
      };

      const nextStage = stage + 1;
      const updates = {
        ...stageData,
        current_stage: nextStage,
        status: `stage_${stage}`,
        stage_completions: updatedCompletions,
      };

      if (!recordId) {
        const id = await createRecord({ ...stageData, current_stage: nextStage, status: `stage_${stage}`, stage_completions: updatedCompletions });
        await logAudit(id, stage, "completed", stageData);
      } else {
        await updateRecord(updates);
        await logAudit(recordId, stage, "completed", stageData);
      }

      await refetch();
      queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
      setActiveStage(nextStage);
      toast.success(`Stage ${stage} completed`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Finalization: Create employee
  const handleFinalize = async (stage5Data: any) => {
    if (!recordId || !record) return;

    try {
      // Split off bank_details — it is applied to hr_employee_bank_details,
      // not the onboarding row (no such column on hr_employee_onboarding).
      const { bank_details: bankDetails, ...onboardingUpdate } = stage5Data || {};

      // 1. Update onboarding record with stage 5 data
      await updateRecord(onboardingUpdate);
      await refetch();

      const r = { ...record, ...onboardingUpdate, bank_details: bankDetails } as any;
      const docs = r.documents || {};

      // 2. Employee row.
      //    If this onboarding was auto-created from a Razorpay import, an
      //    hr_employees draft (is_active=false) already exists and is linked
      //    via onboarding.employee_id. In that case we ACTIVATE the existing
      //    row rather than inserting a duplicate — keeping the razorpay map
      //    linkage intact.
      const linkedEmployeeId = (record as any)?.employee_id as string | null;
      let empId: string;

      if (linkedEmployeeId) {
        // Load prior additional_info from the linked hr_employees row (NOT
        // from the onboarding record — that table has no additional_info
        // column). This preserves the `source: "razorpay_import"` marker and
        // any imported-at audit data set by the Razorpay import proxy.
        const { data: existingEmp } = await supabase
          .from("hr_employees")
          .select("additional_info")
          .eq("id", linkedEmployeeId)
          .maybeSingle();
        const priorAdditional = ((existingEmp as any)?.additional_info) || {};
        const { error: updErr } = await supabase
          .from("hr_employees")
          .update({
            first_name: r.first_name,
            last_name: r.last_name || "",
            email: r.email,
            phone: r.phone || null,
            gender: r.gender || null,
            dob: r.date_of_birth || null,
            badge_id: r.essl_badge_id,
            total_salary: r.ctc || 0,
            is_active: true,
            pan_number: docs.pan?.value || null,
            uan_number: docs.uan?.value || null,
            esi_number: docs.esic?.value || null,
            additional_info: {
              ...priorAdditional,
              ...(docs.aadhaar?.value ? { aadhaar_number: docs.aadhaar.value } : {}),
              onboarding_completed_at: new Date().toISOString(),
            },
          })
          .eq("id", linkedEmployeeId);
        if (updErr) throw updErr;
        empId = linkedEmployeeId;
      } else {
        const { data: emp, error: empErr } = await supabase
          .from("hr_employees")
          .insert({
            first_name: r.first_name,
            last_name: r.last_name || "",
            email: r.email,
            phone: r.phone || null,
            gender: r.gender || null,
            dob: r.date_of_birth || null,
            badge_id: r.essl_badge_id,
            total_salary: r.ctc || 0,
            is_active: true,
            pan_number: docs.pan?.value || null,
            uan_number: docs.uan?.value || null,
            esi_number: docs.esic?.value || null,
            additional_info: docs.aadhaar?.value ? { aadhaar_number: docs.aadhaar.value } : null,
          })
          .select("id")
          .single();
        if (empErr) throw empErr;
        empId = emp.id;
      }

      const emp = { id: empId };

      // 2b. Auto-create leave allocations for all active leave types
      try {
        const { data: leaveTypes } = await supabase
          .from("hr_leave_types")
          .select("id, max_days_per_year")
          .eq("is_active", true);
        if (leaveTypes && leaveTypes.length > 0) {
          const now = new Date();
          const year = now.getFullYear();
          const quarter = Math.ceil((now.getMonth() + 1) / 3);
          const allocations = leaveTypes.map(lt => ({
            employee_id: emp.id,
            leave_type_id: lt.id,
            year,
            quarter,
            allocated_days: lt.max_days_per_year || 0,
            available_days: lt.max_days_per_year || 0,
            used_days: 0,
          }));
          await supabase.from("hr_leave_allocations").insert(allocations);
        }
      } catch (leaveErr) {
        console.warn("Auto leave allocation failed:", leaveErr);
      }

      // 3. Work info — clear any prior row (safe for both draft and fresh) then insert.
      await supabase.from("hr_employee_work_info").delete().eq("employee_id", emp.id);
      await supabase.from("hr_employee_work_info").insert({
        employee_id: emp.id,
        department_id: r.department_id || null,
        job_position_id: r.position_id || null,
        shift_id: r.shift_id || null,
        joining_date: r.date_of_joining,
        employee_type: r.employee_type || "full_time",
        job_role: r.job_role || null,
        reporting_manager_id: r.reporting_manager_id || null,
      });

      // 4. Create bank details — prefer explicit fields captured in Stage 5,
      //    fall back to legacy documents.bank_details.value shape.
      const bank = (r as any).bank_details as any;
      if (bank && bank.account_number) {
        await supabase.from("hr_employee_bank_details").upsert({
          employee_id: emp.id,
          account_number: bank.account_number,
          ifsc_code: bank.ifsc_code || null,
          bank_name: bank.bank_name || null,
          branch: bank.branch || null,
          additional_info: bank.account_holder ? { account_holder: bank.account_holder } : null,
        }, { onConflict: "employee_id" });
      } else if (docs.bank_details?.value) {
        await supabase.from("hr_employee_bank_details").insert({
          employee_id: emp.id,
          account_number: docs.bank_details.value,
        });
      }

      // 5. Apply salary template if selected
      if (r.salary_template_id) {
        try {
          await supabase.rpc("apply_salary_template", {
            p_employee_id: emp.id,
            p_template_id: r.salary_template_id,
          });
        } catch (e) {
          console.warn("Salary template application failed:", e);
        }
      }

      // 6. Mark onboarding as completed
      const { data: user } = await supabase.auth.getUser();
      const completions = (record.stage_completions as Record<string, any>) || {};
      await updateRecord({
        status: "completed",
        employee_id: emp.id,
        stage_completions: {
          ...completions,
          stage_5: { completed_at: new Date().toISOString(), completed_by: user?.user?.id },
        },
      });

      await logAudit(recordId, 5, "finalized", { employee_id: emp.id });

      // 6b. Optionally create employee in RazorpayX Payroll.
      //     Only if the operator toggled it on Stage 5 AND we have no prior
      //     mapping (guard also enforced server-side). Non-fatal on failure —
      //     the ERP employee is already created; HR can retry from the profile.
      if (stage5Data?.create_in_razorpay) {
        try {
          const { data: rpRes, error: rpErr } = await supabase.functions.invoke("razorpay-payroll-proxy", {
            body: { action: "create_person", hr_employee_id: emp.id },
          });
          if (rpErr) throw new Error(rpErr.message || "Razorpay create failed");
          if (rpRes?.ok === false) {
            const detail = rpRes?.missing?.length
              ? `Missing: ${rpRes.missing.join(", ")}`
              : (rpRes?.error || rpRes?.reason || "Razorpay rejected the request");
            throw new Error(detail);
          }
          await logAudit(recordId, 5, "razorpay_person_created", {
            razorpay_employee_id: rpRes?.razorpay_employee_id,
          });
          toast.success(`Created in Razorpay (ID: ${rpRes?.razorpay_employee_id})`);
        } catch (rpErr: any) {
          console.error("Razorpay create failed:", rpErr);
          toast.error(`Razorpay: ${rpErr.message}`);
          await logAudit(recordId, 5, "razorpay_person_failed", { error: rpErr.message });
        }
      }

      // 7. ERP account creation if create_erp_account is true
      if (r.create_erp_account && r.erp_role_id) {
        try {
          const { data: erpResult, error: erpError } = await supabase.functions.invoke("create-erp-user", {
            body: {
              firstName: r.first_name,
              lastName: r.last_name || "",
              email: r.email,
              phone: r.phone || null,
              departmentId: r.department_id || null,
              positionId: r.position_id || null,
              roleId: r.erp_role_id,
              badgeId: r.essl_badge_id || null,
              callerUserId: user?.user?.id,
            },
          });

          if (erpError) throw new Error(erpError.message || "ERP user creation failed");
          if (erpResult?.error) throw new Error(erpResult.error);

          const { userId: erpUserId, username: erpUsername, tempPassword } = erpResult;

          // Send credentials email via hr@blynkex.com
          const loginUrl = window.location.origin;
          const credentialsHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">Welcome to Blynk ERP</h2>
              <p>Dear ${r.first_name},</p>
              <p>Your ERP account has been created. Here are your login credentials:</p>
              <table style="border-collapse: collapse; margin: 20px 0;">
                <tr><td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Login URL</td><td style="padding: 8px 16px;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
                <tr><td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Email</td><td style="padding: 8px 16px;">${r.email}</td></tr>
                <tr><td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Username</td><td style="padding: 8px 16px;">${erpUsername}</td></tr>
                <tr><td style="padding: 8px 16px; font-weight: bold; background: #f5f5f5;">Temporary Password</td><td style="padding: 8px 16px; font-family: monospace;">${tempPassword}</td></tr>
              </table>
              <p style="color: #d32f2f; font-weight: bold;">⚠️ You will be required to change your password on first login.</p>
              <p>If you have any questions, please contact the HR department.</p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
              <p style="color: #888; font-size: 12px;">This is an automated message from Blynk Virtual Technologies HR.</p>
            </div>
          `;

          await supabase.functions.invoke("send-hr-email", {
            body: {
              recipientEmail: r.email,
              subject: "Your Blynk ERP Login Credentials",
              htmlBody: credentialsHtml,
              templateName: "erp_credentials",
            },
          });

          // Log ERP user creation on the audit trail
          await logAudit(recordId, 5, "erp_account_created", { erp_user_id: erpUserId, username: erpUsername });
          toast.success("ERP account created & credentials emailed");
        } catch (erpErr: any) {
          console.error("ERP account creation failed:", erpErr);
          toast.error(`ERP account: ${erpErr.message}`);
          // Non-fatal — employee is already created
          await logAudit(recordId, 5, "erp_account_failed", { error: erpErr.message });
        }
      }

      await refetch();
      queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
      toast.success("🎉 Employee created successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize onboarding");
    }
  };

  const canAccessStage = (stage: number) => {
    if (isCompleted) return true;
    if (stage === 1) return true;
    const completions = (record?.stage_completions as Record<string, any>) || {};
    return !!completions[`stage_${stage - 1}`];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-lg font-bold">
          {isCompleted ? "Onboarding Complete" : "Employee Onboarding"}
        </h2>
        {isCompleted && <Badge className="bg-success/10 text-success">✅ Completed</Badge>}
      </div>

      {/* Stage stepper */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {STAGE_LABELS.map((label, i) => {
          const stage = i + 1;
          const completions = record?.stage_completions || {};
          const isDone = !!completions[`stage_${stage}`];
          const isCurrent = activeStage === stage;
          const accessible = canAccessStage(stage);

          return (
            <button
              key={stage}
              onClick={() => accessible && setActiveStage(stage)}
              disabled={!accessible}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : isDone
                  ? "bg-success/10 text-success dark:bg-success dark:text-success"
                  : accessible
                  ? "bg-muted hover:bg-muted/80"
                  : "bg-muted/40 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border">
                {isDone ? "✓" : stage}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Active stage */}
      {activeStage === 1 && (
        <Stage1BasicDetails
          data={record}
          onSave={(d) => handleSaveDraft(1, d)}
          onComplete={(d) => handleStageComplete(1, d)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 2 && (
        <Stage2SalaryConfig
          data={record}
          onSave={(d) => handleSaveDraft(2, d)}
          onComplete={(d) => handleStageComplete(2, d)}
          onBack={() => setActiveStage(1)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 3 && (
        <Stage3Documents
          data={record}
          onboardingData={record}
          onSave={(d) => handleSaveDraft(3, d)}
          onComplete={(d) => handleStageComplete(3, d)}
          onBack={() => setActiveStage(2)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 4 && (
        <Stage4OfferPolicy
          data={record}
          onboardingData={record}
          onSave={(d) => handleSaveDraft(4, d)}
          onComplete={(d) => handleStageComplete(4, d)}
          onBack={() => setActiveStage(3)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 5 && (
        <Stage5Finalization
          onboardingRecord={record}
          onFinalize={handleFinalize}
          onBack={() => setActiveStage(4)}
          readOnly={isCompleted}
        />
      )}

      {/* Onboarding Task Checklist */}
      {recordId && (
        <div className="mt-6">
          <OnboardingTaskManager onboardingId={recordId} recruitmentId={(record as any)?.recruitment_id} />
        </div>
      )}
    </div>
  );
}
