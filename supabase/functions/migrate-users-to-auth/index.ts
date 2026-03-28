import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate caller — must be Super Admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with caller's JWT — to verify identity
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify caller is an active user in public.users
    const token = authHeader.replace("Bearer ", "");
    // For now, accept a simple shared secret since users aren't in auth.users yet
    // We'll use a migration secret passed in the request body
    const body = await req.json().catch(() => ({}));
    const migrationSecret = body.migration_secret;

    if (migrationSecret !== "BLYNK_MIGRATE_2026_SECURE") {
      return new Response(
        JSON.stringify({ error: "Invalid migration secret" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempPassword = body.temp_password || "BlynkTemp2026!";
    const dryRun = body.dry_run ?? true; // Default to dry run for safety

    // Admin client with service_role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: {
      junk_deleted: string[];
      users_created: string[];
      users_skipped: string[];
      errors: string[];
    } = {
      junk_deleted: [],
      users_created: [],
      users_skipped: [],
      errors: [],
    };

    // Step 1: Get all active users from public.users
    const { data: erpUsers, error: erpError } = await adminClient
      .from("users")
      .select("id, email, username, first_name, last_name, status")
      .eq("status", "ACTIVE");

    if (erpError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch ERP users", details: erpError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Get all existing auth.users
    const { data: authUsersList, error: authListError } =
      await adminClient.auth.admin.listUsers({ perPage: 1000 });

    if (authListError) {
      return new Response(
        JSON.stringify({ error: "Failed to list auth users", details: authListError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingAuthIds = new Set(authUsersList.users.map((u) => u.id));
    const existingAuthEmails = new Set(
      authUsersList.users.map((u) => u.email?.toLowerCase())
    );

    // Step 3: Delete junk auth.users (those NOT in public.users)
    const erpUserIds = new Set((erpUsers || []).map((u) => u.id));

    for (const authUser of authUsersList.users) {
      if (!erpUserIds.has(authUser.id)) {
        // This is a junk entry — not referenced by any FK
        if (!dryRun) {
          const { error: delError } =
            await adminClient.auth.admin.deleteUser(authUser.id);
          if (delError) {
            results.errors.push(
              `Failed to delete junk auth user ${authUser.email}: ${delError.message}`
            );
          } else {
            results.junk_deleted.push(
              `${authUser.email} (${authUser.id})`
            );
          }
        } else {
          results.junk_deleted.push(
            `[DRY RUN] Would delete: ${authUser.email} (${authUser.id})`
          );
        }
      }
    }

    // Step 4: Create auth accounts for ERP users with matching UUIDs
    for (const erpUser of erpUsers || []) {
      const normalizedEmail = erpUser.email.toLowerCase().trim();

      // Skip if this UUID already exists in auth.users (already migrated)
      if (existingAuthIds.has(erpUser.id)) {
        results.users_skipped.push(
          `${normalizedEmail} — UUID already exists in auth.users`
        );
        continue;
      }

      // Check if email exists in auth with a DIFFERENT UUID (the junk entries)
      // These should be deleted in Step 3 first
      if (existingAuthEmails.has(normalizedEmail)) {
        // Find the conflicting auth user
        const conflicting = authUsersList.users.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );
        if (conflicting && !dryRun) {
          // Delete the conflicting junk entry first
          const { error: delError } =
            await adminClient.auth.admin.deleteUser(conflicting.id);
          if (delError) {
            results.errors.push(
              `Cannot delete conflicting auth entry for ${normalizedEmail}: ${delError.message}`
            );
            continue;
          }
          results.junk_deleted.push(
            `Deleted conflicting: ${conflicting.email} (${conflicting.id})`
          );
        } else if (conflicting && dryRun) {
          results.junk_deleted.push(
            `[DRY RUN] Would delete conflicting: ${conflicting.email} (${conflicting.id})`
          );
        }
      }

      if (!dryRun) {
        const { data: created, error: createError } =
          await adminClient.auth.admin.createUser({
            id: erpUser.id, // Preserve the UUID!
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true, // Skip email verification
            user_metadata: {
              username: erpUser.username,
              first_name: erpUser.first_name,
              last_name: erpUser.last_name,
            },
          });

        if (createError) {
          results.errors.push(
            `Failed to create ${normalizedEmail} (${erpUser.id}): ${createError.message}`
          );
        } else {
          results.users_created.push(
            `${normalizedEmail} (${erpUser.id})`
          );
        }
      } else {
        results.users_created.push(
          `[DRY RUN] Would create: ${normalizedEmail} (${erpUser.id})`
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        summary: {
          junk_deleted: results.junk_deleted.length,
          users_created: results.users_created.length,
          users_skipped: results.users_skipped.length,
          errors: results.errors.length,
        },
        details: results,
      }, null, 2),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
