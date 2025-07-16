import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Database {
  public: {
    Tables: {
      sales_payment_methods: {
        Row: {
          id: string
          frequency: string
          last_reset: string | null
          current_usage: number | null
        }
        Update: {
          current_usage?: number
          last_reset?: string
        }
      }
      purchase_payment_methods: {
        Row: {
          id: string
          frequency: string
          last_reset: string | null
          current_usage: number | null
          custom_frequency?: string | null
        }
        Update: {
          current_usage?: number
          last_reset?: string
        }
      }
    }
  }
}

serve(async (req) => {
  const supabaseClient = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const now = new Date()
    
    // Function to check if reset is needed based on frequency
    const shouldReset = (lastReset: string | null, frequency: string, customFrequency?: string | null): boolean => {
      if (!lastReset) return true
      
      const lastResetDate = new Date(lastReset)
      const hoursDiff = (now.getTime() - lastResetDate.getTime()) / (1000 * 60 * 60)
      
      switch (frequency) {
        case "24 hours":
          return hoursDiff >= 24
        case "Daily":
          // Reset at midnight if it's a new calendar day
          return lastResetDate.toDateString() !== now.toDateString()
        case "48 hours":
          return hoursDiff >= 48
        case "Custom":
          if (customFrequency) {
            const customHours = parseInt(customFrequency)
            return !isNaN(customHours) && hoursDiff >= customHours
          }
          return false
        default:
          return false
      }
    }

    // Reset sales payment methods
    const { data: salesMethods, error: salesError } = await supabaseClient
      .from('sales_payment_methods')
      .select('id, frequency, last_reset, current_usage, custom_frequency')

    if (salesError) {
      console.error('Error fetching sales payment methods:', salesError)
    } else {
      for (const method of salesMethods) {
        if (shouldReset(method.last_reset, method.frequency, method.custom_frequency)) {
          const { error: updateError } = await supabaseClient
            .from('sales_payment_methods')
            .update({
              current_usage: 0,
              last_reset: now.toISOString()
            })
            .eq('id', method.id)

          if (updateError) {
            console.error(`Error updating sales method ${method.id}:`, updateError)
          } else {
            console.log(`Reset sales payment method ${method.id}`)
          }
        }
      }
    }

    // Reset purchase payment methods
    const { data: purchaseMethods, error: purchaseError } = await supabaseClient
      .from('purchase_payment_methods')
      .select('id, frequency, last_reset, current_usage, custom_frequency')

    if (purchaseError) {
      console.error('Error fetching purchase payment methods:', purchaseError)
    } else {
      for (const method of purchaseMethods) {
        if (shouldReset(method.last_reset, method.frequency, method.custom_frequency)) {
          const { error: updateError } = await supabaseClient
            .from('purchase_payment_methods')
            .update({
              current_usage: 0,
              last_reset: now.toISOString()
            })
            .eq('id', method.id)

          if (updateError) {
            console.error(`Error updating purchase method ${method.id}:`, updateError)
          } else {
            console.log(`Reset purchase payment method ${method.id}`)
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment limits reset completed',
      timestamp: now.toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in reset-payment-limits function:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})