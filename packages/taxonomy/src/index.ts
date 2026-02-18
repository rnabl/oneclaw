/**
 * @oneclaw/taxonomy
 * 
 * Industry taxonomies and domain knowledge for OneClaw workflows.
 */

// Types
export * from './types';

// Registry functions
export {
  getTaxonomy,
  listIndustries,
  hasIndustry,
  detectIndustriesFromText,
  getStandardKeywords,
} from './registry';

// Individual taxonomies (for direct access)
export { hvacTaxonomy, plumbingTaxonomy, dentalTaxonomy } from './industries';
