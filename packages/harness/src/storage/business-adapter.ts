/**
 * Business Storage Adapter
 * 
 * Modular/agnostic storage for discovered businesses.
 * Can save to different destinations based on configuration.
 * Now with Zod validation for type safety.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import {
//   type LeadRecord,
//   type SourceType,
//   validateLeadRecord,
//   safeValidateLeadRecord,
// } from './lead-schemas'; // TODO: Re-enable when file exists

export interface BusinessRecord {
  name: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  imageUrl?: string | null;
  signals?: Record<string, any>;
  industry?: string;
  leadScore?: number;
  geoReadinessScore?: number;
  aeoReadinessScore?: number;
  sourceJobId?: string;
  // NEW: Agnostic fields
  sourceType?: SourceType;
  sourceMetadata?: Record<string, any>;
  hiringSignal?: Record<string, any>; // Backward compat
  businessType?: string;
  businessTypeConfidence?: number;
}

export interface StorageAdapter {
  store(businesses: BusinessRecord[]): Promise<{ success: boolean; count: number; error?: string; skipped?: number }>;
  query(filters: Record<string, any>): Promise<{ success: boolean; businesses: BusinessRecord[]; error?: string }>;
}

// =============================================================================
// SUPABASE CRM ADAPTER (Default - uses crm.leads)
// =============================================================================

export class SupabaseCRMAdapter implements StorageAdapter {
  private client: SupabaseClient;

  constructor(url?: string, key?: string) {
    const supabaseUrl = url || process.env.SUPABASE_URL!;
    const supabaseKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  async store(businesses: BusinessRecord[]) {
    try {
      // Validate records with Zod
      const validatedRecords: BusinessRecord[] = [];
      const skipped: string[] = [];
      
      for (const business of businesses) {
        const validation = safeValidateLeadRecord(business);
        if (validation.success) {
          validatedRecords.push(business);
        } else {
          console.warn(`[Storage] Skipping invalid record: ${business.name}`, validation.error.errors);
          skipped.push(business.name);
        }
      }
      
      if (validatedRecords.length === 0) {
        return {
          success: false,
          count: 0,
          skipped: skipped.length,
          error: 'All records failed validation',
        };
      }
      
      // Build source_metadata from various fields
      const records = validatedRecords.map(b => {
        const sourceMetadata: Record<string, any> = { ...(b.sourceMetadata || {}) };
        
        // For job posting leads, merge hiring data into source_metadata
        if (b.sourceType === 'job_posting' || b.hiringSignal) {
          sourceMetadata.hiring_signal = b.hiringSignal || {
            is_hiring: true,
            total_postings: b.signals?.totalJobPostings || 1,
            roles: b.signals?.hiringRoles || [],
            intensity: b.signals?.hiringIntensity || 'low',
            most_recent_days: b.signals?.mostRecentJobDays || 0,
          };
          
          if (b.businessType) {
            sourceMetadata.business_type = b.businessType;
            sourceMetadata.business_type_confidence = b.businessTypeConfidence;
          }
        }
        
        // For geographic leads, store Google data
        if (b.sourceType === 'geographic' || b.googlePlaceId) {
          sourceMetadata.discovery_method = 'google_maps';
          if (b.googlePlaceId) sourceMetadata.googlePlaceId = b.googlePlaceId;
          if (b.googleMapsUrl) sourceMetadata.googleMapsUrl = b.googleMapsUrl;
        }
        
        return {
          company_name: b.name,
          website: b.website,
          phone: b.phone,
          email: b.email,
          industry: b.industry,
          address: b.address,
          city: b.city,
          state: b.state,
          zip_code: b.zipCode,
          google_place_id: b.googlePlaceId,
          google_rating: b.rating,
          google_reviews: b.reviewCount,
          google_maps_url: b.googleMapsUrl,
          image_url: b.imageUrl,
          website_signals: b.signals || {},
          lead_score: b.leadScore || 50,
          geo_readiness_score: b.geoReadinessScore || 5.0,
          aeo_readiness_score: b.aeoReadinessScore || 5.0,
          stage: 'discovered',
          source_job_id: b.sourceJobId,
          source_type: b.sourceType || 'geographic',
          source_metadata: sourceMetadata,
        };
      });

      const { data, error } = await this.client
        .schema('crm')
        .from('leads')
        .insert(records)
        .select('id');

      if (error) {
        return {
          success: false,
          count: 0,
          skipped: skipped.length,
          error: error.message,
        };
      }

      return {
        success: true,
        count: data?.length || 0,
        skipped: skipped.length,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async query(filters: Record<string, any>) {
    try {
      let query = this.client.schema('crm').from('leads').select('*');

      if (filters.industry) query = query.eq('industry', filters.industry);
      if (filters.city) query = query.eq('city', filters.city);
      if (filters.state) query = query.eq('state', filters.state);
      if (filters.minScore) query = query.gte('lead_score', filters.minScore);
      if (filters.stage) query = query.eq('stage', filters.stage);
      if (filters.sourceType) query = query.eq('source_type', filters.sourceType);

      const { data, error } = await query.limit(filters.limit || 100);

      if (error) {
        return { success: false, businesses: [], error: error.message };
      }

      const businesses: BusinessRecord[] = (data || []).map(row => ({
        name: row.company_name,
        website: row.website,
        phone: row.phone,
        email: row.email,
        address: row.address,
        city: row.city,
        state: row.state,
        zipCode: row.zip_code,
        rating: row.google_rating,
        reviewCount: row.google_reviews,
        googlePlaceId: row.google_place_id,
        googleMapsUrl: row.google_maps_url,
        imageUrl: row.image_url,
        signals: row.website_signals,
        industry: row.industry,
        leadScore: row.lead_score,
        geoReadinessScore: row.geo_readiness_score,
        aeoReadinessScore: row.aeo_readiness_score,
        sourceJobId: row.source_job_id,
        sourceType: row.source_type,
        sourceMetadata: row.source_metadata,
      }));

      return { success: true, businesses };
    } catch (error) {
      return {
        success: false,
        businesses: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// =============================================================================
// JSON FILE ADAPTER (For local dev / simple storage)
// =============================================================================

export class JSONFileAdapter implements StorageAdapter {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async store(businesses: BusinessRecord[]) {
    try {
      const fs = await import('fs/promises');
      const existing = await this.readFile();
      const updated = [...existing, ...businesses];
      await fs.writeFile(this.filePath, JSON.stringify(updated, null, 2));
      return { success: true, count: businesses.length };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async query(filters: Record<string, any>) {
    try {
      const businesses = await this.readFile();
      let filtered = businesses;

      if (filters.industry) {
        filtered = filtered.filter(b => b.industry === filters.industry);
      }
      if (filters.city) {
        filtered = filtered.filter(b => b.city === filters.city);
      }
      if (filters.minScore) {
        filtered = filtered.filter(b => (b.leadScore || 0) >= filters.minScore);
      }

      return { success: true, businesses: filtered.slice(0, filters.limit || 100) };
    } catch (error) {
      return {
        success: false,
        businesses: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readFile(): Promise<BusinessRecord[]> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
}

// =============================================================================
// MEMORY ADAPTER (For testing)
// =============================================================================

export class MemoryAdapter implements StorageAdapter {
  private businesses: BusinessRecord[] = [];

  async store(businesses: BusinessRecord[]) {
    this.businesses.push(...businesses);
    return { success: true, count: businesses.length };
  }

  async query(filters: Record<string, any>) {
    let filtered = this.businesses;

    if (filters.industry) {
      filtered = filtered.filter(b => b.industry === filters.industry);
    }
    if (filters.city) {
      filtered = filtered.filter(b => b.city === filters.city);
    }

    return { success: true, businesses: filtered.slice(0, filters.limit || 100) };
  }

  clear() {
    this.businesses = [];
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createStorageAdapter(type?: string): StorageAdapter {
  const adapterType = type || process.env.BUSINESS_STORAGE_ADAPTER || 'supabase-crm';

  switch (adapterType) {
    case 'supabase-crm':
      return new SupabaseCRMAdapter();
    case 'json-file':
      return new JSONFileAdapter(process.env.BUSINESS_STORAGE_PATH || './businesses.json');
    case 'memory':
      return new MemoryAdapter();
    default:
      throw new Error(`Unknown storage adapter: ${adapterType}`);
  }
}
