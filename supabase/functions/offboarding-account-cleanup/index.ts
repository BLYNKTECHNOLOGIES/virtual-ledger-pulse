import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireHrCaller } from "../_shared/require-hr-caller.ts";
import { drainErpRevocations } from "../_shared/hr-erp-revocation.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  const caller=await requireHrCaller(req,corsHeaders);
  if(!caller.ok) return caller.response;
  if(caller.kind==="user") return json({error:"Server only"},403);
  try {
    const {data,error}=await caller.admin.rpc("process_scheduled_account_deletions");
    if(error) throw error;
    return json({...data,results:await drainErpRevocations(caller.admin)});
  } catch(error) {return json({error:error instanceof Error ? error.message : "Cleanup failed"},500);}
});
