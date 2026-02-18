// OneClaw Universal Workflow API
// Framework-agnostic endpoint that any orchestrator can call
// Supports: OpenClaw, ZeroClaw, IronClaw, LangGraph, CrewAI, custom

import type { Context } from 'hono';

// Workflow handlers
import { handleAuditWorkflow } from '../workflows/audit';
import { handleDiscoveryWorkflow } from '../workflows/discovery';

// Billing & Pricing
import {
  calculatePrice,
  getWallet,
  loadWallet,
  charge,
  refund,
  canAfford,
  formatCents,
  getMarketplaceWorkflows,
  WORKFLOW_PRICES,
  TOP_UP_PACKAGES,
} from '@oneclaw/harness';

// Types
export interface WorkflowRequest {
  workflow: 'audit' | 'discovery' | 'analyze' | 'book-golf';
  params: Record<string, unknown>;
  iclaw_key?: string;
  user_id?: string; // Discord ID, phone number, etc.
  quantity?: number; // For bulk pricing (analyze)
}

export interface WorkflowResponse {
  status: 'success' | 'error' | 'pending' | 'insufficient_balance';
  workflow: string;
  result?: Record<string, unknown>;
  error?: string;
  price_cents?: number;
  price_formatted?: string;
  balance_after_cents?: number;
  balance_after_formatted?: string;
  job_id?: string;
}

/**
 * Validate API key or user ID
 */
async function validateAuth(
  iclaw_key?: string,
  user_id?: string
): Promise<{ valid: boolean; userId?: string }> {
  // Master key for testing
  const masterKey = process.env.ICLAW_MASTER_KEY;
  if (masterKey && iclaw_key === masterKey) {
    return { valid: true, userId: 'master' };
  }

  // Valid API keys from env
  const validKeys = (process.env.ICLAW_VALID_KEYS || '').split(',').filter(Boolean);
  if (iclaw_key && validKeys.includes(iclaw_key)) {
    return { valid: true, userId: iclaw_key.slice(0, 8) };
  }

  // Discord user ID or phone number
  if (user_id) {
    return { valid: true, userId: user_id };
  }

  return { valid: false };
}

/**
 * POST /api/v1/workflow
 * Universal workflow endpoint with pricing
 */
export async function nablWorkflowHandler(c: Context): Promise<Response> {
  const startTime = Date.now();

  try {
    const body = (await c.req.json()) as WorkflowRequest;
    const { workflow, params, iclaw_key, user_id, quantity = 1 } = body;

    // Validate required fields
    if (!workflow) {
      return c.json<WorkflowResponse>(
        {
          status: 'error',
          workflow: 'unknown',
          error: 'Missing required field: workflow',
        },
        400
      );
    }

    // Validate auth
    const auth = await validateAuth(iclaw_key, user_id);
    if (!auth.valid) {
      return c.json<WorkflowResponse>(
        {
          status: 'error',
          workflow,
          error: 'Missing or invalid authentication (iclaw_key or user_id)',
        },
        401
      );
    }

    const userId = auth.userId!;

    // Map workflow to pricing ID
    const pricingId = mapWorkflowToPricingId(workflow);
    if (!pricingId || !WORKFLOW_PRICES[pricingId]) {
      return c.json<WorkflowResponse>(
        {
          status: 'error',
          workflow,
          error: `Unknown workflow: ${workflow}`,
        },
        400
      );
    }

    // Get user wallet from Supabase (creates if doesn't exist)
    const wallet = await loadWallet(userId);

    // Calculate price
    const price = calculatePrice(pricingId, quantity, wallet.tier);

    console.log(
      `[workflow] ${workflow} for ${userId}: ${price.finalPriceFormatted} (qty: ${quantity})`
    );

    // Check balance (skip for master key)
    if (userId !== 'master' && !canAfford(wallet, price.finalPriceCents)) {
      return c.json<WorkflowResponse>(
        {
          status: 'insufficient_balance',
          workflow,
          error: `Insufficient balance. Required: ${price.finalPriceFormatted}, Available: ${formatCents(wallet.balanceCents)}`,
          price_cents: price.finalPriceCents,
          price_formatted: price.finalPriceFormatted,
          balance_after_cents: wallet.balanceCents,
          balance_after_formatted: formatCents(wallet.balanceCents),
        },
        402
      );
    }

    // Charge wallet
    let chargeResult;
    if (userId !== 'master') {
      chargeResult = charge(
        userId,
        price.finalPriceCents,
        workflow,
        undefined,
        `${workflow} x${quantity}`
      );

      if (!chargeResult.success) {
        return c.json<WorkflowResponse>(
          {
            status: 'error',
            workflow,
            error: 'Failed to process payment',
          },
          500
        );
      }
    }

    console.log(`[workflow] Executing: ${workflow} for user: ${userId}`);

    // Route to workflow handler
    let result: Record<string, unknown>;

    try {
      switch (workflow) {
        case 'audit':
          result = await handleAuditWorkflow(params);
          break;

        case 'discovery':
          result = await handleDiscoveryWorkflow(params);
          break;

        case 'analyze':
          // TODO: Implement analyze workflow
          // For now, return not implemented but don't charge
          if (chargeResult) {
            refund(userId, price.finalPriceCents, workflow, 'Not yet implemented');
          }
          return c.json<WorkflowResponse>(
            {
              status: 'error',
              workflow,
              error: 'Analyze workflow coming soon',
            },
            501
          );

        case 'book-golf':
          // TODO: Implement golf workflow
          if (chargeResult) {
            refund(userId, price.finalPriceCents, workflow, 'Not yet implemented');
          }
          return c.json<WorkflowResponse>(
            {
              status: 'error',
              workflow,
              error: 'Golf booking workflow coming soon',
            },
            501
          );

        default:
          if (chargeResult) {
            refund(userId, price.finalPriceCents, workflow, 'Unknown workflow');
          }
          return c.json<WorkflowResponse>(
            {
              status: 'error',
              workflow,
              error: `Unknown workflow: ${workflow}`,
            },
            400
          );
      }
    } catch (error) {
      // Refund on failure
      if (chargeResult) {
        refund(
          userId,
          price.finalPriceCents,
          workflow,
          error instanceof Error ? error.message : 'Workflow failed'
        );
      }
      throw error;
    }

    const duration = Date.now() - startTime;
    console.log(`[workflow] ${workflow} completed in ${duration}ms`);

    // Reload wallet to get updated balance after charge
    const updatedWallet = await loadWallet(userId);

    return c.json<WorkflowResponse>({
      status: 'success',
      workflow,
      result,
      price_cents: price.finalPriceCents,
      price_formatted: price.finalPriceFormatted,
      balance_after_cents: updatedWallet.balanceCents,
      balance_after_formatted: formatCents(updatedWallet.balanceCents),
    });
  } catch (error) {
    console.error('[workflow] Error:', error);

    return c.json<WorkflowResponse>(
      {
        status: 'error',
        workflow: 'unknown',
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
}

/**
 * Map workflow names to pricing IDs
 */
function mapWorkflowToPricingId(workflow: string): string | null {
  const map: Record<string, string> = {
    audit: 'audit',
    discovery: 'discover',
    discover: 'discover',
    analyze: 'analyze',
    'book-golf': 'golf-search',
    golf: 'golf-search',
  };
  return map[workflow] || null;
}

/**
 * GET /api/v1/workflows
 * List available workflows with pricing
 */
export async function listWorkflowsHandler(c: Context): Promise<Response> {
  // Get user tier from query param (or default to free)
  const tier = (c.req.query('tier') as string) || 'free';

  const workflows = getMarketplaceWorkflows(tier);

  return c.json({
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      category: w.category,
      price: w.price,
      price_cents: w.priceCents,
      bulk_options: w.bulkOptions,
    })),
    top_up_packages: TOP_UP_PACKAGES.map((p) => ({
      id: p.id,
      amount: p.label,
      amount_cents: p.amountCents,
      bonus_percent: p.bonus,
    })),
  });
}

