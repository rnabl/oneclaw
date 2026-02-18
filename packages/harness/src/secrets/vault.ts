/**
 * Secrets Vault
 * 
 * Encrypted storage for tenant API keys and credentials.
 * Supports multiple storage backends (SQLite for self-hosted, Supabase for cloud).
 * 
 * Security Model:
 * - Secrets encrypted with AES-256-GCM
 * - Master key derived from tenant password or session token
 * - Secrets scoped to specific tools
 * - Optional expiration for session delegation
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface StoredSecret {
  id: string;
  tenantId: string;
  provider: string;         // 'apify', 'dataforseo', etc
  encryptedKey: string;     // AES-256-GCM encrypted
  iv: string;               // Initialization vector (base64)
  authTag: string;          // Authentication tag (base64)
  scopes: string[];         // Which tools can access this ['audit-website', '*']
  expiresAt?: Date;         // For session delegation
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretInput {
  provider: string;
  plaintext: string;
  scopes?: string[];        // Default: ['*'] (all tools)
  expiresAt?: Date;
}

export interface VaultConfig {
  // Storage backend
  storage: 'memory' | 'sqlite' | 'supabase';
  
  // For SQLite
  sqlitePath?: string;
  
  // For Supabase
  supabaseUrl?: string;
  supabaseKey?: string;
}

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;  // 256 bits
const IV_LENGTH = 16;   // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derive encryption key from password/passphrase
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generate a random salt
 */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/**
 * Hash tenant ID to create a deterministic salt
 * (So user doesn't need to store salt separately)
 */
export function tenantSalt(tenantId: string, pepper: string): Buffer {
  const hash = createHash('sha256');
  hash.update(tenantId + pepper);
  return hash.digest();
}

/**
 * Encrypt plaintext with AES-256-GCM
 */
