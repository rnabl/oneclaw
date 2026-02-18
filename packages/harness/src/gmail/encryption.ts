/**
 * Token Encryption Module
 * 
 * Encrypts sensitive OAuth tokens before storing in database.
 * Uses AES-256-GCM (authenticated encryption) for security.
 * 
 * Security Features:
 * - AES-256-GCM: Industry-standard authenticated encryption
 * - Random IV per encryption: Prevents pattern analysis
 * - Auth tag validation: Detects tampering
 * - Base64 encoding: Safe for database storage
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment
 * Must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable not set');
  }
  
  // Decode from base64
  const keyBuffer = Buffer.from(key, 'base64');
  
  if (keyBuffer.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded');
  }
  
  return keyBuffer;
}

/**
 * Encrypt a token using AES-256-GCM
 * 
 * Output format (base64): [IV:16][AuthTag:16][EncryptedData]
 * 
 * @param token - Plain text token to encrypt
 * @returns Base64-encoded encrypted token
 */
export function encryptToken(token: string): string {
  if (!token) {
    throw new Error('Token cannot be empty');
  }
  
  const key = getEncryptionKey();
  
  // Generate random IV (initialization vector)
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the token
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  
  // Get authentication tag (for tamper detection)
  const authTag = cipher.getAuthTag();
  
  // Combine: IV + AuthTag + EncryptedData
  const combined = Buffer.concat([iv, authTag, encrypted]);
  
  // Return as base64 string
  return combined.toString('base64');
}

/**
 * Decrypt a token using AES-256-GCM
 * 
 * @param encryptedToken - Base64-encoded encrypted token
 * @returns Plain text token
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    throw new Error('Encrypted token cannot be empty');
  }
  
  const key = getEncryptionKey();
  
  // Decode from base64
  const buffer = Buffer.from(encryptedToken, 'base64');
  
  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted token format');
  }
  
  // Extract components
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  try {
    // Decrypt the token
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Auth tag validation failed or decryption error
    throw new Error('Failed to decrypt token: Token may be corrupted or tampered with');
  }
}

/**
 * Generate a new encryption key (for initial setup)
 * 
 * Usage:
 * ```bash
 * node -e "console.log(require('./encryption').generateEncryptionKey())"
 * ```
 * 
 * @returns Base64-encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  const key = randomBytes(32); // 256 bits
  return key.toString('base64');
}

/**
 * Test encryption/decryption round-trip
 * Used for validation during deployment
 */
export function testEncryption(): boolean {
  try {
    const testToken = 'ya29.test-token-12345';
    const encrypted = encryptToken(testToken);
    const decrypted = decryptToken(encrypted);
    
    if (decrypted !== testToken) {
      console.error('Encryption test failed: Round-trip mismatch');
      return false;
    }
    
    console.log('✅ Encryption test passed');
    return true;
  } catch (error) {
    console.error('❌ Encryption test failed:', error);
    return false;
  }
}
