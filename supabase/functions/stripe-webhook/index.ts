// Supabase Edge Function: Stripe Webhook Handler
// Handles subscription events from Stripe and updates user tiers in Supabase

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Initialize Stripe with the secret key
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
})

// Initialize Supabase with service role key (bypasses RLS)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Stripe Price IDs
const STARTER_PRICE_ID = Deno.env.get('STRIPE_STARTER_PRICE_ID') || 'price_1T06aGS80t4p7Z0H1pIf7VT4'
const PRO_PRICE_ID = Deno.env.get('STRIPE_PRO_PRICE_ID') || 'price_1T06bIS80t4p7Z0HJ0h8EBSh'

// Helper: Map price ID to tier name
function getTierFromPriceId(priceId: string): 'starter' | 'pro' | 'none' {
  if (priceId === PRO_PRICE_ID) return 'pro'
  if (priceId === STARTER_PRICE_ID) return 'starter'
  return 'none'
}

// Helper: Get phone number from Stripe customer metadata
async function getPhoneFromCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return null
    return customer.metadata?.phone_number || customer.phone || null
  } catch (error) {
    console.error('Error fetching customer:', error)
    return null
  }
}

// Helper: Update user tier in Supabase
async function updateUserTier(customerId: string, tier: 'starter' | 'pro' | 'none'): Promise<boolean> {
  // First try to find by stripe_customer_id
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('id, phone_number')
    .eq('stripe_customer_id', customerId)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching user:', fetchError)
    return false
  }

  if (existingUser) {
    // Update existing user
    const { error: updateError } = await supabase
      .from('users')
      .update({ tier })
      .eq('stripe_customer_id', customerId)

    if (updateError) {
      console.error('Error updating user tier:', updateError)
      return false
    }
    console.log(`Updated user ${existingUser.phone_number} to tier: ${tier}`)
    return true
  }

  // User not found by customer ID, try to find by phone number from Stripe
  const phone = await getPhoneFromCustomer(customerId)
  if (!phone) {
    console.error('No phone number found for customer:', customerId)
    return false
  }

  // Check if user exists by phone
  const { data: userByPhone, error: phoneError } = await supabase
    .from('users')
    .select('id')
    .eq('phone_number', phone)
    .single()

  if (phoneError && phoneError.code !== 'PGRST116') {
    console.error('Error fetching user by phone:', phoneError)
    return false
  }

  if (userByPhone) {
    // Update existing user and link Stripe customer ID
    const { error: updateError } = await supabase
      .from('users')
      .update({ tier, stripe_customer_id: customerId })
      .eq('phone_number', phone)

    if (updateError) {
      console.error('Error updating user:', updateError)
      return false
    }
    console.log(`Linked and updated user ${phone} to tier: ${tier}`)
    return true
  }

  // Create new user if doesn't exist
  const { error: insertError } = await supabase
    .from('users')
    .insert({
      phone_number: phone,
      tier,
      stripe_customer_id: customerId
    })

  if (insertError) {
    console.error('Error creating user:', insertError)
    return false
  }
  console.log(`Created new user ${phone} with tier: ${tier}`)
  return true
}

// Main handler
serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Get the signature from headers
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  // Get the raw body
  const body = await req.text()

  // Verify the webhook signature
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  console.log(`Received event: ${event.type}`)

  // Handle the event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const priceId = subscription.items.data[0]?.price?.id

        if (!priceId) {
          console.error('No price ID in subscription')
          break
        }

        // Only update if subscription is active
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          const tier = getTierFromPriceId(priceId)
          await updateUserTier(customerId, tier)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        // Downgrade to 'none' when subscription is cancelled
        await updateUserTier(customerId, 'none')
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        
        // Log the failure - could trigger a notification to user
        console.log(`Payment failed for customer: ${customerId}`)
        // Optionally downgrade or send notification
        break
      }

      case 'checkout.session.completed': {
        // Handle one-time checkout completion
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        
        if (session.mode === 'subscription' && customerId) {
          console.log(`Checkout completed for customer: ${customerId}`)
          // Subscription events will handle the tier update
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
    // Return 200 anyway to prevent Stripe retries for processing errors
  }

  // Always return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