export function encrypt(plaintext: string, key: Buffer): { encrypted: string; iv: string; authTag: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
export function decrypt(encrypted: string, iv: string, authTag: string, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// =============================================================================
// VAULT STORAGE INTERFACE
// =============================================================================

interface VaultStorage {
  save(secret: StoredSecret): Promise<void>;
  get(tenantId: string, provider: string): Promise<StoredSecret | null>;
  list(tenantId: string): Promise<StoredSecret[]>;
  delete(tenantId: string, provider: string): Promise<void>;
  deleteAll(tenantId: string): Promise<void>;
}

// =============================================================================
// IN-MEMORY STORAGE (for testing / local dev)
// =============================================================================

class MemoryVaultStorage implements VaultStorage {
  private secrets: Map<string, StoredSecret> = new Map();

  private key(tenantId: string, provider: string): string {
    return `${tenantId}:${provider}`;
  }

  async save(secret: StoredSecret): Promise<void> {
    this.secrets.set(this.key(secret.tenantId, secret.provider), secret);
  }

  async get(tenantId: string, provider: string): Promise<StoredSecret | null> {
    return this.secrets.get(this.key(tenantId, provider)) || null;
  }

  async list(tenantId: string): Promise<StoredSecret[]> {
    return Array.from(this.secrets.values()).filter(s => s.tenantId === tenantId);
  }

  async delete(tenantId: string, provider: string): Promise<void> {
    this.secrets.delete(this.key(tenantId, provider));
  }

  async deleteAll(tenantId: string): Promise<void> {
    for (const [key, secret] of this.secrets) {
      if (secret.tenantId === tenantId) {
        this.secrets.delete(key);
      }
    }
  }
}

// =============================================================================
// VAULT CLASS
// =============================================================================

export class SecretsVault {
  private storage: VaultStorage;
  private pepper: string;  // Server-side secret mixed into key derivation

  constructor(config: VaultConfig, pepper: string = 'iclaw-default-pepper-change-me') {
    this.pepper = pepper;
    
    switch (config.storage) {
      case 'memory':
        this.storage = new MemoryVaultStorage();
        break;
      case 'sqlite':
        // TODO: Implement SQLite storage
        console.warn('[Vault] SQLite not implemented, using memory');
        this.storage = new MemoryVaultStorage();
        break;
      case 'supabase':
        // TODO: Implement Supabase storage
        console.warn('[Vault] Supabase not implemented, using memory');
        this.storage = new MemoryVaultStorage();
        break;
      default:
        this.storage = new MemoryVaultStorage();
    }
  }

  /**
   * Store a secret for a tenant
   * 
   * @param tenantId - Tenant identifier
   * @param masterKey - Derived from tenant's password or session
   * @param input - Secret to store
   */
  async store(tenantId: string, masterKey: Buffer, input: SecretInput): Promise<void> {
    const { encrypted, iv, authTag } = encrypt(input.plaintext, masterKey);
    
    const secret: StoredSecret = {
      id: `${tenantId}:${input.provider}:${Date.now()}`,
      tenantId,
      provider: input.provider,
      encryptedKey: encrypted,
      iv,
      authTag,
      scopes: input.scopes || ['*'],
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await this.storage.save(secret);
    console.log(`[Vault] Stored secret for ${tenantId}:${input.provider}`);
  }

  /**
   * Retrieve and decrypt a secret
   * 
   * @param tenantId - Tenant identifier
   * @param provider - Secret provider (e.g., 'apify')
   * @param masterKey - Derived from tenant's password or session
   * @param forTool - Tool ID requesting the secret (for scope validation)
   */
  async retrieve(
    tenantId: string,
    provider: string,
    masterKey: Buffer,
    forTool?: string
  ): Promise<string | null> {
    const stored = await this.storage.get(tenantId, provider);
    
    if (!stored) {
      return null;
    }
    
    // Check expiration
    if (stored.expiresAt && new Date() > stored.expiresAt) {
      console.warn(`[Vault] Secret expired: ${tenantId}:${provider}`);
      await this.storage.delete(tenantId, provider);
      return null;
    }
    
    // Check scope
    if (forTool && !this.isInScope(stored.scopes, forTool)) {
      console.warn(`[Vault] Tool ${forTool} not in scope for secret ${provider}`);
      return null;
    }
    
    try {
      const decrypted = decrypt(stored.encryptedKey, stored.iv, stored.authTag, masterKey);
      return decrypted;
    } catch (error) {
      console.error(`[Vault] Decryption failed for ${tenantId}:${provider}`, error);
      return null;
    }
  }

  /**
   * Check if a tool is allowed to access a secret
   */
  private isInScope(scopes: string[], toolId: string): boolean {
    return scopes.includes('*') || scopes.includes(toolId);
  }

  /**
   * List all secrets for a tenant (metadata only, not decrypted)
   */
  async list(tenantId: string): Promise<Array<{ provider: string; scopes: string[]; expiresAt?: Date }>> {
    const secrets = await this.storage.list(tenantId);
    return secrets.map(s => ({
      provider: s.provider,
      scopes: s.scopes,
      expiresAt: s.expiresAt,
    }));
  }

  /**
   * Delete a secret
   */
  async delete(tenantId: string, provider: string): Promise<void> {
    await this.storage.delete(tenantId, provider);
    console.log(`[Vault] Deleted secret: ${tenantId}:${provider}`);
  }

  /**
   * Delete all secrets for a tenant
   */
  async deleteAll(tenantId: string): Promise<void> {
    await this.storage.deleteAll(tenantId);
    console.log(`[Vault] Deleted all secrets for tenant: ${tenantId}`);
  }

  /**
   * Create a session key (like wallet session delegation)
   * 
   * User unlocks vault with password, gets a time-limited session key.
   * Session key can be used for subsequent requests without re-entering password.
   */
  async createSessionKey(
    tenantId: string,
    password: string,
    expiresInMs: number = 3600000  // 1 hour default
  ): Promise<{ sessionKey: string; expiresAt: Date }> {
    // Derive master key from password
    const salt = tenantSalt(tenantId, this.pepper);
    const masterKey = deriveKey(password, salt);
    
    // Create session key (master key + expiration encrypted with itself)
    const expiresAt = new Date(Date.now() + expiresInMs);
    const sessionData = JSON.stringify({
      masterKey: masterKey.toString('base64'),
      expiresAt: expiresAt.toISOString(),
    });
    
    // Encrypt session data with a session salt
    const sessionSalt = randomBytes(16);
    const sessionEncryptKey = deriveKey(tenantId + this.pepper, sessionSalt);
    const { encrypted, iv, authTag } = encrypt(sessionData, sessionEncryptKey);
    
    // Session key format: salt:iv:authTag:encrypted (all base64)
    const sessionKey = [
      sessionSalt.toString('base64'),
      iv,
      authTag,
      encrypted,
    ].join(':');
    
    return { sessionKey, expiresAt };
  }

  /**
   * Derive master key from session key
   * Returns null if session expired or invalid
   */
  async unlockWithSession(tenantId: string, sessionKey: string): Promise<Buffer | null> {
    try {
      const [saltB64, iv, authTag, encrypted] = sessionKey.split(':');
      const sessionSalt = Buffer.from(saltB64, 'base64');
      const sessionEncryptKey = deriveKey(tenantId + this.pepper, sessionSalt);
      
      const sessionData = decrypt(encrypted, iv, authTag, sessionEncryptKey);
      const { masterKey, expiresAt } = JSON.parse(sessionData);
      
      // Check expiration
      if (new Date() > new Date(expiresAt)) {
        console.warn('[Vault] Session expired');
        return null;
      }
      
      return Buffer.from(masterKey, 'base64');
    } catch (error) {
      console.error('[Vault] Invalid session key', error);
      return null;
    }
  }

  /**
   * Derive master key from password (direct unlock)
   */
  deriveKeyFromPassword(tenantId: string, password: string): Buffer {
    const salt = tenantSalt(tenantId, this.pepper);
    return deriveKey(password, salt);
  }
}

// =============================================================================
// SINGLETON (for simple usage)
// =============================================================================

export const vault = new SecretsVault({ storage: 'memory' });
