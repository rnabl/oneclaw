import type { ExecutorBase } from './base';

/**
 * Executor Registry - Maps executor names to implementations
 * Simple, deterministic lookup
 */
export class ExecutorRegistry {
  private static executors = new Map<string, ExecutorBase>();
  
  /**
   * Register an executor
   */
  static register(executor: ExecutorBase): void {
    if (this.executors.has(executor.name)) {
      throw new Error(`Executor ${executor.name} already registered`);
    }
    
    this.executors.set(executor.name, executor);
  }
  
  /**
   * Get executor by name
   * Returns null if not found (not an error - runtime will handle)
   */
  static get(name: string): ExecutorBase | null {
    return this.executors.get(name) || null;
  }
  
  /**
   * List all registered executors
   */
  static list(): string[] {
    return Array.from(this.executors.keys());
  }
  
  /**
   * Check if executor is registered
   */
  static has(name: string): boolean {
    return this.executors.has(name);
  }
}
