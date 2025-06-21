
import { supabase } from '@/integrations/supabase/client';

export const debugSupabaseAuth = async () => {
  console.log('=== SUPABASE AUTH DEBUG UTILITY ===');
  
  // Check session
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  console.log('1. Session:', sessionData.session);
  console.log('   Session error:', sessionError);
  
  // Check user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  console.log('2. User:', userData.user);
  console.log('   User error:', userError);
  
  // Test auth.uid() via SQL
  try {
    const { data, error } = await supabase.rpc('get_current_user_id');
    console.log('3. auth.uid() from RPC:', data);
    console.log('   RPC error:', error);
  } catch (e) {
    console.log('3. RPC not available, checking manually');
  }
  
  // Check if authenticated role is active
  const { data: testData, error: testError } = await supabase
    .from('users')
    .select('count(*)')
    .limit(1);
  
  console.log('4. Test query result:', testData);
  console.log('   Test query error:', testError);
  
  console.log('=== END DEBUG ===');
  
  return {
    session: sessionData.session,
    user: userData.user,
    canQuery: !testError
  };
};
