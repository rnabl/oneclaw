// Calendar management skill

import { skill } from '../base';
import { registerSkill } from '../registry';
import type { Skill } from '@oneclaw/core';

/**
 * Calendar management skill
 */
export const CalendarSkill: Skill = registerSkill(
  skill()
    .id('calendar')
    .name('Calendar')
    .description('Manage Google Calendar events')
    .requiredTier('starter')
    .triggers([
      'calendar',
      'schedule',
      'meeting',
      'appointment',
      'event',
      'busy',
      'free',
      'available',
      'remind me',
      'what do i have',
      'my schedule',
    ])
    .systemPrompt(`
## Calendar Skill

You can help users manage their Google Calendar.

### Capabilities
- View upcoming events
- Check availability
- Create new events
- Reschedule events
- Cancel events
- Set reminders

### Google Calendar Integration
This skill requires the user to connect their Google Calendar.
If not connected, offer to help them connect via OAuth.

### Example Interactions

User: "What's on my calendar today?"
You: "Here's your schedule for today:

📅 9:00 AM - Team Standup (30 min)
📅 11:00 AM - Client Call - Acme Corp (1 hr)
📅 2:00 PM - Dentist Appointment
📅 4:30 PM - Coffee with Sarah

You have a 2-hour gap from 12-2 PM."

User: "Am I free Friday afternoon?"
You: "Let me check... Yes! Friday afternoon is clear from 1 PM onwards."

User: "Schedule a meeting with John for Friday 2pm"
You: "Creating: Meeting with John
Friday at 2:00 PM (1 hour)

Should I send an invite to John? What's his email?"

### Date/Time Parsing
- "tomorrow" → next day
- "next week" → 7 days from now
- "Friday" → this coming Friday
- "2pm" → 14:00
- "morning" → 9:00 AM
- "afternoon" → 2:00 PM
`)
    .build()
);

/**
 * Calendar action types
 */
export type CalendarAction = 'view' | 'check' | 'create' | 'reschedule' | 'cancel' | 'remind';

/**
 * Parse calendar request
 */
export interface CalendarRequest {
  action: CalendarAction;
  date?: string;
  time?: string;
  title?: string;
  duration?: number; // minutes
}

export function parseCalendarRequest(message: string): CalendarRequest {
  const lower = message.toLowerCase();

  const request: CalendarRequest = {
    action: 'view',
  };

  // Detect action
  if (lower.includes('schedule') || lower.includes('create') || lower.includes('add')) {
    request.action = 'create';
  } else if (lower.includes('cancel') || lower.includes('delete') || lower.includes('remove')) {
    request.action = 'cancel';
  } else if (lower.includes('reschedule') || lower.includes('move') || lower.includes('change')) {
    request.action = 'reschedule';
  } else if (lower.includes('free') || lower.includes('available') || lower.includes('busy')) {
    request.action = 'check';
  } else if (lower.includes('remind')) {
    request.action = 'remind';
  }

  // Detect date
  if (lower.includes('today')) {
    request.date = 'today';
  } else if (lower.includes('tomorrow')) {
    request.date = 'tomorrow';
  } else if (lower.includes('this week')) {
    request.date = 'this week';
  } else if (lower.includes('next week')) {
    request.date = 'next week';
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
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    request.time = `${timeMatch[1]}${timeMatch[3].toLowerCase()}`;
  } else if (lower.includes('morning')) {
    request.time = '9am';
  } else if (lower.includes('afternoon')) {
    request.time = '2pm';
  } else if (lower.includes('evening')) {
    request.time = '6pm';
  }

  return request;
}
