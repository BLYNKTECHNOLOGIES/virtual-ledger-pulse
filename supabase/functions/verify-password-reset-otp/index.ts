import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  otp: string;
}

// This should match the store from send-password-reset-otp
// In production, use a shared database or Redis
const otpStore = new Map<string, { otp: string; timestamp: number; attempts: number }>();

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const { email, otp }: RequestBody = await req.json();

    if (!email || !otp) {
      return new Response(
        JSON.stringify({ error: "Email and OTP are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const storedData = otpStore.get(email);
    
    if (!storedData) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "OTP not found or expired. Please request a new one." 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if OTP has expired (10 minutes)
    const currentTime = Date.now();
    if (currentTime - storedData.timestamp > 10 * 60 * 1000) {
      otpStore.delete(email);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "OTP has expired. Please request a new one." 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check attempt limit (max 3 attempts)
    if (storedData.attempts >= 3) {
      otpStore.delete(email);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Too many invalid attempts. Please request a new OTP." 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify OTP
    if (storedData.otp === otp) {
      console.log("OTP verified successfully for:", email);
      return new Response(
        JSON.stringify({ 
          valid: true, 
          message: "OTP verified successfully" 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else {
      // Increment attempts
      storedData.attempts += 1;
      otpStore.set(email, storedData);
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.` 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

  } catch (error: any) {
    console.error("Error in verify-password-reset-otp function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify OTP" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);