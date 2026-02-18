// Generated Supabase types
// Run `pnpm db:generate` to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          phone_number: string
          name: string | null
          tier: 'none' | 'starter' | 'pro'
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          phone_number: string
          name?: string | null
          tier?: 'none' | 'starter' | 'pro'
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          phone_number?: string
          name?: string | null
          tier?: 'none' | 'starter' | 'pro'
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      usage: {
        Row: {
          id: string
          phone_number: string
          action: string
          metadata: Json
          billing_period: string
          created_at: string
        }
        Insert: {
          id?: string
          phone_number: string
          action: string
          metadata?: Json
          billing_period: string
          created_at?: string
        }
        Update: {
          id?: string
          phone_number?: string
          action?: string
          metadata?: Json
          billing_period?: string
          created_at?: string
        }
      }
      session_vault: {
        Row: {
          id: string
          phone_number: string
          service_name: string
          encrypted_session: string
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          phone_number: string
          service_name: string
          encrypted_session: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          phone_number?: string
          service_name?: string
          encrypted_session?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
