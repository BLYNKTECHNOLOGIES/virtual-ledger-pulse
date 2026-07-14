import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  userId: z.string().uuid("Invalid user id"),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized. Please log in again." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller?.id) {
      return jsonResponse({ success: false, error: "Unauthorized. Please log in again." }, 401);
    }

    if (caller.id === parsed.data.userId) {
      return jsonResponse({ success: false, error: "You cannot delete your own account" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: cleanupResult, error: cleanupError } = await userClient.rpc("delete_user_with_cleanup", {
      p_user_id: parsed.data.userId,
    });

    if (cleanupError) {
      console.error("delete_user_with_cleanup failed:", cleanupError);
      return jsonResponse({ success: false, error: cleanupError.message || "ERP cleanup failed" }, 500);
    }

    const cleanup = cleanupResult as { success?: boolean; error?: string; user_name?: string } | null;
    if (!cleanup?.success) {
      return jsonResponse({ success: false, error: cleanup?.error || "ERP cleanup failed" }, 400);
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(parsed.data.userId);
    if (authDeleteError) {
      const message = authDeleteError.message || "Auth deletion failed";
      const isAlreadyGone = message.toLowerCase().includes("not found") || message.toLowerCase().includes("no user");
      if (!isAlreadyGone) {
        console.error("Auth user delete failed after ERP cleanup:", authDeleteError);
        return jsonResponse({
          success: true,
          authDeleted: false,
          warning: "ERP user was deleted, but the Auth account could not be removed. Contact Super Admin if login remains active.",
        });
      }
    }

    return jsonResponse({ success: true, authDeleted: !authDeleteError, userName: cleanup.user_name });
  } catch (error) {
    console.error("delete-erp-user error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});