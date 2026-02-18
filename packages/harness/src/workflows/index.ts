// Import workflows to register them
import './audit';
import './discovery';
import './analysis';

export { auditWorkflowHandler } from './audit';
export { discoveryWorkflowHandler } from './discovery';
export { analysisWorkflowHandler } from './analysis';
