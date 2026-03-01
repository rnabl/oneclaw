/**
 * Database Tool
 * 
 * Provides SQLite database operations for OneClaw to store persistent data.
 * This enables the AI to maintain state across conversations and build up knowledge over time.
 * 
 * Key capabilities:
 * - Create and manage tables
 * - Insert, update, delete records
 * - Query data with SQL
 * - Transaction support
 */

import { z } from 'zod';
import { pathValidator } from '../security/path-validator';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DatabaseInputSchema = z.object({
  action: z.enum(['query', 'execute', 'insert', 'update', 'delete', 'createTable']).describe('Database operation'),
  sql: z.string().optional().describe('SQL query or statement'),
  table: z.string().optional().describe('Table name (for insert/update/delete)'),
  data: z.record(z.unknown()).optional().describe('Data to insert or update'),
  where: z.record(z.unknown()).optional().describe('WHERE clause conditions (for update/delete)'),
  schema: z.record(z.string()).optional().describe('Table schema (for createTable)'),
  database: z.string().optional().default('oneclaw.db').describe('Database file name'),
});

type DatabaseInput = z.infer<typeof DatabaseInputSchema>;

const DatabaseOutputSchema = z.object({
  success: z.boolean(),
  rows: z.array(z.record(z.unknown())).optional(),
  rowsAffected: z.number().optional(),
  lastInsertId: z.number().optional(),
  error: z.string().optional(),
});

type DatabaseOutput = z.infer<typeof DatabaseOutputSchema>;

const dbConnections = new Map<string, Database.Database>();

const BLOCKED_SQL_PATTERNS = [
  /DROP\s+DATABASE/i,
  /ATTACH\s+DATABASE/i,
  /DETACH\s+DATABASE/i,
  /PRAGMA\s+database_list/i,
];

function getDatabasePath(dbName: string): string {
  const workspaceRoot = pathValidator.getWorkspaceRoot();
  return path.join(workspaceRoot, 'data', dbName);
}

function getOrCreateConnection(dbName: string): Database.Database {
  if (dbConnections.has(dbName)) {
    return dbConnections.get(dbName)!;
  }

  const dbPath = getDatabasePath(dbName);
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  dbConnections.set(dbName, db);
  console.log(`[Database] Connected to ${dbPath}`);
  
  return db;
}

function buildWhereClause(where: Record<string, unknown>): { clause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(where)) {
    conditions.push(`${key} = ?`);
    values.push(value);
  }
  
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

async function databaseHandler(
  input: DatabaseInput,
  context: { tenantId: string }
): Promise<DatabaseOutput> {
  try {
    const db = getOrCreateConnection(input.database || 'oneclaw.db');

    switch (input.action) {
      case 'query': {
        if (!input.sql) {
          return { success: false, error: 'SQL query is required for query action' };
        }

        for (const pattern of BLOCKED_SQL_PATTERNS) {
          if (pattern.test(input.sql)) {
            return {
              success: false,
              error: `Blocked SQL operation: ${pattern}`,
            };
          }
        }

        const stmt = db.prepare(input.sql);
        const rows = stmt.all();
        
        return {
          success: true,
          rows: rows as Record<string, unknown>[],
        };
      }

      case 'execute': {
        if (!input.sql) {
          return { success: false, error: 'SQL statement is required for execute action' };
        }

        for (const pattern of BLOCKED_SQL_PATTERNS) {
          if (pattern.test(input.sql)) {
            return {
              success: false,
              error: `Blocked SQL operation: ${pattern}`,
            };
          }
        }

        const stmt = db.prepare(input.sql);
        const result = stmt.run();
        
        return {
          success: true,
          rowsAffected: result.changes,
          lastInsertId: result.lastInsertRowid as number,
        };
      }

      case 'insert': {
        if (!input.table || !input.data) {
          return { success: false, error: 'Table and data are required for insert action' };
        }

        const columns = Object.keys(input.data);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(input.data);
        
        const sql = `INSERT INTO ${input.table} (${columns.join(', ')}) VALUES (${placeholders})`;
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
        return {
          success: true,
          rowsAffected: result.changes,
          lastInsertId: result.lastInsertRowid as number,
        };
      }

      case 'update': {
        if (!input.table || !input.data) {
          return { success: false, error: 'Table and data are required for update action' };
        }

        const setClauses = Object.keys(input.data).map(key => `${key} = ?`).join(', ');
        const setValues = Object.values(input.data);
        
        const { clause: whereClause, values: whereValues } = buildWhereClause(input.where || {});
        
        const sql = `UPDATE ${input.table} SET ${setClauses} ${whereClause}`;
        const stmt = db.prepare(sql);
        const result = stmt.run(...setValues, ...whereValues);
        
        return {
          success: true,
          rowsAffected: result.changes,
        };
      }

      case 'delete': {
        if (!input.table) {
          return { success: false, error: 'Table is required for delete action' };
        }

        const { clause: whereClause, values: whereValues } = buildWhereClause(input.where || {});
        
        if (!whereClause) {
          return {
            success: false,
            error: 'WHERE clause is required for delete (safety feature to prevent accidental deletion of all rows)',
          };
        }
        
        const sql = `DELETE FROM ${input.table} ${whereClause}`;
        const stmt = db.prepare(sql);
        const result = stmt.run(...whereValues);
        
        return {
          success: true,
          rowsAffected: result.changes,
        };
      }

      case 'createTable': {
        if (!input.table || !input.schema) {
          return { success: false, error: 'Table and schema are required for createTable action' };
        }

        const columns = Object.entries(input.schema)
          .map(([name, type]) => `${name} ${type}`)
          .join(', ');
        
        const sql = `CREATE TABLE IF NOT EXISTS ${input.table} (${columns})`;
        db.prepare(sql).run();
        
        return {
          success: true,
          rowsAffected: 0,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${input.action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function closeDatabaseConnections(): void {
  for (const [name, db] of dbConnections.entries()) {
    db.close();
    console.log(`[Database] Closed connection to ${name}`);
  }
  dbConnections.clear();
}

process.on('exit', closeDatabaseConnections);
process.on('SIGINT', () => {
  closeDatabaseConnections();
  process.exit(0);
});

export const DATABASE_TOOL = {
  id: 'database',
  name: 'database',
  description: 'Execute SQLite database operations for persistent data storage',
  version: '1.0.0',
  costClass: 'low' as const,
  estimatedCostUsd: 0.001,
  requiredSecrets: [] as string[],
  tags: ['database', 'storage', 'self-improvement', 'sqlite'],
  inputSchema: DatabaseInputSchema,
  outputSchema: DatabaseOutputSchema,
  networkPolicy: {
    allowedDomains: [],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = DatabaseInputSchema.parse(input);
    return databaseHandler(validated, { tenantId: context.tenantId });
  },
};

export { DatabaseInputSchema, DatabaseOutputSchema, databaseHandler, getDatabasePath };
