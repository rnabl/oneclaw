// Base skill class and interfaces

import type { Skill, SkillHandler, SkillResponse, ConversationContext, UserTier } from '@oneclaw/core';

/**
 * Abstract base class for skills
 */
export abstract class BaseSkill implements Skill {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract requiredTier: UserTier;
  abstract systemPrompt: string;
  triggers?: string[];
  handler?: SkillHandler;

  /**
   * Check if a message matches this skill's triggers
   */
  matches(message: string): boolean {
    if (!this.triggers || this.triggers.length === 0) {
      return false;
    }

    const lowerMessage = message.toLowerCase();
    return this.triggers.some((trigger) => lowerMessage.includes(trigger.toLowerCase()));
  }

  /**
   * Check if user has access to this skill
   */
  canAccess(userTier: UserTier): boolean {
    const tierOrder: UserTier[] = ['none', 'starter', 'pro'];
    return tierOrder.indexOf(userTier) >= tierOrder.indexOf(this.requiredTier);
  }

  /**
   * Execute the skill's handler if it exists
   */
  async execute(
    context: ConversationContext,
    params: Record<string, unknown> = {}
  ): Promise<SkillResponse | null> {
    if (!this.handler) {
      return null;
    }

    return this.handler(context, params);
  }
}

/**
 * Create a simple skill from configuration
 */
export function createSkill(config: Skill): Skill {
  return {
    ...config,
    triggers: config.triggers || [],
  };
}

/**
 * Skill builder for fluent API
 */
export class SkillBuilder {
  private skill: Partial<Skill> = {};

  id(id: string): this {
    this.skill.id = id;
    return this;
  }

  name(name: string): this {
    this.skill.name = name;
    return this;
  }

  description(description: string): this {
    this.skill.description = description;
    return this;
  }

  requiredTier(tier: UserTier): this {
    this.skill.requiredTier = tier;
    return this;
  }

  systemPrompt(prompt: string): this {
    this.skill.systemPrompt = prompt;
    return this;
  }

  triggers(triggers: string[]): this {
    this.skill.triggers = triggers;
    return this;
  }

  handler(handler: SkillHandler): this {
    this.skill.handler = handler;
    return this;
  }

  build(): Skill {
    if (!this.skill.id || !this.skill.name || !this.skill.systemPrompt) {
      throw new Error('Skill requires id, name, and systemPrompt');
    }

    return {
      id: this.skill.id,
      name: this.skill.name,
      description: this.skill.description || '',
      requiredTier: this.skill.requiredTier || 'starter',
      systemPrompt: this.skill.systemPrompt,
      triggers: this.skill.triggers || [],
      handler: this.skill.handler,
    };
  }
}

/**
 * Start building a new skill
 */
export function skill(): SkillBuilder {
  return new SkillBuilder();
}
