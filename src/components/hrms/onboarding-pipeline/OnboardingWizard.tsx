import { useState, useEffect, useRef } from "react";
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

  // Only hydrate activeStage from record ONCE when the record first loads.
  // Refetches during Finalize (or any autosave) must NOT snap the user back
  // to `record.current_stage` — that value lags behind the wizard UI and was
  // bouncing users off Stage 5 mid-finalize, hiding the failure toast.
  const hydratedStageRef = useRef(false);
  useEffect(() => {
    if (record && !hydratedStageRef.current) {
      setActiveStage(record.current_stage || 1);
      hydratedStageRef.current = true;
    }
  }, [record]);

  const isCompleted = record?.status === "completed";

  const isBlankValue = (value: any) =>
    value === undefined || value === null || (typeof value === "string" && value.trim() === "");

  const hasValue = (value: any) => !isBlankValue(value);

  const mergeJsonPreservingExisting = (existing: any, incoming: any): any => {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) return incoming;

    const merged: Record<string, any> = { ...existing };
    Object.entries(incoming).forEach(([key, incomingValue]) => {
      const existingValue = existing[key];
      if (incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue)) {
        merged[key] = mergeJsonPreservingExisting(existingValue, incomingValue);
        return;
      }
      if (isBlankValue(incomingValue) && hasValue(existingValue)) return;
      merged[key] = incomingValue;
    });
    return merged;
  };

  const buildSafeOnboardingUpdate = (existing: Record<string, any> | null, updates: Record<string, any>) => {
    const persistentFields = new Set([
      "first_name",
      "last_name",
      "email",
      "phone",
      "gender",
      "date_of_birth",
      "department_id",
      "position_id",
      "job_role",
      "shift_id",
      "employee_type",
      "ctc",
      "date_of_joining",
      "essl_badge_id",
      "reporting_manager_id",
      "erp_role_id",
      "documents",
      "document_mail_received_at",
      "offer_policy_documents",
      "bank_details",
    ]);

    const normalizedUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
    Object.entries(updates || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      const existingValue = existing?.[key];

      if ((key === "documents" || key === "offer_policy_documents" || key === "bank_details") && value) {
        normalizedUpdates[key] = mergeJsonPreservingExisting(existingValue, value);
        return;
      }

      // Partial stage autosaves must never erase a value that was already
      // entered elsewhere in the wizard. This is what was clearing Date of
      // Joining and other Stage-5 values when another stage saved a smaller
      // payload.
      if (persistentFields.has(key) && isBlankValue(value) && hasValue(existingValue)) return;

      normalizedUpdates[key] = value;
    });

    if ("reporting_manager_id" in updates && !hasValue(normalizedUpdates.reporting_manager_id) && !hasValue(existing?.reporting_manager_id)) {
      normalizedUpdates.reporting_manager_id = null;
    }
    if (("erp_role_id" in updates || "create_erp_account" in updates) && updates.create_erp_account === false) {
      normalizedUpdates.erp_role_id = null;
    }

    return normalizedUpdates;
  };

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

    const { data: existing, error: existingErr } = await supabase
      .from("hr_employee_onboarding")
      .select("*")
      .eq("id", recordId)
      .single();
    if (existingErr) throw existingErr;

    const normalizedUpdates = buildSafeOnboardingUpdate(existing as any, updates || {});

    const { error } = await supabase
      .from("hr_employee_onboarding")
      .update(normalizedUpdates)
      .eq("id", recordId)
      .select("id")
      .single();
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

  const getFunctionErrorMessage = async (err: any, fallback = "Edge function failed") => {
    const context = err?.context;
    const base = err?.message || fallback;

    if (context && typeof context === "object") {
      try {
        const body = typeof context.clone === "function"
          ? await context.clone().json()
          : await context.json();
        const detail = body?.error || body?.message || body?.reason || body?.code;
        if (detail) return typeof detail === "string" ? detail : JSON.stringify(detail);
      } catch {
        try {
          const text = typeof context.clone === "function"
            ? await context.clone().text()
            : await context.text();
          if (text) {
            try {
              const parsed = JSON.parse(text);
              const detail = parsed?.error || parsed?.message || parsed?.reason || parsed?.code;
              if (detail) return typeof detail === "string" ? detail : JSON.stringify(detail);
            } catch {
              return text;
            }
          }
        } catch {
          // fall through to base message
        }
      }
    }

    return base;
  };

  const invokeLongRunningFunction = async <T,>(functionName: string, body: unknown, timeoutMs = 120_000): Promise<T> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase configuration is missing");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken || supabaseKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: any = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `Edge function returned ${response.status}`);
      }
      return payload as T;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("RazorpayX is still processing after two minutes. No local completion was made; retry Finalize after checking RazorpayX.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  // Generic save draft handler
  const handleSaveDraft = async (stage: number, stageData: any, options?: { silent?: boolean }) => {
    try {
      if (!recordId) {
        await createRecord(stageData);
      } else {
        await updateRecord(stageData);
      }
      await refetch();
      if (!options?.silent) toast.success("Draft saved");
    } catch (err: any) {
      if (!options?.silent) toast.error(err.message);
      throw err;
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
      // Split off fields that are NOT columns on hr_employee_onboarding.
      // bank_details -> written to hr_employee_bank_details below.
      // razorpay_employee_id -> operator-entered RazorpayX Employee ID; kept
      //   in the onboarding record for audit but also used below to link the
      //   HRMS row and verify against RazorpayX.
      const { bank_details: bankDetails, ...onboardingUpdate } = stage5Data || {};
      const operatorRazorpayId = String((stage5Data?.razorpay_employee_id ?? "")).trim();

      // 1. Update onboarding record with stage 5 data
      await updateRecord({
        ...onboardingUpdate,
        current_stage: 5,
        status: record.status === "completed" ? "completed" : "stage_4",
      });

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

      // Unified ID doctrine: badge_id === RazorpayX employee_id === ESSL PIN.
      // Prefer the operator-entered Razorpay ID; fall back to any pre-existing
      // essl_badge_id on the draft (legacy path). Never allocate a new ID from
      // hr_next_razorpay_employee_id here — creation happens on RazorpayX now,
      // not from ERP.
      const unifiedId = operatorRazorpayId || (r.essl_badge_id || "").toString().trim();
      if (!unifiedId) {
        throw new Error("RazorpayX Employee ID is required. Enter the ID issued by RazorpayX after the new hire completes self-registration.");
      }

      if (linkedEmployeeId) {
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
            badge_id: unifiedId,
            total_salary: r.ctc || 0,
            is_active: false,
            pan_number: docs.pan?.value || null,
            uan_number: docs.uan?.value || null,
            esi_number: docs.esic?.value || null,
            additional_info: {
              ...priorAdditional,
              ...(docs.aadhaar?.value ? { aadhaar_number: docs.aadhaar.value } : {}),
              onboarding_completed_at: new Date().toISOString(),
            },
          })
          .eq("id", linkedEmployeeId)
          .select("id")
          .single();
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
            badge_id: unifiedId,
            total_salary: r.ctc || 0,
            is_active: false,
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

      // Persist the draft employee link immediately so a retry reuses this row
      // instead of inserting another local employee after a provisioning failure.
      if ((record as any)?.employee_id !== emp.id) {
        const { error: linkDraftErr } = await supabase
          .from("hr_employee_onboarding")
          .update({ employee_id: emp.id, current_stage: 5, status: "stage_4", updated_at: new Date().toISOString() })
          .eq("id", recordId);
        if (linkDraftErr) throw linkDraftErr;
      }

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
          const { error: leaveAllocErr } = await supabase
            .from("hr_leave_allocations")
            .upsert(allocations, { onConflict: "employee_id,leave_type_id,year,quarter", ignoreDuplicates: true });
          if (leaveAllocErr) throw leaveAllocErr;
        }
      } catch (leaveErr) {
        console.warn("Auto leave allocation failed:", leaveErr);
      }

      // 3. Work info — clear any prior row (safe for both draft and fresh) then insert.
      const { error: workDeleteErr } = await supabase.from("hr_employee_work_info").delete().eq("employee_id", emp.id);
      if (workDeleteErr) throw workDeleteErr;
      const { error: workInsertErr } = await supabase.from("hr_employee_work_info").insert({
        employee_id: emp.id,
        department_id: r.department_id || null,
        job_position_id: r.position_id || null,
        shift_id: r.shift_id || null,
        joining_date: r.date_of_joining,
        employee_type: r.employee_type || "full_time",
        job_role: r.job_role || null,
        reporting_manager_id: r.reporting_manager_id || null,
      });
      if (workInsertErr) throw workInsertErr;

      // 4. Create bank details — prefer explicit fields captured in Stage 5,
      //    fall back to legacy documents.bank_details.value shape.
      const bank = (r as any).bank_details as any;
      if (bank && bank.account_number) {
        const bankPayload = {
          employee_id: emp.id,
          account_number: bank.account_number,
          ifsc_code: bank.ifsc_code || null,
          bank_name: bank.bank_name || null,
          branch: bank.branch || null,
          additional_info: bank.account_holder ? { account_holder: bank.account_holder } : null,
        };
        const { data: existingBankRow, error: bankLookupErr } = await supabase
          .from("hr_employee_bank_details")
          .select("id")
          .eq("employee_id", emp.id)
          .maybeSingle();
        if (bankLookupErr) throw bankLookupErr;

        const bankWrite = existingBankRow?.id
          ? await supabase.from("hr_employee_bank_details").update(bankPayload).eq("id", existingBankRow.id)
          : await supabase.from("hr_employee_bank_details").insert(bankPayload);
        if (bankWrite.error) throw bankWrite.error;
      } else if (docs.bank_details?.value) {
        const { error: legacyBankErr } = await supabase.from("hr_employee_bank_details").insert({
          employee_id: emp.id,
          account_number: docs.bank_details.value,
        });
        if (legacyBankErr) throw legacyBankErr;
      }

      // 5. Salary structure assignment — retired.
      //    Local templates were abolished (RazorpayX API exposes no template CRUD,
      //    so we cannot verify which structure got assigned). CTC is captured here;
      //    the component breakdown is assigned on the RazorpayX dashboard and
      //    mirrored read-only inside the employee profile after the next sync.

      // 6. Determine which external system creations were requested BEFORE
      //    marking the onboarding as completed. If any requested creation
      //    fails, we abort completion and keep the record on Stage 5 with a
      //    clear per-system explanation. The employee row / work info / bank
      //    row created above are safe to leave in place — the next retry
      //    reuses them via the `linkedEmployeeId` branch.
      const { data: user } = await supabase.auth.getUser();
      const failures: { system: string; message: string }[] = [];
      const successes: string[] = [];

      // 6a. Verify + link the operator-entered RazorpayX Employee ID to this
      //     HRMS row. RazorpayX itself owns employee creation now — the ID must
      //     already exist on RazorpayX (issued after the new hire completes
      //     self-registration). We only verify + upsert the mapping row here.
      let razorpayEmployeeId: string | null = null;
      if (operatorRazorpayId) {
        try {
          const rpRes = await invokeLongRunningFunction<any>("razorpay-payroll-proxy", {
            action: "recover_person_by_id",
            hr_employee_id: emp.id,
            razorpay_employee_id: Number(operatorRazorpayId),
          });
          if (rpRes?.ok === false) {
            const detail = rpRes?.error || rpRes?.reason || "RazorpayX rejected the verification";
            throw new Error(detail);
          }
          razorpayEmployeeId = rpRes?.razorpay_employee_id ?? operatorRazorpayId;
          await logAudit(recordId, 5, "razorpay_person_verified", { razorpay_employee_id: razorpayEmployeeId, response: rpRes });
          successes.push(`RazorpayX ID ${razorpayEmployeeId} linked`);
        } catch (rpErr: any) {
          const message = rpErr?.message || String(rpErr);
          console.error("Razorpay verify+link failed:", rpErr);
          await logAudit(recordId, 5, "razorpay_person_verify_failed", { error: message });
          failures.push({ system: "RazorpayX", message });
        }
      }


      // RazorpayX is the payroll authority. If its provisioning failed, stop
      // here: do not create ERP accounts or mark the local employee active.
      if (failures.length > 0) {
        await refetch();
        queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
        setActiveStage(5);
        const summary = failures.map(f => `• ${f.system}: ${f.message}`).join("\n");
        const successNote = successes.length ? `\n\nAlready created: ${successes.join(", ")}.` : "";
        throw new Error(
          `Onboarding not completed — the following failed:\n${summary}${successNote}\n\nFix the issues above and click Finalize again.`,
        );
      }

      // 6b. ERP account creation.
      let erpUserSummary: string | null = null;
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

          if (erpError) throw new Error(await getFunctionErrorMessage(erpError, "ERP user creation failed"));
          if (erpResult?.error) throw new Error(erpResult.error);

          const { userId: erpUserId, username: erpUsername, tempPassword } = erpResult;

          if (tempPassword) {
            // Send credentials email via hr@blynkex.com only for newly-created
            // accounts. Reused retry accounts must not receive a bogus
            // "undefined" password.
            const loginUrl = "https://erp.blynkex.com";
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

            try {
              await supabase.functions.invoke("send-hr-email", {
                body: {
                  recipientEmail: r.email,
                  subject: "Your Blynk ERP Login Credentials",
                  htmlBody: credentialsHtml,
                  templateName: "erp_credentials",
                },
              });
            } catch (mailErr: any) {
              console.warn("Credential email failed (ERP account was created):", mailErr);
              toast.warning(`ERP account created but credential email failed: ${mailErr?.message || mailErr}`);
            }
          }

          if (erpUserId) {
            const { error: linkUserErr } = await supabase
              .from("hr_employees")
              .update({ user_id: erpUserId })
              .eq("id", emp.id);
            if (linkUserErr) throw new Error(`ERP account created but employee link failed: ${linkUserErr.message}`);
          }

          await logAudit(recordId, 5, erpResult?.alreadyExists ? "erp_account_reused" : "erp_account_created", { erp_user_id: erpUserId, username: erpUsername });
          erpUserSummary = erpUsername;
          successes.push(erpResult?.alreadyExists ? `ERP account ${erpUsername} reused` : `ERP account ${erpUsername}`);
        } catch (erpErr: any) {
          const message = erpErr?.message || String(erpErr);
          console.error("ERP account creation failed:", erpErr);
          await logAudit(recordId, 5, "erp_account_failed", { error: message });
          failures.push({ system: "ERP account", message });
        }
      }

      // 6c. If any requested external creation failed, DO NOT mark the
      //     onboarding complete. Keep the record on Stage 5 so the operator
      //     can fix the underlying issue and retry.
      if (failures.length > 0) {
        await refetch();
        queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
        setActiveStage(5);
        const summary = failures.map(f => `• ${f.system}: ${f.message}`).join("\n");
        const successNote = successes.length ? `\n\nAlready created: ${successes.join(", ")}.` : "";
        throw new Error(
          `Onboarding not completed — the following failed:\n${summary}${successNote}\n\nFix the issues above and click Finalize again.`,
        );
      }

      // 6d. All requested creations succeeded — now mark the onboarding as
      //     completed. This is the only place status flips to "completed".
      const completions = (record.stage_completions as Record<string, any>) || {};
      const { error: completeErr } = await supabase
        .from("hr_employee_onboarding")
        .update({
          status: "completed",
          employee_id: emp.id,
          stage_completions: {
            ...completions,
            stage_5: { completed_at: new Date().toISOString(), completed_by: user?.user?.id },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", recordId)
        .select("id")
        .single();
      if (completeErr) throw completeErr;

      const { error: activateErr } = await supabase
        .from("hr_employees")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", emp.id);
      if (activateErr) throw activateErr;

      await logAudit(recordId, 5, "finalized", { employee_id: emp.id });

      if (successes.length > 0) {
        toast.success(`Created: ${successes.join(", ")}`);
      }


      await refetch();
      queryClient.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
      toast.success("🎉 Employee created successfully!");
    } catch (err: any) {
      console.error("Finalize onboarding failed:", err);
      toast.error(err.message || "Failed to finalize onboarding");
      throw err;
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
          onSave={(d, options) => handleSaveDraft(1, d, options)}
          onComplete={(d) => handleStageComplete(1, d)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 2 && (
        <Stage2SalaryConfig
          data={record}
          onSave={(d, options) => handleSaveDraft(2, d, options)}
          onComplete={(d) => handleStageComplete(2, d)}
          onBack={() => setActiveStage(1)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 3 && (
        <Stage3Documents
          data={record}
          onboardingData={record}
          onSave={(d, options) => handleSaveDraft(3, d, options)}
          onComplete={(d) => handleStageComplete(3, d)}
          onBack={() => setActiveStage(2)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 4 && (
        <Stage4OfferPolicy
          data={record}
          onboardingData={record}
          onSave={(d, options) => handleSaveDraft(4, d, options)}
          onComplete={(d) => handleStageComplete(4, d)}
          onBack={() => setActiveStage(3)}
          readOnly={isCompleted}
        />
      )}
      {activeStage === 5 && (
        <Stage5Finalization
          onboardingRecord={record}
          onFinalize={handleFinalize}
          onSave={(d, options) => handleSaveDraft(5, d, options)}
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
