export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          amount_czk: number
          amount_eur: number | null
          booking_reference: string
          booking_source: string
          booking_type: string
          client_email: string
          client_first_name: string
          client_last_name: string
          client_phone: string
          created_at: string
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          distance_km: number | null
          driver_id: string | null
          extra_child_seat: boolean
          extra_luggage: boolean
          extra_meet_greet: boolean
          flight_arrival_airport: string | null
          flight_delay_minutes: number | null
          flight_departure_airport: string | null
          flight_estimated_arrival: string | null
          flight_iata: string | null
          flight_number: string | null
          flight_status: string | null
          flight_terminal: string | null
          hours: number | null
          id: string
          leg: string
          linked_booking_id: string | null
          luggage: number
          operator_notes: string | null
          origin_address: string | null
          origin_lat: number | null
          origin_lng: number | null
          outbound_amount_czk: number | null
          passengers: number
          payment_intent_id: string | null
          pickup_date: string
          pickup_time: string
          pickup_utc: string | null
          return_amount_czk: number | null
          return_date: string | null
          special_requests: string | null
          status: string
          terminal: string | null
          trip_type: string
          user_id: string | null
          vehicle_class: string
        }
        Insert: {
          amount_czk: number
          amount_eur?: number | null
          booking_reference: string
          booking_source?: string
          booking_type: string
          client_email: string
          client_first_name: string
          client_last_name: string
          client_phone: string
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number | null
          driver_id?: string | null
          extra_child_seat?: boolean
          extra_luggage?: boolean
          extra_meet_greet?: boolean
          flight_arrival_airport?: string | null
          flight_delay_minutes?: number | null
          flight_departure_airport?: string | null
          flight_estimated_arrival?: string | null
          flight_iata?: string | null
          flight_number?: string | null
          flight_status?: string | null
          flight_terminal?: string | null
          hours?: number | null
          id?: string
          leg?: string
          linked_booking_id?: string | null
          luggage: number
          operator_notes?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          outbound_amount_czk?: number | null
          passengers: number
          payment_intent_id?: string | null
          pickup_date: string
          pickup_time: string
          pickup_utc?: string | null
          return_amount_czk?: number | null
          return_date?: string | null
          special_requests?: string | null
          status?: string
          terminal?: string | null
          trip_type: string
          user_id?: string | null
          vehicle_class: string
        }
        Update: {
          amount_czk?: number
          amount_eur?: number | null
          booking_reference?: string
          booking_source?: string
          booking_type?: string
          client_email?: string
          client_first_name?: string
          client_last_name?: string
          client_phone?: string
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number | null
          driver_id?: string | null
          extra_child_seat?: boolean
          extra_luggage?: boolean
          extra_meet_greet?: boolean
          flight_arrival_airport?: string | null
          flight_delay_minutes?: number | null
          flight_departure_airport?: string | null
          flight_estimated_arrival?: string | null
          flight_iata?: string | null
          flight_number?: string | null
          flight_status?: string | null
          flight_terminal?: string | null
          hours?: number | null
          id?: string
          leg?: string
          linked_booking_id?: string | null
          luggage?: number
          operator_notes?: string | null
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          outbound_amount_czk?: number | null
          passengers?: number
          payment_intent_id?: string | null
          pickup_date?: string
          pickup_time?: string
          pickup_utc?: string | null
          return_amount_czk?: number | null
          return_date?: string | null
          special_requests?: string | null
          status?: string
          terminal?: string | null
          trip_type?: string
          user_id?: string | null
          vehicle_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          chat_id: number
          headline: string | null
          headline_em: string | null
          overlay_raw: string | null
          photo_prompt: string | null
          step: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          headline?: string | null
          headline_em?: string | null
          overlay_raw?: string | null
          photo_prompt?: string | null
          step: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          headline?: string | null
          headline_em?: string | null
          overlay_raw?: string | null
          photo_prompt?: string | null
          step?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          chat_id: string
          content: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          blog_mdx: string | null
          blog_slug: string | null
          buffer_update_ids: Json | null
          caption: string | null
          channels: Json
          created_at: string
          error: string | null
          gen_prompt: string | null
          github_commit_sha: string | null
          hashtags: string | null
          headline: string | null
          headline_em: string | null
          id: string
          media_branded_url: string | null
          media_kind: string | null
          media_raw_url: string | null
          media_variants: Json
          published_at: string | null
          run_id: string | null
          scheduled_at: string | null
          status: string
          subline: string | null
          topic: string | null
          type: string
          updated_at: string
        }
        Insert: {
          blog_mdx?: string | null
          blog_slug?: string | null
          buffer_update_ids?: Json | null
          caption?: string | null
          channels?: Json
          created_at?: string
          error?: string | null
          gen_prompt?: string | null
          github_commit_sha?: string | null
          hashtags?: string | null
          headline?: string | null
          headline_em?: string | null
          id?: string
          media_branded_url?: string | null
          media_kind?: string | null
          media_raw_url?: string | null
          media_variants?: Json
          published_at?: string | null
          run_id?: string | null
          scheduled_at?: string | null
          status?: string
          subline?: string | null
          topic?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          blog_mdx?: string | null
          blog_slug?: string | null
          buffer_update_ids?: Json | null
          caption?: string | null
          channels?: Json
          created_at?: string
          error?: string | null
          gen_prompt?: string | null
          github_commit_sha?: string | null
          hashtags?: string | null
          headline?: string | null
          headline_em?: string | null
          id?: string
          media_branded_url?: string | null
          media_kind?: string | null
          media_raw_url?: string | null
          media_variants?: Json
          published_at?: string | null
          run_id?: string | null
          scheduled_at?: string | null
          status?: string
          subline?: string | null
          topic?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      coverage_zones: {
        Row: {
          active: boolean
          created_at: string
          geojson: Json
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          geojson: Json
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          geojson?: Json
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          account_type: string
          company_name: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          company_name?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      driver_assignments: {
        Row: {
          booking_id: string | null
          created_at: string
          driver_id: string
          id: string
          status: string
          token: string
          token_expires_at: string
          token_used_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          driver_id: string
          id?: string
          status?: string
          token?: string
          token_expires_at?: string
          token_used_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          status?: string
          token?: string
          token_expires_at?: string
          token_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          vehicle_info: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
          vehicle_info?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          vehicle_info?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          booking_id: string | null
          email_type: string
          id: string
          recipient: string
          sent_at: string
        }
        Insert: {
          booking_id?: string | null
          email_type: string
          id?: string
          recipient: string
          sent_at?: string
        }
        Update: {
          booking_id?: string | null
          email_type?: string
          id?: string
          recipient?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      fb_dm_history: {
        Row: {
          ai_reply: string | null
          created_at: string | null
          id: string
          mid: string | null
          sender_id: string
          user_message: string | null
        }
        Insert: {
          ai_reply?: string | null
          created_at?: string | null
          id?: string
          mid?: string | null
          sender_id: string
          user_message?: string | null
        }
        Update: {
          ai_reply?: string | null
          created_at?: string | null
          id?: string
          mid?: string | null
          sender_id?: string
          user_message?: string | null
        }
        Relationships: []
      }
      fb_photo_bank: {
        Row: {
          created_at: string | null
          format: string | null
          gdrive_hcti_id: string | null
          gdrive_hcti_url: string | null
          gdrive_source_id: string | null
          gdrive_source_url: string | null
          hcti_url: string | null
          id: number
          image_prompt: string | null
          last_used_at: string | null
          replicate_url: string
          tags: string | null
          used_count: number | null
        }
        Insert: {
          created_at?: string | null
          format?: string | null
          gdrive_hcti_id?: string | null
          gdrive_hcti_url?: string | null
          gdrive_source_id?: string | null
          gdrive_source_url?: string | null
          hcti_url?: string | null
          id?: number
          image_prompt?: string | null
          last_used_at?: string | null
          replicate_url: string
          tags?: string | null
          used_count?: number | null
        }
        Update: {
          created_at?: string | null
          format?: string | null
          gdrive_hcti_id?: string | null
          gdrive_hcti_url?: string | null
          gdrive_source_id?: string | null
          gdrive_source_url?: string | null
          hcti_url?: string | null
          id?: number
          image_prompt?: string | null
          last_used_at?: string | null
          replicate_url?: string
          tags?: string | null
          used_count?: number | null
        }
        Relationships: []
      }
      fb_processed_comments: {
        Row: {
          comment_id: string
          id: string
          post_id: string | null
          processed_at: string | null
          reply_sent: boolean | null
        }
        Insert: {
          comment_id: string
          id?: string
          post_id?: string | null
          processed_at?: string | null
          reply_sent?: boolean | null
        }
        Update: {
          comment_id?: string
          id?: string
          post_id?: string | null
          processed_at?: string | null
          reply_sent?: boolean | null
        }
        Relationships: []
      }
      fb_welcomed_users: {
        Row: {
          first_name: string | null
          id: string
          sender_id: string
          welcomed_at: string | null
        }
        Insert: {
          first_name?: string | null
          id?: string
          sender_id: string
          welcomed_at?: string | null
        }
        Update: {
          first_name?: string | null
          id?: string
          sender_id?: string
          welcomed_at?: string | null
        }
        Relationships: []
      }
      follower_count_log: {
        Row: {
          followers_count: number
          id: string
          recorded_at: string | null
        }
        Insert: {
          followers_count: number
          id?: string
          recorded_at?: string | null
        }
        Update: {
          followers_count?: number
          id?: string
          recorded_at?: string | null
        }
        Relationships: []
      }
      gnet_bookings: {
        Row: {
          booking_id: string
          created_at: string
          gnet_res_no: string
          id: string
          last_push_error: string | null
          last_push_status: string | null
          last_pushed_at: string | null
          raw_payload: Json
          transaction_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          gnet_res_no: string
          id?: string
          last_push_error?: string | null
          last_push_status?: string | null
          last_pushed_at?: string | null
          raw_payload?: Json
          transaction_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          gnet_res_no?: string
          id?: string
          last_push_error?: string | null
          last_push_status?: string | null
          last_pushed_at?: string | null
          raw_payload?: Json
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gnet_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_content: {
        Row: {
          caption: string | null
          cloudinary_url: string | null
          created_at: string | null
          hashtags: string | null
          id: string
          image_url: string | null
          instagram_media_id: string | null
          notion_page_id: string | null
          post_date: string | null
          published_at: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          caption?: string | null
          cloudinary_url?: string | null
          created_at?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          instagram_media_id?: string | null
          notion_page_id?: string | null
          post_date?: string | null
          published_at?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          caption?: string | null
          cloudinary_url?: string | null
          created_at?: string | null
          hashtags?: string | null
          id?: string
          image_url?: string | null
          instagram_media_id?: string | null
          notion_page_id?: string | null
          post_date?: string | null
          published_at?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      ig_photo_bank: {
        Row: {
          created_at: string
          format: string
          gdrive_hcti_id: string | null
          gdrive_hcti_url: string | null
          gdrive_source_id: string | null
          gdrive_source_url: string | null
          hcti_url: string
          id: number
          image_prompt: string | null
          last_used_at: string | null
          replicate_url: string
          tags: string[] | null
          used_count: number
        }
        Insert: {
          created_at?: string
          format?: string
          gdrive_hcti_id?: string | null
          gdrive_hcti_url?: string | null
          gdrive_source_id?: string | null
          gdrive_source_url?: string | null
          hcti_url: string
          id?: never
          image_prompt?: string | null
          last_used_at?: string | null
          replicate_url: string
          tags?: string[] | null
          used_count?: number
        }
        Update: {
          created_at?: string
          format?: string
          gdrive_hcti_id?: string | null
          gdrive_hcti_url?: string | null
          gdrive_source_id?: string | null
          gdrive_source_url?: string | null
          hcti_url?: string
          id?: never
          image_prompt?: string | null
          last_used_at?: string | null
          replicate_url?: string
          tags?: string[] | null
          used_count?: number
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          daily_rate: number
          hourly_rate: number
          min_fare: number
          rate_per_km: number
          vehicle_class: string
        }
        Insert: {
          daily_rate: number
          hourly_rate: number
          min_fare?: number
          rate_per_km: number
          vehicle_class: string
        }
        Update: {
          daily_rate?: number
          hourly_rate?: number
          min_fare?: number
          rate_per_km?: number
          vehicle_class?: string
        }
        Relationships: []
      }
      pricing_globals: {
        Row: {
          airport_fee: number
          airport_promo_active: boolean
          airport_promo_price_eur: number
          airport_regular_price_eur: number
          extra_child_seat: number
          extra_luggage: number
          google_review_url: string | null
          holiday_coefficient: number
          holiday_dates: Json
          hourly_max_hours: number
          hourly_min_hours: number
          id: number
          night_coefficient: number
          notification_flags: Json | null
          return_discount_pct: number
          return_discount_percent: number
        }
        Insert: {
          airport_fee?: number
          airport_promo_active?: boolean
          airport_promo_price_eur?: number
          airport_regular_price_eur?: number
          extra_child_seat: number
          extra_luggage: number
          google_review_url?: string | null
          holiday_coefficient?: number
          holiday_dates?: Json
          hourly_max_hours?: number
          hourly_min_hours?: number
          id?: number
          night_coefficient?: number
          notification_flags?: Json | null
          return_discount_pct?: number
          return_discount_percent?: number
        }
        Update: {
          airport_fee?: number
          airport_promo_active?: boolean
          airport_promo_price_eur?: number
          airport_regular_price_eur?: number
          extra_child_seat?: number
          extra_luggage?: number
          google_review_url?: string | null
          holiday_coefficient?: number
          holiday_dates?: Json
          hourly_max_hours?: number
          hourly_min_hours?: number
          id?: number
          night_coefficient?: number
          notification_flags?: Json | null
          return_discount_pct?: number
          return_discount_percent?: number
        }
        Relationships: []
      }
      processed_comments: {
        Row: {
          auto_replied: boolean | null
          comment_id: string
          id: string
          intent: string | null
          media_id: string | null
          processed_at: string | null
          sent_to_telegram: boolean | null
        }
        Insert: {
          auto_replied?: boolean | null
          comment_id: string
          id?: string
          intent?: string | null
          media_id?: string | null
          processed_at?: string | null
          sent_to_telegram?: boolean | null
        }
        Update: {
          auto_replied?: boolean | null
          comment_id?: string
          id?: string
          intent?: string | null
          media_id?: string | null
          processed_at?: string | null
          sent_to_telegram?: boolean | null
        }
        Relationships: []
      }
      processed_dms: {
        Row: {
          id: string
          intent: string | null
          language: string | null
          message_id: string
          processed_at: string | null
          sender_id: string
        }
        Insert: {
          id?: string
          intent?: string | null
          language?: string | null
          message_id: string
          processed_at?: string | null
          sender_id: string
        }
        Update: {
          id?: string
          intent?: string | null
          language?: string | null
          message_id?: string
          processed_at?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          discount_type: string
          discount_value: number
          expiry_date: string | null
          id: string
          is_active: boolean
          max_uses: number | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          discount_type?: string
          discount_value: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          discount_type?: string
          discount_value?: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Relationships: []
      }
      quote_leads: {
        Row: {
          consent_timestamp: string
          consent_version: string
          created_at: string
          email: string
          id: string
          ip: string | null
          marketing_opt_in: boolean
          quote_payload: Json
          user_agent: string | null
        }
        Insert: {
          consent_timestamp?: string
          consent_version?: string
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          marketing_opt_in?: boolean
          quote_payload?: Json
          user_agent?: string | null
        }
        Update: {
          consent_timestamp?: string
          consent_version?: string
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          marketing_opt_in?: boolean
          quote_payload?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      route_prices: {
        Row: {
          created_at: string
          display_order: number
          distance_km: number
          e_class_eur: number
          from_label: string
          place_ids: string[]
          s_class_eur: number
          slug: string
          to_label: string
          updated_at: string
          v_class_eur: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          distance_km: number
          e_class_eur: number
          from_label: string
          place_ids?: string[]
          s_class_eur: number
          slug: string
          to_label: string
          updated_at?: string
          v_class_eur: number
        }
        Update: {
          created_at?: string
          display_order?: number
          distance_km?: number
          e_class_eur?: number
          from_label?: string
          place_ids?: string[]
          s_class_eur?: number
          slug?: string
          to_label?: string
          updated_at?: string
          v_class_eur?: number
        }
        Relationships: []
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      welcomed_followers: {
        Row: {
          id: string
          instagram_user_id: string
          language: string | null
          username: string | null
          welcomed_at: string | null
        }
        Insert: {
          id?: string
          instagram_user_id: string
          language?: string | null
          username?: string | null
          welcomed_at?: string | null
        }
        Update: {
          id?: string
          instagram_user_id?: string
          language?: string | null
          username?: string | null
          welcomed_at?: string | null
        }
        Relationships: []
      }
      workflow_logs: {
        Row: {
          created_at: string | null
          event: string
          id: string
          payload: Json | null
          status: string | null
          workflow_name: string
        }
        Insert: {
          created_at?: string | null
          event: string
          id?: string
          payload?: Json | null
          status?: string | null
          workflow_name: string
        }
        Update: {
          created_at?: string | null
          event?: string
          id?: string
          payload?: Json | null
          status?: string | null
          workflow_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_search_bookings: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_start_date?: string
          p_trip_type?: string
        }
        Returns: {
          rows: Json
          total_count: number
        }[]
      }
      claim_promo_code:
        | {
            Args: { p_code: string }
            Returns: {
              discount_value: number
              id: string
            }[]
          }
        | { Args: { p_booking_id: string; p_code: string }; Returns: Json }
      create_round_trip_bookings: {
        Args: { p_outbound: Json; p_return: Json }
        Returns: {
          outbound_id: string
          return_id: string
        }[]
      }
      prestigo_text_to_utc: {
        Args: { p_date: string; p_time: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
