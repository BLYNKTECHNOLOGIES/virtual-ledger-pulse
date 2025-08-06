import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RiskRule {
  type: string;
  description: string;
  score: number;
  check: (user: any, data: any) => Promise<boolean>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting risk detection scan...");

    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("*")
      .eq("status", "ACTIVE");

    if (usersError) {
      throw usersError;
    }

    console.log(`Scanning ${users?.length || 0} users for risk factors`);

    // Define risk detection rules
    const riskRules: RiskRule[] = [
      {
        type: "ORDER_FREQUENCY_SPIKE",
        description: "Current month's order count is > 2× last month's",
        score: 30,
        check: async (user, { supabase }) => {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
          const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

          // Get current month orders
          const { data: currentOrders } = await supabase
            .from("sales_orders")
            .select("id")
            .eq("customer_name", user.username)
            .gte("order_date", `${currentMonth}-01`)
            .lt("order_date", `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`);

          // Get last month orders
          const { data: lastOrders } = await supabase
            .from("sales_orders")
            .select("id")
            .eq("customer_name", user.username)
            .gte("order_date", `${lastMonthStr}-01`)
            .lt("order_date", `${currentMonth}-01`);

          const currentCount = currentOrders?.length || 0;
          const lastCount = lastOrders?.length || 0;

          return lastCount > 0 && currentCount > (lastCount * 2);
        }
      },
      {
        type: "ORDER_VOLUME_SPIKE",
        description: "Current month's total trade volume > 2× average of last 3 months",
        score: 25,
        check: async (user, { supabase }) => {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          
          // Get current month volume
          const { data: currentOrders } = await supabase
            .from("sales_orders")
            .select("total_amount")
            .eq("customer_name", user.username)
            .gte("order_date", `${currentMonth}-01`)
            .lt("order_date", `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`);

          // Get last 3 months volume
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3);
          const { data: pastOrders } = await supabase
            .from("sales_orders")
            .select("total_amount")
            .eq("customer_name", user.username)
            .gte("order_date", `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`)
            .lt("order_date", `${currentMonth}-01`);

          const currentVolume = currentOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
          const pastVolume = pastOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
          const avgPastVolume = pastVolume / 3;

          return avgPastVolume > 0 && currentVolume > (avgPastVolume * 2);
        }
      },
      {
        type: "FREQUENT_APPEALS",
        description: "More than 2 active appeals in the last 30 days",
        score: 15,
        check: async (user, { supabase }) => {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { data: appeals } = await supabase
            .from("kyc_queries")
            .select("id")
            .eq("created_by", user.id)
            .eq("resolved", false)
            .gte("created_at", thirtyDaysAgo.toISOString());

          return (appeals?.length || 0) > 2;
        }
      }
    ];

    let totalFlagged = 0;
    let totalProcessed = 0;

    // Process each user
    for (const user of users || []) {
      totalProcessed++;
      let userTotalScore = 0;
      const triggeredRules: string[] = [];

      // Check each risk rule
      for (const rule of riskRules) {
        try {
          const isTriggered = await rule.check(user, { supabase });
          
          // Log detection attempt
          await supabase
            .from("risk_detection_logs")
            .insert({
              user_id: user.id,
              detection_type: rule.type,
              risk_score: isTriggered ? rule.score : 0,
              details: {
                description: rule.description,
                triggered: isTriggered
              },
              flagged: isTriggered
            });

          if (isTriggered) {
            userTotalScore += rule.score;
            triggeredRules.push(rule.type);
            console.log(`User ${user.username} triggered rule: ${rule.type} (Score: ${rule.score})`);
          }
        } catch (error) {
          console.error(`Error checking rule ${rule.type} for user ${user.username}:`, error);
        }
      }

      // Flag user if risk score exceeds threshold
      if (userTotalScore >= 50) {
        // Check if user is already flagged
        const { data: existingFlag } = await supabase
          .from("risk_flags")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "FLAGGED")
          .single();

        if (!existingFlag) {
          const flagStatus = userTotalScore >= 70 ? "UNDER_REKYC" : "FLAGGED";
          
          await supabase
            .from("risk_flags")
            .insert({
              user_id: user.id,
              flag_type: triggeredRules.join(", "),
              flag_reason: `Automated risk detection - Total score: ${userTotalScore}. Triggered rules: ${triggeredRules.join(", ")}`,
              risk_score: userTotalScore,
              status: flagStatus
            });

          // If marked for ReKYC, create ReKYC request
          if (flagStatus === "UNDER_REKYC") {
            const { data: newFlag } = await supabase
              .from("risk_flags")
              .select("id")
              .eq("user_id", user.id)
              .eq("status", "UNDER_REKYC")
              .single();

            if (newFlag) {
              await supabase
                .from("rekyc_requests")
                .insert({
                  risk_flag_id: newFlag.id,
                  user_id: user.id,
                  status: "PENDING"
                });
            }
          }

          totalFlagged++;
          console.log(`User ${user.username} flagged with status: ${flagStatus} (Score: ${userTotalScore})`);
        }
      }
    }

    console.log(`Risk detection completed. Processed: ${totalProcessed}, Flagged: ${totalFlagged}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Risk detection completed",
        summary: {
          usersProcessed: totalProcessed,
          usersFlagged: totalFlagged,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in risk detection:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);