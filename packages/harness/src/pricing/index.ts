/**
 * OneClaw Pricing System
 * 
 * Simple, value-based pricing for workflows.
 * All prices in cents to avoid floating point issues.
 */

// =============================================================================
// PRICING CONFIGURATION
// =============================================================================

export interface WorkflowPrice {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  bulkPricing?: BulkTier[];
  category: 'lead-gen' | 'analysis' | 'audit' | 'convenience';
}

export interface BulkTier {
  quantity: number;
  priceCents: number;
  perUnitCents: number;
  savingsPercent: number;
}

// =============================================================================
// WORKFLOW PRICES
// =============================================================================

export const WORKFLOW_PRICES: Record<string, WorkflowPrice> = {
  // Lead Generation - Loss leader, get them hooked
  'discover': {
    id: 'discover',
    name: 'Discover',
    description: 'Find up to 100 businesses in any niche + location',
    basePriceCents: 100, // $1
    category: 'lead-gen',
  },
  // Alias for workflow handler name
  'discover-businesses': {
    id: 'discover-businesses',
    name: 'Discover',
    description: 'Find up to 100 businesses in any niche + location',
    basePriceCents: 100, // $1
    category: 'lead-gen',
  },

  // Analysis - Per business, bulk discounts
  'analyze': {
    id: 'analyze',
    name: 'Analyze',
    description: 'Deep research: owner, email, tech stack, signals',
    basePriceCents: 100, // $1 per business
    category: 'analysis',
    bulkPricing: [
      { quantity: 1,   priceCents: 100,   perUnitCents: 100, savingsPercent: 0 },
      { quantity: 10,  priceCents: 800,   perUnitCents: 80,  savingsPercent: 20 },
      { quantity: 50,  priceCents: 3000,  perUnitCents: 60,  savingsPercent: 40 },
      { quantity: 100, priceCents: 5000,  perUnitCents: 50,  savingsPercent: 50 },
    ],
  },
  // Alias for workflow handler name
  'analyze-business': {
    id: 'analyze-business',
    name: 'Analyze',
    description: 'Deep research: owner, email, tech stack, signals',
    basePriceCents: 100, // $1 per business
    category: 'analysis',
  },

  // Audit - Premium, high-value
  'audit': {
    id: 'audit',
    name: 'Audit',
    description: 'Full website audit + AI visibility report',
    basePriceCents: 2000, // $20
    category: 'audit',
  },
  // Alias for workflow handler name
  'audit-website': {
    id: 'audit-website',
    name: 'Audit',
    description: 'Full website audit + AI visibility report',
    basePriceCents: 2000, // $20
    category: 'audit',
  },

  // Convenience - Cheap, sticky
  'golf-search': {
    id: 'golf-search',
    name: 'Golf Tee Times',
    description: 'Find available tee times matching your criteria',
    basePriceCents: 25, // $0.25
    category: 'convenience',
  },

  'summarize': {
    id: 'summarize',
    name: 'Summarize',
    description: 'Summarize a document or meeting',
    basePriceCents: 25, // $0.25
    category: 'convenience',
  },
};

// =============================================================================
// SUBSCRIPTION TIERS & DISCOUNTS
// =============================================================================

export interface SubscriptionTier {
  id: string;
  name: string;
  monthlyPriceCents: number;
  discountPercent: number;
  features: string[];
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  'free': {
    id: 'free',
    name: 'Free',
    monthlyPriceCents: 0,
    discountPercent: 0,
    features: [
      'Shared infrastructure',
      'Pay per task',
      'Community support',
    ],
  },
  'starter': {
    id: 'starter',
    name: 'Starter',
    monthlyPriceCents: 2000, // $20/mo
    discountPercent: 20,
    features: [
      'Your own VPS instance',
      '20% off all tasks',
      'Priority support',
      'Custom workflows',
    ],
  },
  'pro': {
    id: 'pro',
    name: 'Pro',
    monthlyPriceCents: 10000, // $100/mo
    discountPercent: 50,
    features: [
      'Dedicated VPS instance',
      '50% off all tasks',
      'Dedicated support',
      'Custom workflows',
      'API access',
      'White-label option',
    ],
  },
};

// =============================================================================
// PRICING CALCULATOR
// =============================================================================

/**
 * Calculate price for a workflow
 */
