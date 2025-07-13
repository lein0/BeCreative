import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (with service role key)
export const createServerClient = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Database types (will be generated from Supabase)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: 'student' | 'instructor' | 'admin'
          credits: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'student' | 'instructor' | 'admin'
          credits?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'student' | 'instructor' | 'admin'
          credits?: number
          created_at?: string
          updated_at?: string
        }
      }
      instructors: {
        Row: {
          id: string
          user_id: string
          bio: string | null
          specialties: string[] | null
          experience_years: number | null
          hourly_rate: number | null
          location: string | null
          is_verified: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          bio?: string | null
          specialties?: string[] | null
          experience_years?: number | null
          hourly_rate?: number | null
          location?: string | null
          is_verified?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          bio?: string | null
          specialties?: string[] | null
          experience_years?: number | null
          hourly_rate?: number | null
          location?: string | null
          is_verified?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      classes: {
        Row: {
          id: string
          instructor_id: string
          title: string
          description: string | null
          category: string
          subcategory: string | null
          duration_minutes: number | null
          max_students: number | null
          price_credits: number | null
          price_dollars: number | null
          location: string | null
          is_virtual: boolean
          virtual_meeting_url: string | null
          scheduled_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          instructor_id: string
          title: string
          description?: string | null
          category: string
          subcategory?: string | null
          duration_minutes?: number | null
          max_students?: number | null
          price_credits?: number | null
          price_dollars?: number | null
          location?: string | null
          is_virtual?: boolean
          virtual_meeting_url?: string | null
          scheduled_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          instructor_id?: string
          title?: string
          description?: string | null
          category?: string
          subcategory?: string | null
          duration_minutes?: number | null
          max_students?: number | null
          price_credits?: number | null
          price_dollars?: number | null
          location?: string | null
          is_virtual?: boolean
          virtual_meeting_url?: string | null
          scheduled_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bookings: {
        Row: {
          id: string
          user_id: string
          class_id: string
          payment_method: 'credits' | 'stripe'
          amount_paid: number | null
          credits_used: number | null
          status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          stripe_payment_intent_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          class_id: string
          payment_method?: 'credits' | 'stripe'
          amount_paid?: number | null
          credits_used?: number | null
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          class_id?: string
          payment_method?: 'credits' | 'stripe'
          amount_paid?: number | null
          credits_used?: number | null
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_subscription_id: string | null
          stripe_customer_id: string | null
          plan_type: 'basic' | 'premium' | 'unlimited'
          status: 'active' | 'cancelled' | 'past_due'
          current_period_start: string | null
          current_period_end: string | null
          credits_per_month: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          plan_type: 'basic' | 'premium' | 'unlimited'
          status?: 'active' | 'cancelled' | 'past_due'
          current_period_start?: string | null
          current_period_end?: string | null
          credits_per_month?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          plan_type?: 'basic' | 'premium' | 'unlimited'
          status?: 'active' | 'cancelled' | 'past_due'
          current_period_start?: string | null
          current_period_end?: string | null
          credits_per_month?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      reviews: {
        Row: {
          id: string
          user_id: string
          instructor_id: string
          class_id: string | null
          rating: number
          comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          instructor_id: string
          class_id?: string | null
          rating: number
          comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          instructor_id?: string
          class_id?: string | null
          rating?: number
          comment?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      favorite_instructors: {
        Row: {
          id: string
          user_id: string
          instructor_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          instructor_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          instructor_id?: string
          created_at?: string
        }
      }
    }
  }
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
} 