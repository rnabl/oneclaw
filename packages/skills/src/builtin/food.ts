// Food ordering skill

import { skill } from '../base';
import { registerSkill } from '../registry';
import type { Skill } from '@oneclaw/core';

/**
 * Food ordering skill
 */
export const FoodSkill: Skill = registerSkill(
  skill()
    .id('food')
    .name('Food Ordering')
    .description('Order food from connected accounts')
    .requiredTier('starter')
    .triggers([
      'order food',
      'food',
      'hungry',
      'eat',
      'delivery',
      'doordash',
      'uber eats',
      'grubhub',
      'starbucks',
      'coffee',
      'pizza',
      'burger',
      'sushi',
      'chinese',
      'mexican',
      'thai',
    ])
    .systemPrompt(`
## Food Ordering Skill

You can help users order food from their connected accounts.

### Supported Services
- Starbucks
- DoorDash
- Uber Eats
- Pizza Hut
- Domino's
- Other services via browser automation

### Capabilities
- Order from connected accounts
- Reorder previous orders ("my usual")
- Find restaurants
- Track orders

### Account Connection
If user doesn't have a service connected:
1. Explain you need to connect their account
2. Offer to help them log in via browser
3. Save session for future orders (secure, encrypted)

### Ordering Flow
1. Determine what they want to order
2. Check if account is connected
3. Place order via browser automation
4. Confirm order details and total
5. Complete order
6. Provide order confirmation and ETA

### Example Interactions

User: "Order my usual from Starbucks"
You: "Ordering your Grande Iced Caramel Macchiato from the Main St location. That's $6.45. Confirm?"

User: "Yes"
[Place order]
You: "✅ Order placed! Ready in ~10 minutes.
Grande Iced Caramel Macchiato
123 Main St location
$6.45"

User: "I'm hungry, get me a pizza"
You: "What sounds good? I can order from:
🍕 Pizza Hut
🍕 Domino's

Or tell me what you're craving and I'll find something."
`)
    .build()
);

/**
 * Supported food services
 */
export const FOOD_SERVICES = [
  { id: 'starbucks', name: 'Starbucks', type: 'coffee' },
  { id: 'doordash', name: 'DoorDash', type: 'delivery' },
  { id: 'ubereats', name: 'Uber Eats', type: 'delivery' },
  { id: 'pizzahut', name: 'Pizza Hut', type: 'pizza' },
  { id: 'dominos', name: "Domino's", type: 'pizza' },
  { id: 'grubhub', name: 'Grubhub', type: 'delivery' },
] as const;

export type FoodServiceId = (typeof FOOD_SERVICES)[number]['id'];

/**
 * Parse food order request
 */
export interface FoodRequest {
  service?: FoodServiceId;
  item?: string;
  action: 'order' | 'reorder' | 'track' | 'connect';
  isUsual: boolean;
}

export function parseFoodRequest(message: string): FoodRequest {
  const lower = message.toLowerCase();

  const request: FoodRequest = {
    action: 'order',
    isUsual: false,
  };

  // Check for "my usual" pattern
  if (lower.includes('usual') || lower.includes('regular') || lower.includes('same as')) {
    request.isUsual = true;
    request.action = 'reorder';
  }

  // Check for tracking
  if (lower.includes('track') || lower.includes('where is') || lower.includes('status')) {
    request.action = 'track';
  }

  // Check for connect
  if (lower.includes('connect') || lower.includes('login') || lower.includes('sign in')) {
    request.action = 'connect';
  }

  // Detect service
  for (const service of FOOD_SERVICES) {
    if (lower.includes(service.name.toLowerCase())) {
      request.service = service.id;
      break;
    }
  }

  // Detect food type to suggest service
  if (!request.service) {
    if (lower.includes('coffee') || lower.includes('latte') || lower.includes('macchiato')) {
      request.service = 'starbucks';
    } else if (lower.includes('pizza')) {
      // Don't set service, let user choose
    }
  }

  return request;
}