export function calculatePrice(
  workflowId: string,
  quantity: number = 1,
  userTier: string = 'free'
): PriceCalculation {
  const workflow = WORKFLOW_PRICES[workflowId];
  if (!workflow) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }

  const tier = SUBSCRIPTION_TIERS[userTier] || SUBSCRIPTION_TIERS['free'];
  
  // Get base price (check bulk pricing first)
  let basePriceCents: number;
  let perUnitCents: number;
  let bulkSavingsPercent = 0;

  if (workflow.bulkPricing && quantity > 1) {
    // Find best bulk tier for this quantity
    const applicableTier = workflow.bulkPricing
      .filter(t => quantity >= t.quantity)
      .sort((a, b) => b.quantity - a.quantity)[0];

    if (applicableTier && applicableTier.quantity === quantity) {
      // Exact match
      basePriceCents = applicableTier.priceCents;
      perUnitCents = applicableTier.perUnitCents;
      bulkSavingsPercent = applicableTier.savingsPercent;
    } else if (applicableTier) {
      // Use per-unit rate from best tier
      perUnitCents = applicableTier.perUnitCents;
      basePriceCents = perUnitCents * quantity;
      bulkSavingsPercent = applicableTier.savingsPercent;
    } else {
      // No bulk tier applies
      perUnitCents = workflow.basePriceCents;
      basePriceCents = perUnitCents * quantity;
    }
  } else {
    perUnitCents = workflow.basePriceCents;
    basePriceCents = workflow.basePriceCents * quantity;
  }

  // Apply subscription discount
  const discountPercent = tier.discountPercent;
  const discountCents = Math.floor(basePriceCents * (discountPercent / 100));
  const finalPriceCents = basePriceCents - discountCents;

  return {
    workflowId,
    workflowName: workflow.name,
    quantity,
    basePriceCents,
    perUnitCents,
    bulkSavingsPercent,
    tierDiscount: {
      tier: tier.name,
      percent: discountPercent,
      amountCents: discountCents,
    },
    finalPriceCents,
    finalPriceFormatted: formatPrice(finalPriceCents),
  };
}

export interface PriceCalculation {
  workflowId: string;
  workflowName: string;
  quantity: number;
  basePriceCents: number;
  perUnitCents: number;
  bulkSavingsPercent: number;
  tierDiscount: {
    tier: string;
    percent: number;
    amountCents: number;
  };
  finalPriceCents: number;
  finalPriceFormatted: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format cents as dollars
 */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Get bulk pricing options for display
 */
export function getBulkOptions(workflowId: string, userTier: string = 'free'): BulkOption[] {
  const workflow = WORKFLOW_PRICES[workflowId];
  if (!workflow?.bulkPricing) {
    return [];
  }

  const tier = SUBSCRIPTION_TIERS[userTier] || SUBSCRIPTION_TIERS['free'];

  return workflow.bulkPricing.map(bulk => {
    const discountedPrice = Math.floor(bulk.priceCents * (1 - tier.discountPercent / 100));
    const discountedPerUnit = Math.floor(bulk.perUnitCents * (1 - tier.discountPercent / 100));

    return {
      quantity: bulk.quantity,
      priceCents: discountedPrice,
      priceFormatted: formatPrice(discountedPrice),
      perUnitCents: discountedPerUnit,
      perUnitFormatted: formatPrice(discountedPerUnit),
      savingsPercent: bulk.savingsPercent + tier.discountPercent,
      label: `${bulk.quantity} for ${formatPrice(discountedPrice)}`,
    };
  });
}

export interface BulkOption {
  quantity: number;
  priceCents: number;
  priceFormatted: string;
  perUnitCents: number;
  perUnitFormatted: string;
  savingsPercent: number;
  label: string;
}

/**
 * Get all available workflows with pricing
 */
export function getMarketplaceWorkflows(userTier: string = 'free'): MarketplaceWorkflow[] {
  return Object.values(WORKFLOW_PRICES).map(workflow => {
    const price = calculatePrice(workflow.id, 1, userTier);
    const bulkOptions = getBulkOptions(workflow.id, userTier);

    return {
      ...workflow,
      price: price.finalPriceFormatted,
      priceCents: price.finalPriceCents,
      bulkOptions,
    };
  });
}

export interface MarketplaceWorkflow extends WorkflowPrice {
  price: string;
  priceCents: number;
  bulkOptions: BulkOption[];
}
