/**
 * Workflow Registry with Metadata & Benchmarking
 * 
 * Allows LLM to discover available workflows and choose the best method
 * based on use case, cost, speed, and quality trade-offs
 */

export interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
  category: 'discovery' | 'enrichment' | 'outreach' | 'analysis';
  
  // Cost & Performance
  estimatedCostPer100: number; // USD per 100 leads
  avgTimePerLead: number; // milliseconds
  
  // Quality metrics (from benchmarking)
  benchmarks: {
    avgLeadsFound: number;
    emailCoverageRate: number; // % of leads with emails
    dataQualityScore: number; // 1-10
    successRate: number; // % of runs that succeed
  };
  
  // When to use
  bestFor: string[];
  limitations: string[];
  
  // Input/Output
  requiredInputs: string[];
  optionalInputs: string[];
  outputFormat: string;
}

export const WORKFLOW_REGISTRY: Record<string, WorkflowMetadata> = {
  
  'discover-businesses': {
    id: 'discover-businesses',
    name: 'Geographic Discovery (Google Maps)',
    description: 'Find local businesses via Google Maps search. Best for finding established businesses with physical locations.',
    category: 'discovery',
    
    estimatedCostPer100: 0.50, // $0.50 per 100 leads
    avgTimePerLead: 500, // 0.5 seconds per lead
    
    benchmarks: {
      avgLeadsFound: 95, // Usually returns 95+ results per search
      emailCoverageRate: 35, // ~35% have emails on Google
      dataQualityScore: 8, // High quality (Google verified)
      successRate: 98, // Very reliable
    },
    
    bestFor: [
      'Finding local service businesses',
      'Companies with physical storefronts',
      'High-quality verified business data',
      'Need full NAP (Name, Address, Phone)',
    ],
    
    limitations: [
      'Only finds businesses listed on Google',
      'Lower email coverage',
      'Not good for remote/online-only businesses',
    ],
    
    requiredInputs: ['niche', 'location'],
    optionalInputs: ['limit', 'enrich'],
    outputFormat: 'Array<Business> with signals, ratings, location',
  },
  
  'discover-hiring-businesses': {
    id: 'discover-hiring-businesses',
    name: 'Job Posting Discovery (Hiring Signal)',
    description: 'Find companies actively hiring via LinkedIn/Indeed job postings. Best for targeting growth-stage companies with budget.',
    category: 'discovery',
    
    estimatedCostPer100: 1.00, // $1.00 per 100 leads (Notte API)
    avgTimePerLead: 1500, // 1.5 seconds per lead
    
    benchmarks: {
      avgLeadsFound: 70, // ~7 companies per 10 job postings
      emailCoverageRate: 15, // Need enrichment for emails
      dataQualityScore: 7, // Good but needs validation
      successRate: 92, // Pretty reliable
    },
    
    bestFor: [
      'High-intent signals (hiring = growing = budget)',
      'B2B sales targeting growth-stage companies',
      'Companies expanding operations',
      'Need timing advantage (reach out while hiring)',
    ],
    
    limitations: [
      'No emails by default (need enrichment)',
      'Smaller result set than Google Maps',
      'Job postings may be outdated',
      'Notte API required ($0.01 per 10 jobs)',
    ],
    
    requiredInputs: ['keyword', 'location'],
    optionalInputs: ['days', 'maxResults', 'enrich'],
    outputFormat: 'Array<Business> with hiring signals, job data, business type',
  },
  
  // Future: More discovery methods
  'discover-businesses-reviews': {
    id: 'discover-businesses-reviews',
    name: 'Review-Based Discovery',
    description: 'Find businesses via Yelp/TripAdvisor reviews. Best for targeting businesses with reputation issues or opportunities.',
    category: 'discovery',
    
    estimatedCostPer100: 2.00,
    avgTimePerLead: 2000,
    
    benchmarks: {
      avgLeadsFound: 50,
      emailCoverageRate: 20,
      dataQualityScore: 6,
      successRate: 85,
    },
    
    bestFor: [
      'Businesses with review activity',
      'Reputation management leads',
      'High review volume industries',
    ],
    
    limitations: [
      'Not all businesses have reviews',
      'Higher cost',
      'Slower',
    ],
    
    requiredInputs: ['niche', 'location'],
    optionalInputs: ['minReviews', 'maxRating'],
    outputFormat: 'Array<Business> with review data, sentiment analysis',
  },
};

/**
 * Helper: Get workflow suggestions based on user intent
 */
export function suggestWorkflows(intent: string): WorkflowMetadata[] {
  const keywords = intent.toLowerCase();
  
  // Hiring signal detection
  if (keywords.includes('hiring') || keywords.includes('job posting') || keywords.includes('growing')) {
    return [WORKFLOW_REGISTRY['discover-hiring-businesses']];
  }
  
  // Review/reputation signal
  if (keywords.includes('review') || keywords.includes('rating') || keywords.includes('reputation')) {
    return [WORKFLOW_REGISTRY['discover-businesses-reviews']];
  }
  
  // Default: geographic
  if (keywords.includes('near me') || keywords.includes('local') || keywords.includes('best')) {
    return [WORKFLOW_REGISTRY['discover-businesses']];
  }
  
  // Ambiguous: return all options sorted by quality score
  return Object.values(WORKFLOW_REGISTRY)
    .filter(w => w.category === 'discovery')
    .sort((a, b) => b.benchmarks.dataQualityScore - a.benchmarks.dataQualityScore);
}

/**
 * Format workflow options for LLM to present to user
 */
export function formatWorkflowOptions(workflows: WorkflowMetadata[]): string {
  return workflows.map((w, i) => {
    return `
${i + 1}. **${w.name}** 
   ${w.description}
   
   📊 Benchmarks:
   - Avg leads: ${w.benchmarks.avgLeadsFound} per search
   - Email coverage: ${w.benchmarks.emailCoverageRate}%
   - Quality score: ${w.benchmarks.dataQualityScore}/10
   - Cost: $${w.estimatedCostPer100.toFixed(2)} per 100 leads
   
   ✅ Best for: ${w.bestFor.slice(0, 2).join(', ')}
   ⚠️  Limitations: ${w.limitations[0]}
`;
  }).join('\n');
}
