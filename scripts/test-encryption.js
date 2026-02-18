#!/usr/bin/env node

/**
 * Test Encryption Setup
 * 
 * This script tests the token encryption system and helps with initial setup.
 * 
 * Usage:
 *   # Generate a new encryption key
 *   node scripts/test-encryption.js --generate-key
 * 
 *   # Test encryption with existing key
 *   TOKEN_ENCRYPTION_KEY=<your-key> node scripts/test-encryption.js --test
 * 
 *   # Full test suite
 *   TOKEN_ENCRYPTION_KEY=<your-key> node scripts/test-encryption.js --full
 */

import { generateEncryptionKey, encryptToken, decryptToken, testEncryption } from '../packages/harness/src/gmail/encryption.js';

const args = process.argv.slice(2);

if (args.includes('--generate-key')) {
  console.log('\n🔑 Generating new encryption key...\n');
  const key = generateEncryptionKey();
  console.log('Add this to your .env.local file:');
  console.log('━'.repeat(60));
  console.log(`TOKEN_ENCRYPTION_KEY=${key}`);
  console.log('━'.repeat(60));
  console.log('\n⚠️  Keep this key secure! Store it in a secret manager for production.\n');
  process.exit(0);
}

if (args.includes('--test') || args.includes('--full')) {
  console.log('\n🧪 Testing token encryption...\n');
  
  try {
    // Basic round-trip test
    const testPassed = testEncryption();
    
    if (!testPassed) {
      console.error('❌ Basic encryption test failed!');
      process.exit(1);
    }
    
    if (args.includes('--full')) {
      console.log('\n🔬 Running full test suite...\n');
      
      // Test 1: Empty string
      try {
        encryptToken('');
        console.error('❌ Should reject empty string');
        process.exit(1);
      } catch (error) {
        console.log('✅ Correctly rejects empty string');
      }
      
      // Test 2: Long token
      const longToken = 'ya29.' + 'a'.repeat(1000);
      const encrypted = encryptToken(longToken);
      const decrypted = decryptToken(encrypted);
      if (decrypted === longToken) {
        console.log('✅ Handles long tokens (1000+ chars)');
      } else {
        console.error('❌ Failed to handle long token');
        process.exit(1);
      }
      
      // Test 3: Special characters
      const specialToken = 'ya29.特殊文字-éàü_!@#$%^&*()';
      const encrypted2 = encryptToken(specialToken);
      const decrypted2 = decryptToken(encrypted2);
      if (decrypted2 === specialToken) {
        console.log('✅ Handles special characters');
      } else {
        console.error('❌ Failed to handle special characters');
        process.exit(1);
      }
      
      // Test 4: Tamper detection
      try {
        const encrypted3 = encryptToken('test');
        const tampered = encrypted3.slice(0, -5) + 'XXXXX';
        decryptToken(tampered);
        console.error('❌ Failed to detect tampering');
        process.exit(1);
      } catch (error) {
        console.log('✅ Detects tampered data');
      }
      
      // Test 5: Different inputs produce different outputs
      const token1 = encryptToken('same-token');
      const token2 = encryptToken('same-token');
      if (token1 !== token2) {
        console.log('✅ Random IV ensures unique ciphertexts');
      } else {
        console.error('❌ WARNING: Same plaintext produces same ciphertext!');
        process.exit(1);
      }
      
      console.log('\n🎉 All tests passed!\n');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Encryption test failed:');
    console.error(error.message);
    console.error('\nMake sure TOKEN_ENCRYPTION_KEY is set in your environment.\n');
    process.exit(1);
  }
}

// Default: Show usage
console.log(`
Token Encryption Test Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  --generate-key    Generate a new encryption key
  --test            Run basic encryption test
  --full            Run full test suite

Examples:
  # Generate key
  node scripts/test-encryption.js --generate-key

  # Test encryption
  TOKEN_ENCRYPTION_KEY=<key> node scripts/test-encryption.js --test

  # Full test suite
  TOKEN_ENCRYPTION_KEY=<key> node scripts/test-encryption.js --full
`);
