/**
 * @oneclaw/clients
 * 
 * API clients for external services.
 */

// DataForSEO
export {
  DataForSEOClient,
  getDataForSEOClient,
  isDataForSEOConfigured,
  type DataForSEOConfig,
  type KeywordVolumeData,
  type GoogleMapsResult,
} from './dataforseo';

// Perplexity/Gemini Citation Checker
export {
  CitationChecker,
  getCitationChecker,
  isCitationProviderConfigured,
  type CitationCheckResult,
  type CitationProvider,
} from './perplexity';

// OpenAI utilities
export {
  getCityPopulation,
  extractCompetitors,
  chatCompletion,
  isOpenAIConfigured,
} from './openai';
