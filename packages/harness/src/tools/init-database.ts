/**
 * Initialize Database Tool
 * 
 * Creates the autonomous database schema for OneClaw.
 * This tool should be called once to set up the database structure.
 */

import { z } from 'zod';
import { getDatabasePath } from './database';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const InitDatabaseInputSchema = z.object({
  database: z.string().optional().default('oneclaw.db').describe('Database file name'),
  force: z.boolean().optional().default(false).describe('Force recreation of database (drops existing)'),
});

type InitDatabaseInput = z.infer<typeof InitDatabaseInputSchema>;

const InitDatabaseOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  tablesCreated: z.array(z.string()).optional(),
  error: z.string().optional(),
});

type InitDatabaseOutput = z.infer<typeof InitDatabaseOutputSchema>;

async function initDatabaseHandler(
  input: InitDatabaseInput,
  context: { tenantId: string }
): Promise<InitDatabaseOutput> {
  try {
    const dbPath = getDatabasePath(input.database);

    if (input.force && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`[InitDatabase] Deleted existing database: ${dbPath}`);
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    const schemaPath = path.join(__dirname, '../database/autonomous-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    db.exec(schema);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);

    db.close();

    console.log(`[InitDatabase] Created ${tableNames.length} tables in ${dbPath}`);

    return {
      success: true,
      message: `Database initialized successfully with ${tableNames.length} tables`,
      tablesCreated: tableNames,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const INIT_DATABASE_TOOL = {
  id: 'init-database',
  name: 'init-database',
  description: 'Initialize the OneClaw autonomous database with required schema',
  version: '1.0.0',
  costClass: 'free' as const,
  estimatedCostUsd: 0,
  requiredSecrets: [] as string[],
  tags: ['database', 'setup', 'self-improvement'],
  inputSchema: InitDatabaseInputSchema,
  outputSchema: InitDatabaseOutputSchema,
  networkPolicy: {
    allowedDomains: [],
    blockedDomains: [],
    allowLocalhost: false,
  },
  isPublic: false,
  handler: async (input: unknown, context: { tenantId: string }) => {
    const validated = InitDatabaseInputSchema.parse(input);
    return initDatabaseHandler(validated, { tenantId: context.tenantId });
  },
};

export { InitDatabaseInputSchema, InitDatabaseOutputSchema, initDatabaseHandler };