/**
 * GET /api/v1/wallet
 * Get user wallet balance
 */
export async function getWalletHandler(c: Context): Promise<Response> {
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json({ error: 'Missing user_id' }, 400);
  }

  // Load from Supabase (creates wallet if doesn't exist)
  const wallet = await loadWallet(userId);

  return c.json({
    user_id: wallet.userId,
    balance_cents: wallet.balanceCents,
    balance_formatted: formatCents(wallet.balanceCents),
    tier: wallet.tier,
    lifetime_spent_cents: wallet.lifetimeSpentCents,
    lifetime_topup_cents: wallet.lifetimeTopUpCents,
  });
}

/**
 * POST /api/v1/wallet/topup
 * Add funds to wallet (called after Stripe payment)
 */
export async function topUpWalletHandler(c: Context): Promise<Response> {
  const { user_id, amount_cents, stripe_payment_id } = await c.req.json();

  if (!user_id || !amount_cents) {
    return c.json({ error: 'Missing user_id or amount_cents' }, 400);
  }

  // Import here to avoid circular dependency
  const { topUp } = await import('@oneclaw/harness');

  const transaction = topUp(user_id, amount_cents, stripe_payment_id);
  const wallet = getWallet(user_id);

  return c.json({
    success: true,
    transaction_id: transaction.id,
    amount_added_cents: amount_cents,
    amount_added_formatted: formatCents(amount_cents),
    balance_cents: wallet.balanceCents,
    balance_formatted: formatCents(wallet.balanceCents),
  });
}

/**
 * GET /api/v1/price
 * Calculate price for a workflow
 */
export async function getPriceHandler(c: Context): Promise<Response> {
  const workflow = c.req.query('workflow');
  const quantity = parseInt(c.req.query('quantity') || '1', 10);
  const tier = c.req.query('tier') || 'free';

  if (!workflow) {
    return c.json({ error: 'Missing workflow' }, 400);
  }

  const pricingId = mapWorkflowToPricingId(workflow);
  if (!pricingId) {
    return c.json({ error: `Unknown workflow: ${workflow}` }, 400);
  }

  try {
    const price = calculatePrice(pricingId, quantity, tier);
    return c.json(price);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Price calculation failed' },
      400
    );
  }
}
