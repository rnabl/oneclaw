/**
 * Execute Code Tool - Deno Sandbox Tests
 * 
 * Validates the refactored execute-code tool using Deno instead of vm2.
 * Tests security boundaries, network controls, and proper isolation.
 */

import { describe, it, expect } from 'vitest';
import { EXECUTE_CODE_TOOL } from '../src/tools/execute-code';

const TEST_CONTEXT = { tenantId: 'test-tenant' };

describe('Execute Code Tool - Deno Sandbox', () => {
  describe('JavaScript Execution', () => {
    it('should execute simple JavaScript code', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'console.log("Hello from Deno!");',
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello from Deno!');
      expect(result.exitCode).toBe(0);
    });

    it('should handle JavaScript with basic math', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'const result = 2 + 2; console.log(result);',
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('4');
    });

    it('should timeout long-running JavaScript', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'while(true) {}',
        language: 'javascript',
        timeout: 1000,
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('TypeScript Execution', () => {
    it('should execute TypeScript with type annotations', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          const greet = (name: string): string => {
            return \`Hello, \${name}!\`;
          };
          console.log(greet("World"));
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello, World!');
    });

    it('should execute TypeScript with interfaces', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          interface User {
            name: string;
            age: number;
          }
          const user: User = { name: "Alice", age: 30 };
          console.log(JSON.stringify(user));
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Alice');
      expect(result.stdout).toContain('30');
    });
  });

  describe('Bash Execution', () => {
    it('should execute safe bash commands', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'echo "Hello from bash"',
        language: 'bash',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello from bash');
    });

    it('should block dangerous rm commands', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'rm -rf /',
        language: 'bash',
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked dangerous command');
    });

    it('should block fork bombs', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: ':(){:|:&};:',
        language: 'bash',
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked dangerous command');
    });

    it('should block .env file access', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'cat .env',
        language: 'bash',
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked dangerous command');
    });
  });

  describe('Security Boundaries', () => {
    it('should NOT have access to process.env', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            console.log(Deno.env.get("PATH"));
          } catch (e) {
            console.log("ENV_ACCESS_DENIED");
          }
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('ENV_ACCESS_DENIED');
    });

    it('should NOT have file system read access', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            await Deno.readTextFile("/etc/passwd");
          } catch (e) {
            console.log("FILE_READ_DENIED");
          }
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('FILE_READ_DENIED');
    });

    it('should NOT have file system write access', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            await Deno.writeTextFile("/tmp/test.txt", "data");
          } catch (e) {
            console.log("FILE_WRITE_DENIED");
          }
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('FILE_WRITE_DENIED');
    });

    it('should NOT have subprocess spawn access', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            const cmd = new Deno.Command("ls", { args: ["-la"] });
            await cmd.output();
          } catch (e) {
            console.log("SUBPROCESS_DENIED");
          }
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('SUBPROCESS_DENIED');
    });
  });

  describe('Network Access Controls', () => {
    it('should DENY network access by default', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            const response = await fetch("https://api.github.com");
            console.log("NETWORK_ALLOWED");
          } catch (e) {
            console.log("NETWORK_DENIED");
          }
        `,
        language: 'typescript',
        allowNet: false,
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('NETWORK_DENIED');
    });

    it('should ALLOW network access when explicitly enabled', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            const response = await fetch("https://api.github.com");
            console.log("NETWORK_ALLOWED:", response.status);
          } catch (e) {
            console.log("NETWORK_DENIED:", e.message);
          }
        `,
        language: 'typescript',
        allowNet: true,
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('NETWORK_ALLOWED');
    }, 10000); // 10s timeout for real network call

    it('should restrict network to specific domains', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            const response = await fetch("https://api.github.com");
            console.log("GITHUB_ALLOWED:", response.status);
          } catch (e) {
            console.log("GITHUB_DENIED");
          }
        `,
        language: 'typescript',
        allowNet: true,
        allowedDomains: ['api.github.com'],
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('GITHUB_ALLOWED');
    }, 10000);

    it('should DENY access to non-whitelisted domains', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          try {
            const response = await fetch("https://google.com");
            console.log("GOOGLE_ALLOWED");
          } catch (e) {
            console.log("GOOGLE_DENIED");
          }
        `,
        language: 'typescript',
        allowNet: true,
        allowedDomains: ['api.github.com'], // Only GitHub allowed
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('GOOGLE_DENIED');
    }, 10000);
  });

  describe('Timeout Protection', () => {
    it('should enforce timeout for infinite loops', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'while (true) {}',
        language: 'javascript',
        timeout: 2000,
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(1500);
    });

    it('should complete fast executions within timeout', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'console.log("fast")',
        language: 'javascript',
        timeout: 5000,
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeLessThan(2000);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'const x = ;',
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle runtime errors gracefully', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'throw new Error("Test error");',
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.stderr || result.error).toBeDefined();
    });

    it('should capture stderr output', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: 'console.error("Error message");',
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stderr).toContain('Error message');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty code', async () => {
      await expect(async () => {
        await EXECUTE_CODE_TOOL.handler({
          code: '',
          language: 'javascript',
        }, TEST_CONTEXT);
      }).rejects.toThrow();
    });

    it('should reject code over 50KB', async () => {
      await expect(async () => {
        await EXECUTE_CODE_TOOL.handler({
          code: 'a'.repeat(50001),
          language: 'javascript',
        }, TEST_CONTEXT);
      }).rejects.toThrow();
    });

    it('should reject timeout over 30s', async () => {
      await expect(async () => {
        await EXECUTE_CODE_TOOL.handler({
          code: 'console.log("test")',
          language: 'javascript',
          timeout: 31000,
        }, TEST_CONTEXT);
      }).rejects.toThrow();
    });

    it('should reject invalid language', async () => {
      await expect(async () => {
        await EXECUTE_CODE_TOOL.handler({
          code: 'print("test")',
          language: 'python' as any, // Invalid language
        }, TEST_CONTEXT);
      }).rejects.toThrow();
    });
  });

  describe('Real-World Use Cases', () => {
    it('should calculate and return results', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          function fibonacci(n: number): number {
            if (n <= 1) return n;
            return fibonacci(n - 1) + fibonacci(n - 2);
          }
          console.log(fibonacci(10));
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('55');
    });

    it('should parse and stringify JSON', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          const data = { name: "test", count: 42 };
          const json = JSON.stringify(data);
          const parsed = JSON.parse(json);
          console.log(parsed.count);
        `,
        language: 'javascript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('42');
    });

    it('should work with async/await', async () => {
      const result = await EXECUTE_CODE_TOOL.handler({
        code: `
          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
          async function main() {
            await sleep(100);
            console.log("Done");
          }
          await main();
        `,
        language: 'typescript',
      }, TEST_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Done');
    });
  });
});
