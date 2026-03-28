import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, newPassword, callerUserId } = await req.json();

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: "userId and newPassword are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine caller identity: try JWT first, fall back to callerUserId
    let callerId: string | null = null;

    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const { data: { user: caller } } = await adminClient.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (caller) callerId = caller.id;
    }

    // Fallback: accept callerUserId from body (for legacy sessions)
    if (!callerId && callerUserId) {
      callerId = callerUserId;
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized - no caller identity" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify caller is admin/super_admin
    const { data: callerUser } = await adminClient
      .from("users")
      .select("role")
      .eq("id", callerId)
      .single();

    if (!callerUser || !["super_admin", "admin"].includes(callerUser.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Update password in auth.users via admin API
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Failed to update auth password:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Also update legacy password_hash in public.users for backward compat
    await adminClient.rpc("admin_reset_user_password", {
      p_user_id: userId,
      p_new_password: newPassword,
    }).catch(() => {});

    console.log(`Password reset by ${callerId} for user ${userId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("admin-reset-password error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
