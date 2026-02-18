/**
 * Workflows Restate Server
 * 
 * Registers all workflows with Restate and starts the HTTP server.
 */

import { restate } from '@oneclaw/engine';
import { auditWorkflowConfig, runAuditWithRestate, AuditInput, AuditResult } from './audit-website';

// Create Restate service for audit workflow
const auditService = restate.service({
  name: auditWorkflowConfig.id,
  handlers: {
    run: async (ctx: restate.Context, input: AuditInput): Promise<AuditResult> => {
      // Validate input
      const parsed = auditWorkflowConfig.inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(`Invalid input: ${parsed.error.message}`);
      }
      
      return runAuditWithRestate(ctx, parsed.data);
    },
  },
});

// Create endpoint and bind services
const endpoint = restate.endpoint()
  .bind(auditService);

// Start server
const PORT = parseInt(process.env.RESTATE_PORT || '9080');

endpoint.listen(PORT);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  OneClaw Workflows Server                    ║
╠══════════════════════════════════════════════════════════════╣
║  Restate HTTP endpoint: http://localhost:${PORT}               ║
║                                                              ║
║  Registered workflows:                                       ║
║    • audit-website                                           ║
║                                                              ║
║  To invoke via Restate ingress:                              ║
║    curl http://localhost:8080/audit-website/run \\           ║
║      -H 'content-type: application/json' \\                  ║
║      -d '{"url":"https://example.com","businessName":"..."}'║
╚══════════════════════════════════════════════════════════════╝
`);
