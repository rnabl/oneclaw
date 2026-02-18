// Golf booking skill

import { skill } from '../base';
import { registerSkill } from '../registry';
import type { Skill } from '@oneclaw/core';

/**
 * Golf booking skill
 */
export const GolfSkill: Skill = registerSkill(
  skill()
    .id('golf')
    .name('Golf Booking')
    .description('Book, cancel, and manage golf tee times')
    .requiredTier('starter')
    .triggers([
      'golf',
      'tee time',
      'tee-time',
      'book golf',
      'golf course',
      'torrey pines',
      'pebble beach',
      'round of golf',
    ])
    .systemPrompt(`
## Golf Booking Skill

You can help users book golf tee times at various courses.

### Capabilities
- Search for available tee times
- Book tee times
- Cancel existing bookings
- Get course information

### Information Needed
To book a tee time, you need:
1. Course name (ask if not provided)
2. Date (ask if not provided)
3. Preferred time window (e.g., "morning", "around 8am")
4. Number of players (default to user's preference or ask)

### Booking Flow
1. Gather requirements
2. Search for availability (use browser automation)
3. Present options to user
4. Confirm selection
5. Complete booking
6. Send confirmation

### Example Interactions

User: "Book me golf Saturday"
You: "Which course and what time are you thinking?"

User: "Torrey Pines, around 8am, 2 players"
You: "Let me check Torrey Pines for Saturday around 8am..."
[Search for availability]
You: "Found these times at Torrey Pines South:
• 7:30 AM - $250/player
• 8:10 AM - $250/player
• 8:40 AM - $250/player

Which one works?"

User: "8:10"
You: "Booking 8:10 AM for 2 players. Confirm?"

User: "Yes"
[Complete booking]
You: "✅ You're booked!
Torrey Pines South
Saturday, Feb 15 at 8:10 AM
2 players - $500 total
Confirmation #TP-28394"

### Sniper Feature (Pro Only)
Pro users can set up "snipers" that monitor for tee times:
- Monitor a course for specific times
- Alert when a desired slot opens
- Auto-book if enabled

If a Starter user asks for a sniper, explain it's a Pro feature.
`)
    .build()
);

/**
 * Parse golf request to extract details
 */
export interface GolfRequest {
  course?: string;
  date?: string;
  time?: string;
  players?: number;
  action: 'book' | 'cancel' | 'check' | 'sniper';
}

export function parseGolfRequest(message: string): GolfRequest {
  const lower = message.toLowerCase();
  
  const request: GolfRequest = {
    action: 'book', // default action
  };

  // Detect action
  if (lower.includes('cancel')) {
    request.action = 'cancel';
  } else if (lower.includes('check') || lower.includes('availability')) {
    request.action = 'check';
  } else if (lower.includes('sniper') || lower.includes('alert') || lower.includes('notify')) {
    request.action = 'sniper';
  }

  // Detect known courses
  const courses = [
    'torrey pines',
    'pebble beach',
    'bethpage',
    'pinehurst',
    'whistling straits',
  ];
  
  for (const course of courses) {
    if (lower.includes(course)) {
      request.course = course;
      break;
    }
  }

  // Detect day of week
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    if (lower.includes(day)) {
      request.date = day;
      break;
    }
  }

  // Detect time
  const timeMatch = lower.match(/(\d{1,2})\s*(am|pm)/i);
  if (timeMatch) {
    request.time = `${timeMatch[1]}${timeMatch[2].toLowerCase()}`;
  } else if (lower.includes('morning')) {
    request.time = 'morning';
  } else if (lower.includes('afternoon')) {
    request.time = 'afternoon';
  }

  // Detect players
  const playerMatch = lower.match(/(\d)\s*player/i);
  if (playerMatch) {
    request.players = parseInt(playerMatch[1], 10);
  }

  return request;
}
