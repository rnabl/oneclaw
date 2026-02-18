#!/usr/bin/env tsx
/**
 * Seed Wallet Script
 * 
 * Credit a user's wallet without making a real Stripe payment.
 * Use this for testing and debugging.
 * 
 * Usage:
 *   tsx scripts/seed-wallet.ts <discord_id> <amount_cents>
 * 
 * Example:
 *   tsx scripts/seed-wallet.ts 397102686660591616 1500
 * 
 * Environment variables (from .env or .env.local):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Simple env loader - no dotenv dependency needed
function loadEnv() {
  const envFiles = ['.env', '.env.local'];
  for (const file of envFiles) {
    const path = resolve(__dirname, '..', file);
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Make sure .env.local has these variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedWallet(discordId: string, amountCents: number) {
  console.log(`\n🔍 Looking up Discord user: ${discordId}`);

  // First check if wallet exists by user_id (legacy direct discord ID)
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', discordId)
    .single();

  if (walletError && walletError.code !== 'PGRST116') {
    console.error('Error querying wallet:', walletError);
    process.exit(1);
  }

  if (!wallet) {
    console.error(`\n❌ No wallet found for Discord ID: ${discordId}`);
    console.error('\nThe user needs to interact with OneClaw first to create a wallet.');
    console.error('They can do this by running /status in Discord.');
    process.exit(1);
  }

  console.log(`✅ Found wallet: ${wallet.id}`);
  console.log(`   Current balance: $${(wallet.balance_cents / 100).toFixed(2)}`);

  // Generate idempotency key
  const idempotencyKey = `seed_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const newBalance = wallet.balance_cents + amountCents;

  // Create transaction
  const { error: txnError } = await supabase.from('transactions').insert({
    id: randomUUID(),
    user_id: discordId,
    type: 'top_up',
    amount_cents: amountCents,
    balance_after_cents: newBalance,
    description: `[SEED] Admin credit: ${amountCents} cents`,
    stripe_payment_id: idempotencyKey,
    created_at: new Date().toISOString(),
  });

  if (txnError) {
    console.error('Error creating transaction:', txnError);
    process.exit(1);
  }

  // Update wallet balance
  const { error: updateError } = await supabase
    .from('wallets')
    .update({
      balance_cents: newBalance,
      lifetime_topup_cents: wallet.lifetime_topup_cents + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', discordId);

  if (updateError) {
    console.error('Error updating wallet:', updateError);
    process.exit(1);
  }

  console.log(`\n✅ Successfully credited wallet!`);
  console.log(`   Amount: +$${(amountCents / 100).toFixed(2)}`);
  console.log(`   New balance: $${(newBalance / 100).toFixed(2)}`);
  console.log(`   Idempotency key: ${idempotencyKey}`);
  console.log('\nUser can now run /status in Discord to see their balance.\n');
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
Usage: npx tsx scripts/seed-wallet.ts <discord_id> <amount_cents>

Examples:
  npx tsx scripts/seed-wallet.ts 397102686660591616 1500   # Add $15.00
  npx tsx scripts/seed-wallet.ts 397102686660591616 500    # Add $5.00
  npx tsx scripts/seed-wallet.ts 397102686660591616 2500   # Add $25.00
`);
  process.exit(1);
}

const [discordId, amountStr] = args;
const amountCents = parseInt(amountStr, 10);

if (isNaN(amountCents) || amountCents <= 0) {
  console.error('Error: amount_cents must be a positive integer');
  process.exit(1);
}

seedWallet(discordId, amountCents).catch(console.error);
