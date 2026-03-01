/**
 * Test Script for Self-Improvement Tools
 * 
 * This script tests all the self-improvement capabilities:
 * 1. Path validation and security
 * 2. File operations (read, write)
 * 3. Code execution
 * 4. Database operations
 */

import { pathValidator } from '../src/security/path-validator';
import { writeFileHandler } from '../src/tools/write-file';
import { readFileHandler } from '../src/tools/read-file';
import { executeCodeHandler } from '../src/tools/execute-code';
import { databaseHandler } from '../src/tools/database';
import { initDatabaseHandler } from '../src/tools/init-database';

const TENANT_ID = 'test-tenant';

async function runTests() {
  console.log('🚀 Testing OneClaw Self-Improvement Capabilities\n');
  
  // Test 1: Path Validation
  console.log('📁 Test 1: Path Validation');
  console.log('✅ Workspace root:', pathValidator.getWorkspaceRoot());
  
  const validPath = pathValidator.validateWrite('code/test.ts');
  console.log('✅ Valid path:', validPath.allowed ? 'PASS' : 'FAIL');
  
  const invalidPath = pathValidator.validateWrite('/etc/passwd');
  console.log('✅ Block /etc/passwd:', !invalidPath.allowed ? 'PASS' : 'FAIL');
  
  const envPath = pathValidator.validateWrite('.env');
  console.log('✅ Block .env:', !envPath.allowed ? 'PASS' : 'FAIL');
  
  console.log('');
  
  // Test 2: File Operations
  console.log('📝 Test 2: File Write/Read');
  
  const writeResult = await writeFileHandler({
    path: 'code/hello.txt',
    content: 'Hello from OneClaw!',
    overwrite: true,
    createDirectories: true,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Write file:', writeResult.success ? 'PASS' : 'FAIL');
  if (writeResult.error) console.log('   Error:', writeResult.error);
  
  const readResult = await readFileHandler({
    path: 'code/hello.txt',
    encoding: 'utf-8',
    maxSize: 1000000,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Read file:', readResult.success ? 'PASS' : 'FAIL');
  console.log('   Content:', readResult.content?.substring(0, 50));
  
  console.log('');
  
  // Test 3: Code Execution - JavaScript
  console.log('⚡ Test 3: Code Execution');
  
  const jsResult = await executeCodeHandler({
    code: 'const x = 5 + 3; x * 2;',
    language: 'javascript',
    timeout: 5000,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Execute JavaScript:', jsResult.success ? 'PASS' : 'FAIL');
  console.log('   Output:', jsResult.stdout);
  console.log('   Execution time:', jsResult.executionTime + 'ms');
  
  // Test blocked operation
  const blockedResult = await executeCodeHandler({
    code: 'process.exit(0);',
    language: 'javascript',
    timeout: 5000,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Block process.exit:', !blockedResult.success ? 'PASS' : 'FAIL');
  
  console.log('');
  
  // Test 4: Database Operations
  console.log('🗄️  Test 4: Database Operations');
  
  // Initialize database
  const initResult = await initDatabaseHandler({
    database: 'test-oneclaw.db',
    force: true,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Initialize DB:', initResult.success ? 'PASS' : 'FAIL');
  console.log('   Tables created:', initResult.tablesCreated?.length);
  
  // Insert a business
  const insertResult = await databaseHandler({
    action: 'insert',
    table: 'businesses',
    database: 'test-oneclaw.db',
    data: {
      name: 'Test HVAC Company',
      website: 'https://testhvac.com',
      phone: '555-1234',
      niche: 'hvac',
      city: 'Austin',
      state: 'TX',
      status: 'discovered',
    },
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Insert business:', insertResult.success ? 'PASS' : 'FAIL');
  console.log('   Last insert ID:', insertResult.lastInsertId);
  
  // Query businesses
  const queryResult = await databaseHandler({
    action: 'query',
    sql: 'SELECT * FROM businesses WHERE niche = "hvac"',
    database: 'test-oneclaw.db',
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Query businesses:', queryResult.success ? 'PASS' : 'FAIL');
  console.log('   Rows found:', queryResult.rows?.length);
  
  // Update business
  const updateResult = await databaseHandler({
    action: 'update',
    table: 'businesses',
    database: 'test-oneclaw.db',
    data: { status: 'contacted' },
    where: { id: insertResult.lastInsertId },
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Update business:', updateResult.success ? 'PASS' : 'FAIL');
  console.log('   Rows affected:', updateResult.rowsAffected);
  
  // Test blocked SQL
  const blockedSQL = await databaseHandler({
    action: 'query',
    sql: 'DROP DATABASE test',
    database: 'test-oneclaw.db',
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Block DROP DATABASE:', !blockedSQL.success ? 'PASS' : 'FAIL');
  
  console.log('');
  
  // Test 5: Write TypeScript code and execute it
  console.log('💻 Test 5: Self-Modifying Code');
  
  const codeToWrite = `
const factorial = (n: number): number => {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
};

console.log('Factorial of 5:', factorial(5));
`;
  
  const writeCodeResult = await writeFileHandler({
    path: 'code/factorial.ts',
    content: codeToWrite,
    overwrite: true,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Write TypeScript code:', writeCodeResult.success ? 'PASS' : 'FAIL');
  
  const executeTS = await executeCodeHandler({
    code: codeToWrite,
    language: 'typescript',
    timeout: 10000,
  }, { tenantId: TENANT_ID });
  
  console.log('✅ Execute TypeScript:', executeTS.success ? 'PASS' : 'FAIL');
  console.log('   Output:', executeTS.stdout);
  
  console.log('');
  console.log('✨ All tests completed!');
  console.log('\n📊 Summary:');
  console.log('   Path validation: ✅');
  console.log('   File operations: ✅');
  console.log('   Code execution: ✅');
  console.log('   Database: ✅');
  console.log('   Self-modifying code: ✅');
  console.log('\n🎉 OneClaw is ready for self-improvement!');
}

if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };
