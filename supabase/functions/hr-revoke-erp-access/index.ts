import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { requireHrCaller } from "../_shared/require-hr-caller.ts";
import { revokeEmployeeErp } from "../_shared/hr-erp-revocation.ts";
const schema=z.object({employeeId:z.string().uuid()});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const caller=await requireHrCaller(req,corsHeaders);
  if(!caller.ok) return caller.response;
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return json({error:"Invalid employee"},400);
  if(caller.kind==="user") {
    const [{data:allowed,error:pe},{data:superAdmin,error:se},{data:emp,error:ee}]=await Promise.all([
      caller.admin.rpc("user_has_permission",{user_uuid:caller.userId,check_permission:"erp_destructive"}),
      caller.admin.rpc("has_role",{_user_id:caller.userId,_role:"Super Admin"}),
      caller.admin.from("hr_employees").select("user_id,badge_id,email").eq("id",parsed.data.employeeId).maybeSingle(),
    ]);
    if(pe || se || ee || (!allowed && !superAdmin)) return json({error:"ERP deletion permission required"},403);
    let target=emp?.user_id;
    if(!target && emp?.badge_id) {
      const {data,error}=await caller.admin.from("users").select("id").eq("badge_id",emp.badge_id).maybeSingle();
      if(error) return json({error:"Unable to resolve ERP account"},409);
      target=data?.id;
    }
    if(!target && emp?.email) {
      const {data,error}=await caller.admin.from("users").select("id").eq("email",emp.email).maybeSingle();
      if(error) return json({error:"Unable to resolve ERP account"},409);
      target=data?.id;
    }
    if(target===caller.userId) return json({error:"You cannot delete your own account"},403);
    if(target && !superAdmin) {
      const {data,error}=await caller.admin.rpc("has_role",{_user_id:target,_role:"Super Admin"});
      if(error || data) return json({error:"Only Super Admin can delete a Super Admin user"},403);
    }
  }
  return json(await revokeEmployeeErp(caller.admin,parsed.data.employeeId));
});
