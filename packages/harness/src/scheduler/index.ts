/**
 * Workflow Scheduler
 * 
 * Manages recurring workflow executions with cron-like scheduling.
 * Supports natural language parsing and automatic execution.
 */

import { nanoid } from 'nanoid';

export interface Schedule {
  id: string;
  name: string;
  description?: string;
  
  // Workflow details
  workflow: string;  // e.g., 'state-level-discovery'
  params: Record<string, unknown>;
  tenantId: string;
  
  // Schedule config
  cron?: string;  // Cron expression
  interval?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;  // 0-6 (Sunday-Saturday)
  timeOfDay?: string;  // HH:MM format
  
  // Status
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  lastResult?: {
    success: boolean;
    executionId?: string;
    error?: string;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleExecution {
  scheduleId: string;
  executionId: string;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Parse natural language schedule into structured format
 */
export function parseSchedule(input: string): {
  interval?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  timeOfDay?: string;
  cron?: string;
} {
  const lower = input.toLowerCase();
  
  // Parse interval
  if (lower.includes('daily') || lower.includes('every day')) {
    return { interval: 'daily', timeOfDay: extractTime(input) || '09:00' };
  }
  
  if (lower.includes('hourly') || lower.includes('every hour')) {
    return { interval: 'hourly' };
  }
  
  if (lower.includes('weekly') || lower.includes('every week')) {
    return {
      interval: 'weekly',
      dayOfWeek: extractDayOfWeek(input) || 1, // Default Monday
      timeOfDay: extractTime(input) || '09:00'
    };
  }
  
  // Parse specific day
  const dayOfWeek = extractDayOfWeek(input);
  if (dayOfWeek !== null) {
    return {
      dayOfWeek,
      timeOfDay: extractTime(input) || '09:00'
    };
  }
  
  // Default: daily at 9am
  return { interval: 'daily', timeOfDay: '09:00' };
}

/**
 * Extract time from natural language
 */
function extractTime(input: string): string | null {
  // Match patterns like "9am", "9:00am", "17:00", "5pm"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = input.match(timePattern);
  
  if (!match) return null;
  
  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  
  // Convert to 24-hour format
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Extract day of week from natural language
 */
function extractDayOfWeek(input: string): number | null {
  const lower = input.toLowerCase();
  
  if (lower.includes('sunday')) return 0;
  if (lower.includes('monday')) return 1;
  if (lower.includes('tuesday')) return 2;
  if (lower.includes('wednesday')) return 3;
  if (lower.includes('thursday')) return 4;
  if (lower.includes('friday')) return 5;
  if (lower.includes('saturday')) return 6;
  
  return null;
}

/**
 * Convert schedule to cron expression
 */
export function toCron(schedule: {
  interval?: string;
  dayOfWeek?: number;
  timeOfDay?: string;
}): string {
  const [hours = '9', minutes = '0'] = (schedule.timeOfDay || '09:00').split(':');
  
  if (schedule.interval === 'hourly') {
    return `0 * * * *`;  // Every hour
  }
  
  if (schedule.interval === 'daily') {
    return `${minutes} ${hours} * * *`;  // Every day at specified time
  }
  
  if (schedule.interval === 'weekly' && schedule.dayOfWeek !== undefined) {
    return `${minutes} ${hours} * * ${schedule.dayOfWeek}`;  // Weekly on specific day
  }
  
  if (schedule.dayOfWeek !== undefined) {
    return `${minutes} ${hours} * * ${schedule.dayOfWeek}`;  // Specific day each week
  }
  
  // Default: daily at 9am
  return `0 9 * * *`;
}

/**
 * Calculate next run time based on cron expression
 */
export function calculateNextRun(cron: string, from: Date = new Date()): Date {
  // Simple cron parser for common patterns
  // Format: minute hour day-of-month month day-of-week
  const parts = cron.split(' ');
  const [minute, hour, , , dayOfWeek] = parts.map(p => p === '*' ? null : parseInt(p));
  
  const next = new Date(from);
  
  // Set time
  if (hour !== null) next.setHours(hour);
  if (minute !== null) next.setMinutes(minute);
  next.setSeconds(0);
  next.setMilliseconds(0);
  
  // If time has passed today, move to next occurrence
  if (next <= from) {
    if (dayOfWeek !== null) {
      // Move to next occurrence of this day of week
      const daysUntil = (dayOfWeek - next.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
    } else {
      // Move to next day
      next.setDate(next.getDate() + 1);
    }
  }
  
  return next;
}

/**
 * In-memory schedule store (will be replaced with SQLite)
 */
class ScheduleStore {
  private schedules: Map<string, Schedule> = new Map();
  
  create(schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>): Schedule {
    const now = new Date();
    const cron = schedule.cron || toCron(schedule);
    
    const newSchedule: Schedule = {
      ...schedule,
      id: nanoid(),
      cron,
      nextRun: calculateNextRun(cron),
      enabled: true,
      createdAt: now,
      updatedAt: now
    };
    
    this.schedules.set(newSchedule.id, newSchedule);
    return newSchedule;
  }
  
  get(id: string): Schedule | undefined {
    return this.schedules.get(id);
  }
  
  list(tenantId?: string): Schedule[] {
    const all = Array.from(this.schedules.values());
    return tenantId ? all.filter(s => s.tenantId === tenantId) : all;
  }
  
  update(id: string, updates: Partial<Schedule>): Schedule | null {
    const schedule = this.schedules.get(id);
    if (!schedule) return null;
    
    const updated = {
      ...schedule,
      ...updates,
      updatedAt: new Date()
    };
    
    // Recalculate next run if schedule changed
    if (updates.cron || updates.interval || updates.dayOfWeek || updates.timeOfDay) {
      const cron = updated.cron || toCron(updated);
      updated.nextRun = calculateNextRun(cron);
    }
    
    this.schedules.set(id, updated);
    return updated;
  }
  
  delete(id: string): boolean {
    return this.schedules.delete(id);
  }
  
  getDue(): Schedule[] {
    const now = new Date();
    return Array.from(this.schedules.values()).filter(
      s => s.enabled && s.nextRun && s.nextRun <= now
    );
  }
}

export const scheduleStore = new ScheduleStore();
