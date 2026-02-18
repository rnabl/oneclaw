// Skill registry - manages all available skills

import type { Skill, UserTier } from '@oneclaw/core';
import { createLogger } from '@oneclaw/core';

const log = createLogger('SkillRegistry');

/**
 * Skill registry singleton
 */
class SkillRegistryClass {
  private skills: Map<string, Skill> = new Map();

  /**
   * Register a skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      log.warn(`Skill ${skill.id} already registered, overwriting`);
    }

    this.skills.set(skill.id, skill);
    log.info(`Registered skill: ${skill.id}`);
  }

  /**
   * Register multiple skills
   */
  registerAll(skills: Skill[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * Get a skill by ID
   */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all registered skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills available for a user tier
   */
  getForTier(tier: UserTier): Skill[] {
    const tierOrder: UserTier[] = ['none', 'starter', 'pro'];
    const userTierIndex = tierOrder.indexOf(tier);

    return this.getAll().filter((skill) => {
      const skillTierIndex = tierOrder.indexOf(skill.requiredTier);
      return skillTierIndex <= userTierIndex;
    });
  }

  /**
   * Find a skill that matches the given message
   */
  findMatching(message: string): Skill | undefined {
    const lowerMessage = message.toLowerCase();

    for (const skill of this.skills.values()) {
      if (!skill.triggers) continue;

      const matches = skill.triggers.some((trigger) =>
        lowerMessage.includes(trigger.toLowerCase())
      );

      if (matches) {
        return skill;
      }
    }

    return undefined;
  }

  /**
   * Find all skills that match the given message
   */
  findAllMatching(message: string): Skill[] {
    const lowerMessage = message.toLowerCase();
    const matching: Skill[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.triggers) continue;

      const matches = skill.triggers.some((trigger) =>
        lowerMessage.includes(trigger.toLowerCase())
      );

      if (matches) {
        matching.push(skill);
      }
    }

    return matching;
  }

  /**
   * Unregister a skill
   */
  unregister(id: string): boolean {
    return this.skills.delete(id);
  }

  /**
   * Clear all registered skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Get count of registered skills
   */
  get count(): number {
    return this.skills.size;
  }
}

// Export singleton instance
export const SkillRegistry = new SkillRegistryClass();

/**
 * Decorator-style function to register a skill
 */
export function registerSkill(skill: Skill): Skill {
  SkillRegistry.register(skill);
  return skill;
}
