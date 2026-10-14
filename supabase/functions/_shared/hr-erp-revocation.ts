// Persisted retry state survives employee unlinking and Auth deletion failures.
export async function completeErpRevocation(svc: any, userId: string) {
  try {
    const { data: cleanup, error } = await svc.rpc("hr_cleanup_revoked_erp", { p_user_id: userId });
    if (error || !cleanup?.success) throw new Error(error?.message || cleanup?.error || "ERP cleanup failed");
    const { error: authError } = await svc.auth.admin.deleteUser(userId);
    if (authError && authError.status !== 404 && authError.code !== "user_not_found") throw authError;
    const [{ data: auth, error: ae }, { data: row, error: re }, { data: roles, error: ue }, { data: terminal, error: te }] = await Promise.all([
      svc.auth.admin.getUserById(userId),
      svc.from("users").select("id,status,username,role_id,badge_id").eq("id",userId).maybeSingle(),
      svc.from("user_roles").select("user_id").eq("user_id",userId),
      svc.from("p2p_terminal_user_roles").select("user_id").eq("user_id",userId),
    ]);
    if (ae && ae.status !== 404 && ae.code !== "user_not_found") throw ae;
    if (re || ue || te) throw re || ue || te;
    const tombstone = row?.status === "INACTIVE" && row?.username === `deleted_${userId.replace(/-/g, "")}` && row?.role_id == null && row?.badge_id == null;
    if (auth?.user || (row && !tombstone) || roles?.length || terminal?.length) throw new Error("ERP removal read-back failed");
    const { error: doneError } = await svc.from("hr_erp_access_revocations").update({completed_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("user_id",userId);
    if (doneError) throw doneError;
    return {deactivated:true,deleted:true,auditRecordRetained:!!row};
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const {data:pending} = await svc.from("hr_erp_access_revocations").select("attempts").eq("user_id",userId).maybeSingle();
    await svc.from("hr_erp_access_revocations").update({attempts:(pending?.attempts || 0)+1,last_error:reason,updated_at:new Date().toISOString()}).eq("user_id",userId);
    return {deactivated:false,deleted:false,reason};
  }
}
/**
 * Opens (or keeps) the single removal record for a login. Every path — User
 * Management delete, HRMS Deactivate, offboarding, sign-up rejection — goes
 * through this record and completeErpRevocation, so they all end identically.
 */
export async function queueAccountRemoval(svc: any, rec: {
  userId: string; employeeId?: string | null; requestedBy?: string | null;
  source: "user_management" | "hrms_deactivate" | "offboarding" | "signup_rejection";
  reason?: string | null; registrationId?: string | null;
}) {
  const { error } = await svc.from("hr_erp_access_revocations").upsert({
    user_id: rec.userId, employee_id: rec.employeeId ?? null, requested_by: rec.requestedBy ?? null,
    source: rec.source, reason: rec.reason ?? null, registration_id: rec.registrationId ?? null,
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw error;
}
export async function revokeEmployeeErp(svc:any,employeeId:string) {
  const {data:userId,error} = await svc.rpc("hr_queue_erp_revocation",{p_employee_id:employeeId});
  if(error) return {deactivated:false,deleted:false,reason:error.message};
  if(userId) return completeErpRevocation(svc,userId);
  const {data:pending,error:pe} = await svc.from("hr_erp_access_revocations").select("user_id").eq("employee_id",employeeId).is("completed_at",null);
  if(pe) return {deactivated:false,deleted:false,reason:pe.message};
  for(const row of pending || []) { const result=await completeErpRevocation(svc,row.user_id); if(!result.deleted) return result; }
  return {deactivated:true,deleted:true};
}
export async function drainErpRevocations(svc:any) {
  const {data,error}=await svc.from("hr_erp_access_revocations").select("user_id,source").is("completed_at",null).order("requested_at").limit(100);
  if(error) throw error;
  const results=[];
  for(const row of data || []) {
    // A rejected sign-up's own employee stub is removed first (it blocks Auth removal).
    if(row.source==="signup_rejection") await svc.from("employees").delete().eq("user_id",row.user_id);
    results.push({userId:row.user_id,...await completeErpRevocation(svc,row.user_id)});
  }
  return results;
}
