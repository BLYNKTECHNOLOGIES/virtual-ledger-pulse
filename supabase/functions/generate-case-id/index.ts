import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Case type abbreviations mapping
const CASE_TYPE_ABBREVIATIONS: Record<string, string> = {
  'ACCOUNT_NOT_WORKING': 'ANW',
  'WRONG_PAYMENT_INITIATED': 'WPI', 
  'PAYMENT_NOT_CREDITED': 'PNC',
  'SETTLEMENT_NOT_RECEIVED': 'SNR',
  'LIEN_RECEIVED': 'LR',
  'BALANCE_DISCREPANCY': 'BD'
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { caseType } = await req.json();
    
    console.log('Generating case ID for case type:', caseType);

    // Validate case type
    if (!CASE_TYPE_ABBREVIATIONS[caseType]) {
      throw new Error(`Invalid case type: ${caseType}`);
    }

    // Get current date in YYYYMMDD format
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                   (today.getMonth() + 1).toString().padStart(2, '0') + 
                   today.getDate().toString().padStart(2, '0');

    console.log('Date string:', dateStr);

    // Get the case type abbreviation
    const abbreviation = CASE_TYPE_ABBREVIATIONS[caseType];
    
    // Build the case number prefix pattern
    const caseNumberPrefix = `${abbreviation}-${dateStr}-`;
    
    console.log('Searching for cases with prefix:', caseNumberPrefix);

    // Query existing cases for today with the same case type
    const { data: existingCases, error } = await supabase
      .from('bank_cases')
      .select('case_number')
      .eq('case_type', caseType)
      .like('case_number', `${caseNumberPrefix}%`)
      .order('case_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error querying existing cases:', error);
      throw error;
    }

    console.log('Existing cases found:', existingCases);

    // Calculate next serial number
    let nextSerial = 1;
    
    if (existingCases && existingCases.length > 0) {
      const lastCaseNumber = existingCases[0].case_number;
      console.log('Last case number:', lastCaseNumber);
      
      // Extract serial number from the last case (e.g., "ANW-20250816-003" -> "003")
      const serialPart = lastCaseNumber.split('-')[2];
      if (serialPart) {
        nextSerial = parseInt(serialPart) + 1;
      }
    }

    // Generate the new case ID
    const serialNumber = nextSerial.toString().padStart(3, '0');
    const newCaseId = `${abbreviation}-${dateStr}-${serialNumber}`;
    
    console.log('Generated case ID:', newCaseId);

    return new Response(
      JSON.stringify({ 
        caseId: newCaseId,
        caseType: caseType,
        abbreviation: abbreviation,
        date: dateStr,
        serialNumber: serialNumber
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-case-id function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to generate case ID',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});