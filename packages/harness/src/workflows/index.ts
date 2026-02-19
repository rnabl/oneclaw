// Import workflows to register them
import './audit';
import './discovery';
import './analysis';
import './hvac-contact-discovery';
import './golf-booking';

export { auditWorkflowHandler } from './audit';
export { discoveryWorkflowHandler } from './discovery';
export { analysisWorkflowHandler } from './analysis';
export { hvacContactDiscoveryHandler } from './hvac-contact-discovery';
export { golfBookingHandler } from './golf-booking';
