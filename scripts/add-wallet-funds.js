// Add funds to wallet
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '397102686660591616'; // Your Discord user ID
const amountCents = 1000; // $10.00

(async () => {
  try {
    // Upsert wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .upsert({
        user_id: userId,
        balance_cents: amountCents,
        tier: 'pro',
        lifetime_spent_cents: 0,
        lifetime_topup_cents: amountCents,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'user_id',
        returning: 'representation'
      })
      .select()
      .single();

    if (walletError) {
      console.error('❌ Error updating wallet:', walletError);
      process.exit(1);
    }

    console.log(`✅ Added $${amountCents / 100} to wallet for user ${userId}`);
    console.log(`💰 New balance: $${wallet.balance_cents / 100}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
