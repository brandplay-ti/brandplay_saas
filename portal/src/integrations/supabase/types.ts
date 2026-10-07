// Gerado por supabase/tools/gerar-types.mjs a partir de supabase/migrations/.
// Não edite: aplique a migration e rode `npm run supabase:types`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          organization_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          action_url: string | null
          category: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          metadata: Json
          organization_id: string | null
          priority: string
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          category: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          category?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_allocations: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          organization_id: string | null
          property_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          property_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_allocations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_allocations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_photos: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_cover: boolean
          organization_id: string | null
          position: number
          storage_path: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_cover?: boolean
          organization_id?: string | null
          position?: number
          storage_path: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_cover?: boolean
          organization_id?: string | null
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          category: string
          created_at: string
          exclusive_sponsor_id: string | null
          exclusivity_terms: string[]
          id: string
          is_exclusive: boolean
          name: string
          notes: string | null
          organization_id: string | null
          owner_id: string
          quantity: number
          status: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          exclusive_sponsor_id?: string | null
          exclusivity_terms?: string[]
          id?: string
          is_exclusive?: boolean
          name: string
          notes?: string | null
          organization_id?: string | null
          owner_id: string
          quantity?: number
          status?: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          exclusive_sponsor_id?: string | null
          exclusivity_terms?: string[]
          id?: string
          is_exclusive?: boolean
          name?: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string
          quantity?: number
          status?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_exclusive_sponsor_id_fkey"
            columns: ["exclusive_sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backend_error_logs: {
        Row: {
          action: string
          attempted_row_keys: string[]
          client_file: string | null
          client_line: number | null
          created_at: string
          error_code: string | null
          error_details: string | null
          error_hint: string | null
          error_message: string | null
          id: string
          matching_policies: Json
          metadata: Json
          organization_id: string | null
          table_name: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          action: string
          attempted_row_keys?: string[]
          client_file?: string | null
          client_line?: number | null
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          error_hint?: string | null
          error_message?: string | null
          id?: string
          matching_policies?: Json
          metadata?: Json
          organization_id?: string | null
          table_name: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          action?: string
          attempted_row_keys?: string[]
          client_file?: string | null
          client_line?: number | null
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          error_hint?: string | null
          error_message?: string | null
          id?: string
          matching_policies?: Json
          metadata?: Json
          organization_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backend_error_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brandtrack_brands: {
        Row: {
          color: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          organization_id: string | null
          owner_id: string
          sponsor_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          sponsor_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          sponsor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brandtrack_brands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_brands_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      brandtrack_detections: {
        Row: {
          bes_score: number
          brand_id: string | null
          brand_name: string
          confidence: number
          corrected_brand_name: string | null
          corrected_exposure_type: string | null
          created_at: string
          duration: number
          end_time: number
          evidence_path: string | null
          exposure_type: string
          height: number | null
          id: string
          media_id: string
          organization_id: string | null
          owner_id: string
          position_x: number | null
          position_y: number | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          screen_percentage: number
          start_time: number
          width: number | null
        }
        Insert: {
          bes_score?: number
          brand_id?: string | null
          brand_name: string
          confidence?: number
          corrected_brand_name?: string | null
          corrected_exposure_type?: string | null
          created_at?: string
          duration?: number
          end_time?: number
          evidence_path?: string | null
          exposure_type?: string
          height?: number | null
          id?: string
          media_id: string
          organization_id?: string | null
          owner_id: string
          position_x?: number | null
          position_y?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screen_percentage?: number
          start_time?: number
          width?: number | null
        }
        Update: {
          bes_score?: number
          brand_id?: string | null
          brand_name?: string
          confidence?: number
          corrected_brand_name?: string | null
          corrected_exposure_type?: string | null
          created_at?: string
          duration?: number
          end_time?: number
          evidence_path?: string | null
          exposure_type?: string
          height?: number | null
          id?: string
          media_id?: string
          organization_id?: string | null
          owner_id?: string
          position_x?: number | null
          position_y?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screen_percentage?: number
          start_time?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brandtrack_detections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_detections_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_detections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brandtrack_event_brands: {
        Row: {
          aliases: string[]
          brand_id: string | null
          created_at: string
          display_name: string
          event_id: string
          id: string
          is_active: boolean
          organization_id: string | null
          owner_id: string
          priority: number
          sponsor_id: string | null
          sponsor_status: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          brand_id?: string | null
          created_at?: string
          display_name: string
          event_id: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          owner_id: string
          priority?: number
          sponsor_id?: string | null
          sponsor_status?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          brand_id?: string | null
          created_at?: string
          display_name?: string
          event_id?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          owner_id?: string
          priority?: number
          sponsor_id?: string | null
          sponsor_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brandtrack_event_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_event_brands_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_event_brands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_event_brands_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      brandtrack_events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string | null
          id: string
          name: string
          organization_id: string | null
          owner_id: string
          property_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          name: string
          organization_id?: string | null
          owner_id: string
          property_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
          property_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brandtrack_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      brandtrack_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          event_id: string | null
          external_url: string | null
          file_size: number | null
          id: string
          media_type: string
          organization_id: string | null
          owner_id: string
          processed_at: string | null
          progress: number
          source_platform: string | null
          status: string
          storage_path: string | null
          thumbnail_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          event_id?: string | null
          external_url?: string | null
          file_size?: number | null
          id?: string
          media_type: string
          organization_id?: string | null
          owner_id: string
          processed_at?: string | null
          progress?: number
          source_platform?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          event_id?: string | null
          external_url?: string | null
          file_size?: number | null
          id?: string
          media_type?: string
          organization_id?: string | null
          owner_id?: string
          processed_at?: string | null
          progress?: number
          source_platform?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brandtrack_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brandtrack_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_assets: {
        Row: {
          asset_id: string | null
          contract_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          quantity: number
          unit_value: number
        }
        Insert: {
          asset_id?: string | null
          contract_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          quantity?: number
          unit_value?: number
        }
        Update: {
          asset_id?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          quantity?: number
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_churn_risk: {
        Row: {
          contract_id: string
          generated_at: string
          model: string | null
          organization_id: string | null
          owner_id: string
          recommendation: string | null
          risk_level: string
          risk_score: number
          signals: Json
        }
        Insert: {
          contract_id: string
          generated_at?: string
          model?: string | null
          organization_id?: string | null
          owner_id: string
          recommendation?: string | null
          risk_level: string
          risk_score?: number
          signals?: Json
        }
        Update: {
          contract_id?: string
          generated_at?: string
          model?: string | null
          organization_id?: string | null
          owner_id?: string
          recommendation?: string | null
          risk_level?: string
          risk_score?: number
          signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_churn_risk_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_churn_risk_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_clause_templates: {
        Row: {
          content: string | null
          created_at: string
          id: string
          organization_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          organization_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_clause_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_clauses: {
        Row: {
          content: string | null
          contract_id: string
          created_at: string
          id: string
          organization_id: string | null
          position: number
          title: string
        }
        Insert: {
          content?: string | null
          contract_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          position?: number
          title: string
        }
        Update: {
          content?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_clauses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_clauses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          ai_summary: string | null
          brand: string
          contract_number: string | null
          created_at: string
          custom_due_dates: string[]
          due_day: number | null
          due_days: number | null
          end_date: string | null
          file_name: string | null
          file_path: string | null
          flat_value: number
          id: string
          installments: number
          notes: string | null
          opportunity_id: string | null
          organization_id: string | null
          owner_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          property_id: string | null
          signatories: string | null
          sponsor_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          total_value: number
          updated_at: string
          use_flat_value: boolean
        }
        Insert: {
          ai_summary?: string | null
          brand: string
          contract_number?: string | null
          created_at?: string
          custom_due_dates?: string[]
          due_day?: number | null
          due_days?: number | null
          end_date?: string | null
          file_name?: string | null
          file_path?: string | null
          flat_value?: number
          id?: string
          installments?: number
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          property_id?: string | null
          signatories?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          total_value?: number
          updated_at?: string
          use_flat_value?: boolean
        }
        Update: {
          ai_summary?: string | null
          brand?: string
          contract_number?: string | null
          created_at?: string
          custom_due_dates?: string[]
          due_day?: number | null
          due_days?: number | null
          end_date?: string | null
          file_name?: string | null
          file_path?: string | null
          flat_value?: number
          id?: string
          installments?: number
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          property_id?: string | null
          signatories?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          total_value?: number
          updated_at?: string
          use_flat_value?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contracts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          organization_id: string
          priority: string
          source: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_brand_id: string | null
          sponsor_id: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id: string
          priority?: string
          source?: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_brand_id?: string | null
          sponsor_id: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string
          priority?: string
          source?: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_brand_id?: string | null
          sponsor_id?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_sponsor_brand_id_fkey"
            columns: ["sponsor_brand_id"]
            isOneToOne: false
            referencedRelation: "sponsor_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          approval: Database["public"]["Enums"]["delivery_approval"]
          approval_comment: string | null
          asset_type: string | null
          brand: string
          contract_id: string | null
          created_at: string
          delivered_at: string | null
          description: string | null
          due_date: string | null
          evidence_geo: Json | null
          evidence_taken_at: string | null
          evidence_taken_by: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
          organization_id: string | null
          owner_id: string
          position: number
          property_id: string | null
          quantity: number
          sponsor_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approval?: Database["public"]["Enums"]["delivery_approval"]
          approval_comment?: string | null
          asset_type?: string | null
          brand: string
          contract_id?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          evidence_geo?: Json | null
          evidence_taken_at?: string | null
          evidence_taken_by?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id: string
          position?: number
          property_id?: string | null
          quantity?: number
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approval?: Database["public"]["Enums"]["delivery_approval"]
          approval_comment?: string | null
          asset_type?: string | null
          brand?: string
          contract_id?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          evidence_geo?: Json | null
          evidence_taken_at?: string | null
          evidence_taken_by?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id?: string
          position?: number
          property_id?: string | null
          quantity?: number
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_sponsor_id_fkey_lovable"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_approval_log: {
        Row: {
          comment: string | null
          created_at: string
          decided_by: string
          decided_by_role: string
          decision: Database["public"]["Enums"]["delivery_approval"]
          delivery_id: string
          id: string
          organization_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_by: string
          decided_by_role: string
          decision: Database["public"]["Enums"]["delivery_approval"]
          delivery_id: string
          id?: string
          organization_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_by?: string
          decided_by_role?: string
          decision?: Database["public"]["Enums"]["delivery_approval"]
          delivery_id?: string
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_approval_log_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_approval_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attachments: {
        Row: {
          created_at: string
          delivery_id: string
          file_name: string | null
          geo: Json | null
          id: string
          kind: string
          mime_type: string | null
          organization_id: string | null
          owner_id: string
          position: number
          size_bytes: number | null
          storage_path: string
          taken_at: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          file_name?: string | null
          geo?: Json | null
          id?: string
          kind?: string
          mime_type?: string | null
          organization_id?: string | null
          owner_id: string
          position?: number
          size_bytes?: number | null
          storage_path: string
          taken_at?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          file_name?: string | null
          geo?: Json | null
          id?: string
          kind?: string
          mime_type?: string | null
          organization_id?: string | null
          owner_id?: string
          position?: number
          size_bytes?: number | null
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attachments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          component_stack: string | null
          created_at: string
          id: string
          message: string
          metadata: Json
          organization_id: string | null
          route: string | null
          severity: string
          source: string
          stack: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          organization_id?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          organization_id?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          organization_id: string | null
          owner_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          sponsor_id: string | null
          status: Database["public"]["Enums"]["installment_status"]
          total_installments: number
          updated_at: string
        }
        Insert: {
          amount?: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          organization_id?: string | null
          owner_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          total_installments?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          organization_id?: string | null
          owner_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          total_installments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_sponsor_id_fkey_lovable"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          approach_argument: string | null
          classification: string
          created_at: string
          fit_audience: number | null
          fit_history: number | null
          fit_segment: number | null
          id: string
          model: string | null
          organization_id: string | null
          owner_id: string
          property_id: string | null
          reasons: Json
          score: number
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          approach_argument?: string | null
          classification?: string
          created_at?: string
          fit_audience?: number | null
          fit_history?: number | null
          fit_segment?: number | null
          id?: string
          model?: string | null
          organization_id?: string | null
          owner_id: string
          property_id?: string | null
          reasons?: Json
          score?: number
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          approach_argument?: string | null
          classification?: string
          created_at?: string
          fit_audience?: number | null
          fit_history?: number | null
          fit_segment?: number | null
          id?: string
          model?: string | null
          organization_id?: string | null
          owner_id?: string
          property_id?: string | null
          reasons?: Json
          score?: number
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scores_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      market_benchmarks: {
        Row: {
          generated_at: string
          id: string
          market_avg_ticket: number
          market_max: number | null
          market_min: number | null
          model: string | null
          notes: string | null
          organization_id: string
          segment: string
        }
        Insert: {
          generated_at?: string
          id?: string
          market_avg_ticket?: number
          market_max?: number | null
          market_min?: number | null
          model?: string | null
          notes?: string | null
          organization_id: string
          segment: string
        }
        Update: {
          generated_at?: string
          id?: string
          market_avg_ticket?: number
          market_max?: number | null
          market_min?: number | null
          model?: string | null
          notes?: string | null
          organization_id?: string
          segment?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_benchmarks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          categories: Json
          email_enabled: boolean
          inapp_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          email_enabled?: boolean
          inapp_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          email_enabled?: boolean
          inapp_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          category: string
          created_at: string
          dedupe_key: string | null
          description: string | null
          email_sent_at: string | null
          id: string
          metadata: Json
          organization_id: string | null
          priority: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          category: string
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          email_sent_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          priority?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          email_sent_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          priority?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          assignee_id: string | null
          brand: string
          converted_contract_id: string | null
          converted_proposal_id: string | null
          created_at: string
          decided_at: string | null
          expected_close_date: string | null
          id: string
          last_stage_change_at: string
          lost_comment: string | null
          lost_competitor: string | null
          lost_reason: string | null
          lost_value: number | null
          notes: string | null
          organization_id: string | null
          owner_id: string
          pipeline_funnel_id: string | null
          position: number
          property_id: string | null
          sponsor_id: string | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          tier_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          assignee_id?: string | null
          brand: string
          converted_contract_id?: string | null
          converted_proposal_id?: string | null
          created_at?: string
          decided_at?: string | null
          expected_close_date?: string | null
          id?: string
          last_stage_change_at?: string
          lost_comment?: string | null
          lost_competitor?: string | null
          lost_reason?: string | null
          lost_value?: number | null
          notes?: string | null
          organization_id?: string | null
          owner_id: string
          pipeline_funnel_id?: string | null
          position?: number
          property_id?: string | null
          sponsor_id?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          tier_id?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          assignee_id?: string | null
          brand?: string
          converted_contract_id?: string | null
          converted_proposal_id?: string | null
          created_at?: string
          decided_at?: string | null
          expected_close_date?: string | null
          id?: string
          last_stage_change_at?: string
          lost_comment?: string | null
          lost_competitor?: string | null
          lost_reason?: string | null
          lost_value?: number | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string
          pipeline_funnel_id?: string | null
          position?: number
          property_id?: string | null
          sponsor_id?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          tier_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_converted_proposal_id_fkey"
            columns: ["converted_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_funnel_id_fkey"
            columns: ["pipeline_funnel_id"]
            isOneToOne: false
            referencedRelation: "pipeline_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_activities: {
        Row: {
          activity_type: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          opportunity_id: string
          organization_id: string | null
          owner_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id: string
          organization_id?: string | null
          owner_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string
          organization_id?: string | null
          owner_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_stage: Database["public"]["Enums"]["opportunity_stage"] | null
          id: string
          metadata: Json
          new_value: number | null
          old_value: number | null
          opportunity_id: string
          organization_id: string
          to_stage: Database["public"]["Enums"]["opportunity_stage"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          metadata?: Json
          new_value?: number | null
          old_value?: number | null
          opportunity_id: string
          organization_id: string
          to_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
          id?: string
          metadata?: Json
          new_value?: number | null
          old_value?: number | null
          opportunity_id?: string
          organization_id?: string
          to_stage?: Database["public"]["Enums"]["opportunity_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_comment_attachments: {
        Row: {
          comment_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          opportunity_id: string
          organization_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          opportunity_id: string
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          opportunity_id?: string
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "opportunity_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_comment_attachments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_comment_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          kind: string
          mentions: string[]
          opportunity_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          mentions?: string[]
          opportunity_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          mentions?: string[]
          opportunity_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_comments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_contacts: {
        Row: {
          contact_type: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          opportunity_id: string
          organization_id: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          contact_type?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          opportunity_id: string
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          contact_type?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          opportunity_id?: string
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_contacts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          cnpj: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          legal_name: string | null
          legal_representative: string | null
          locale: string
          logo_path: string | null
          name: string
          owner_id: string
          phone: string | null
          state_registration: string | null
          timezone: string
          trade_name: string | null
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          legal_representative?: string | null
          locale?: string
          logo_path?: string | null
          name: string
          owner_id: string
          phone?: string | null
          state_registration?: string | null
          timezone?: string
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          cnpj?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          legal_representative?: string | null
          locale?: string
          logo_path?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          state_registration?: string | null
          timezone?: string
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      pipeline_funnels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stage_slas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          pipeline_funnel_id: string | null
          sla_days: number | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          pipeline_funnel_id?: string | null
          sla_days?: number | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          pipeline_funnel_id?: string | null
          sla_days?: number | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_slas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_slas_pipeline_funnel_id_fkey"
            columns: ["pipeline_funnel_id"]
            isOneToOne: false
            referencedRelation: "pipeline_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_checklist_items: {
        Row: {
          assignee: string | null
          completed_at: string | null
          created_at: string
          delivery_id: string | null
          description: string | null
          due_date: string | null
          event_id: string | null
          evidence_geo: Json | null
          evidence_path: string | null
          evidence_taken_at: string | null
          evidence_taken_by: string | null
          id: string
          opportunity_id: string | null
          organization_id: string | null
          owner_id: string
          position: number
          property_id: string
          sponsor_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_id?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          evidence_geo?: Json | null
          evidence_path?: string | null
          evidence_taken_at?: string | null
          evidence_taken_by?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id: string
          position?: number
          property_id: string
          sponsor_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_id?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          evidence_geo?: Json | null
          evidence_path?: string | null
          evidence_taken_at?: string | null
          evidence_taken_by?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string | null
          owner_id?: string
          position?: number
          property_id?: string
          sponsor_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_checklist_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "property_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_checklist_items_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      property_events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          location: string | null
          organization_id: string | null
          owner_id: string
          property_id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          organization_id?: string | null
          owner_id: string
          property_id: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          organization_id?: string | null
          owner_id?: string
          property_id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_leads: {
        Row: {
          budget_range: string | null
          company: string | null
          contact_name: string
          created_at: string
          created_opportunity_id: string | null
          email: string
          id: string
          message: string | null
          organization_id: string | null
          owner_id: string
          phone: string | null
          property_id: string
          status: string
          tier_id: string | null
        }
        Insert: {
          budget_range?: string | null
          company?: string | null
          contact_name: string
          created_at?: string
          created_opportunity_id?: string | null
          email: string
          id?: string
          message?: string | null
          organization_id?: string | null
          owner_id: string
          phone?: string | null
          property_id: string
          status?: string
          tier_id?: string | null
        }
        Update: {
          budget_range?: string | null
          company?: string | null
          contact_name?: string
          created_at?: string
          created_opportunity_id?: string | null
          email?: string
          id?: string
          message?: string | null
          organization_id?: string | null
          owner_id?: string
          phone?: string | null
          property_id?: string
          status?: string
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_leads_created_opportunity_id_fkey"
            columns: ["created_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_leads_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          caption: string | null
          created_at: string
          external_url: string | null
          id: string
          is_cover: boolean
          media_type: string
          organization_id: string | null
          owner_id: string
          position: number
          property_id: string
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_cover?: boolean
          media_type?: string
          organization_id?: string | null
          owner_id: string
          position?: number
          property_id: string
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          is_cover?: boolean
          media_type?: string
          organization_id?: string | null
          owner_id?: string
          position?: number
          property_id?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          asset_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          position: number
          proposal_id: string
          quantity: number
          unit_value: number
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          position?: number
          proposal_id: string
          quantity?: number
          unit_value?: number
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          position?: number
          proposal_id?: string
          quantity?: number
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          metadata: Json
          model: string | null
          organization_id: string | null
          owner_id: string
          proposal_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          organization_id?: string | null
          owner_id: string
          proposal_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          organization_id?: string | null
          owner_id?: string
          proposal_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          brand: string | null
          converted_contract_id: string | null
          converted_opportunity_id: string | null
          created_at: string
          decided_at: string | null
          flat_value: number
          id: string
          message: string | null
          organization_id: string | null
          owner_id: string
          pdf_path: string | null
          property_id: string | null
          proposal_number: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          sent_at: string | null
          sponsor_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          total_value: number
          updated_at: string
          use_flat_value: boolean
          valid_until: string | null
        }
        Insert: {
          brand?: string | null
          converted_contract_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          decided_at?: string | null
          flat_value?: number
          id?: string
          message?: string | null
          organization_id?: string | null
          owner_id: string
          pdf_path?: string | null
          property_id?: string | null
          proposal_number?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          total_value?: number
          updated_at?: string
          use_flat_value?: boolean
          valid_until?: string | null
        }
        Update: {
          brand?: string | null
          converted_contract_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          decided_at?: string | null
          flat_value?: number
          id?: string
          message?: string | null
          organization_id?: string | null
          owner_id?: string
          pdf_path?: string | null
          property_id?: string | null
          proposal_number?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          total_value?: number
          updated_at?: string
          use_flat_value?: boolean
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_converted_opportunity_id_fkey"
            columns: ["converted_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sellout_reports: {
        Row: {
          content: string
          created_at: string
          event_id: string | null
          id: string
          metrics: Json
          model: string | null
          organization_id: string | null
          owner_id: string
          property_id: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          event_id?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          organization_id?: string | null
          owner_id: string
          property_id?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          event_id?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          organization_id?: string | null
          owner_id?: string
          property_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellout_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "property_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sellout_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sellout_reports_property_id_fkey_lovable"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          source: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          source?: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          source?: Database["public"]["Enums"]["crm_audit_source"]
          sponsor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_audit_logs_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_brands: {
        Row: {
          brandtrack_brand_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          organization_id: string
          sponsor_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          brandtrack_brand_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          organization_id: string
          sponsor_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          brandtrack_brand_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          organization_id?: string
          sponsor_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_brands_brandtrack_brand_id_fkey"
            columns: ["brandtrack_brand_id"]
            isOneToOne: false
            referencedRelation: "brandtrack_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_brands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_brands_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_brandtrack_profiles: {
        Row: {
          brand_colors: string[]
          created_at: string
          detection_aliases: string[]
          id: string
          notes: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          tracking_settings: Json
          updated_at: string
        }
        Insert: {
          brand_colors?: string[]
          created_at?: string
          detection_aliases?: string[]
          id?: string
          notes?: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          tracking_settings?: Json
          updated_at?: string
        }
        Update: {
          brand_colors?: string[]
          created_at?: string
          detection_aliases?: string[]
          id?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string
          sponsor_id?: string
          tracking_settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_brandtrack_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_brandtrack_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          organization_id: string | null
          phone: string | null
          role: string | null
          sponsor_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          sponsor_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          organization_id?: string | null
          phone?: string | null
          role?: string | null
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_contacts_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_contract_profiles: {
        Row: {
          billing_contact: string | null
          contract_preferences: Json
          created_at: string
          id: string
          legal_name: string | null
          notes: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          billing_contact?: string | null
          contract_preferences?: Json
          created_at?: string
          id?: string
          legal_name?: string | null
          notes?: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_contact?: string | null
          contract_preferences?: Json
          created_at?: string
          id?: string
          legal_name?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string
          sponsor_id?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_contract_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_contract_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_crm_profiles: {
        Row: {
          created_at: string
          id: string
          last_contact_at: string | null
          notes: string | null
          organization_id: string
          owner_id: string
          score: Database["public"]["Enums"]["sponsor_score"]
          segment: string | null
          sponsor_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          organization_id: string
          owner_id: string
          score?: Database["public"]["Enums"]["sponsor_score"]
          segment?: string | null
          sponsor_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string
          score?: Database["public"]["Enums"]["sponsor_score"]
          segment?: string | null
          sponsor_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_crm_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_crm_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_delivery_profiles: {
        Row: {
          approval_contact: string | null
          created_at: string
          evidence_preferences: Json
          id: string
          notes: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          updated_at: string
        }
        Insert: {
          approval_contact?: string | null
          created_at?: string
          evidence_preferences?: Json
          id?: string
          notes?: string | null
          organization_id: string
          owner_id: string
          sponsor_id: string
          updated_at?: string
        }
        Update: {
          approval_contact?: string | null
          created_at?: string
          evidence_preferences?: Json
          id?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string
          sponsor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_delivery_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_delivery_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_documents: {
        Row: {
          ai_enabled: boolean
          ai_summary: string | null
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          journey_stage: string | null
          organization_id: string
          sponsor_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_enabled?: boolean
          ai_summary?: string | null
          category?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          journey_stage?: string | null
          organization_id: string
          sponsor_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_enabled?: boolean
          ai_summary?: string | null
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          journey_stage?: string | null
          organization_id?: string
          sponsor_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_documents_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_executive_summaries: {
        Row: {
          generated_at: string
          highlights: Json
          model: string | null
          organization_id: string | null
          owner_id: string
          sponsor_id: string
          summary: string
        }
        Insert: {
          generated_at?: string
          highlights?: Json
          model?: string | null
          organization_id?: string | null
          owner_id: string
          sponsor_id: string
          summary: string
        }
        Update: {
          generated_at?: string
          highlights?: Json
          model?: string | null
          organization_id?: string | null
          owner_id?: string
          sponsor_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_executive_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_executive_summaries_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_finance_profiles: {
        Row: {
          billing_email: string | null
          created_at: string
          id: string
          invoice_data: Json
          notes: string | null
          organization_id: string
          owner_id: string
          payment_terms: string | null
          sponsor_id: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          id?: string
          invoice_data?: Json
          notes?: string | null
          organization_id: string
          owner_id: string
          payment_terms?: string | null
          sponsor_id: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          id?: string
          invoice_data?: Json
          notes?: string | null
          organization_id?: string
          owner_id?: string
          payment_terms?: string | null
          sponsor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_finance_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_finance_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_interactions: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          next_action: string | null
          next_action_at: string | null
          next_action_done: boolean
          occurred_at: string
          organization_id: string | null
          owner_id: string
          related_contract_id: string | null
          related_delivery_id: string | null
          related_installment_id: string | null
          related_opportunity_id: string | null
          related_proposal_id: string | null
          source: Database["public"]["Enums"]["sponsor_interaction_source"]
          sponsor_id: string
          title: string
          type: Database["public"]["Enums"]["sponsor_interaction_type"]
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          next_action?: string | null
          next_action_at?: string | null
          next_action_done?: boolean
          occurred_at?: string
          organization_id?: string | null
          owner_id: string
          related_contract_id?: string | null
          related_delivery_id?: string | null
          related_installment_id?: string | null
          related_opportunity_id?: string | null
          related_proposal_id?: string | null
          source?: Database["public"]["Enums"]["sponsor_interaction_source"]
          sponsor_id: string
          title: string
          type?: Database["public"]["Enums"]["sponsor_interaction_type"]
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          next_action?: string | null
          next_action_at?: string | null
          next_action_done?: boolean
          occurred_at?: string
          organization_id?: string | null
          owner_id?: string
          related_contract_id?: string | null
          related_delivery_id?: string | null
          related_installment_id?: string | null
          related_opportunity_id?: string | null
          related_proposal_id?: string | null
          source?: Database["public"]["Enums"]["sponsor_interaction_source"]
          sponsor_id?: string
          title?: string
          type?: Database["public"]["Enums"]["sponsor_interaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_related_contract_id_fkey"
            columns: ["related_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_related_delivery_id_fkey"
            columns: ["related_delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_related_installment_id_fkey"
            columns: ["related_installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_related_opportunity_id_fkey"
            columns: ["related_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_related_proposal_id_fkey"
            columns: ["related_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_interactions_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string | null
          sponsor_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id?: string | null
          sponsor_id: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string | null
          sponsor_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_invites_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_portal_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          organization_id: string | null
          sponsor_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          organization_id?: string | null
          sponsor_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          organization_id?: string | null
          sponsor_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_portal_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_portal_access_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_portal_profiles: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          owner_id: string
          portal_display_name: string | null
          portal_settings: Json
          sponsor_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          owner_id: string
          portal_display_name?: string | null
          portal_settings?: Json
          sponsor_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string
          portal_display_name?: string | null
          portal_settings?: Json
          sponsor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_portal_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_portal_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_proposal_profiles: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          owner_id: string
          preferred_contact_email: string | null
          preferred_contact_name: string | null
          proposal_preferences: Json
          sponsor_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          owner_id: string
          preferred_contact_email?: string | null
          preferred_contact_name?: string | null
          proposal_preferences?: Json
          sponsor_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string
          preferred_contact_email?: string | null
          preferred_contact_name?: string | null
          proposal_preferences?: Json
          sponsor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_proposal_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_proposal_profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: true
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          about: string | null
          account_owner_id: string | null
          address: string | null
          address_city: string | null
          address_state: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          domain: string | null
          fans_count: number | null
          final_location: string | null
          health: Database["public"]["Enums"]["sponsor_health"]
          id: string
          key_notes: string | null
          last_contact_at: string | null
          legal_name: string | null
          lifecycle: Database["public"]["Enums"]["sponsor_lifecycle"]
          locations: string[]
          logo_path: string | null
          merged_into_sponsor_id: string | null
          name: string
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          organization_id: string | null
          owner_id: string
          participants_count: number | null
          priority: Database["public"]["Enums"]["sponsor_priority"]
          prize_pool: number | null
          score: Database["public"]["Enums"]["sponsor_score"]
          segment: string | null
          social_links: Json
          social_stats: Json
          tags: string[]
          tax_id: string | null
          teams_count: number | null
          trade_name: string | null
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          about?: string | null
          account_owner_id?: string | null
          address?: string | null
          address_city?: string | null
          address_state?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          domain?: string | null
          fans_count?: number | null
          final_location?: string | null
          health?: Database["public"]["Enums"]["sponsor_health"]
          id?: string
          key_notes?: string | null
          last_contact_at?: string | null
          legal_name?: string | null
          lifecycle?: Database["public"]["Enums"]["sponsor_lifecycle"]
          locations?: string[]
          logo_path?: string | null
          merged_into_sponsor_id?: string | null
          name: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id: string
          participants_count?: number | null
          priority?: Database["public"]["Enums"]["sponsor_priority"]
          prize_pool?: number | null
          score?: Database["public"]["Enums"]["sponsor_score"]
          segment?: string | null
          social_links?: Json
          social_stats?: Json
          tags?: string[]
          tax_id?: string | null
          teams_count?: number | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          about?: string | null
          account_owner_id?: string | null
          address?: string | null
          address_city?: string | null
          address_state?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          domain?: string | null
          fans_count?: number | null
          final_location?: string | null
          health?: Database["public"]["Enums"]["sponsor_health"]
          id?: string
          key_notes?: string | null
          last_contact_at?: string | null
          legal_name?: string | null
          lifecycle?: Database["public"]["Enums"]["sponsor_lifecycle"]
          locations?: string[]
          logo_path?: string | null
          merged_into_sponsor_id?: string | null
          name?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string
          participants_count?: number | null
          priority?: Database["public"]["Enums"]["sponsor_priority"]
          prize_pool?: number | null
          score?: Database["public"]["Enums"]["sponsor_score"]
          segment?: string | null
          social_links?: Json
          social_stats?: Json
          tags?: string[]
          tax_id?: string | null
          teams_count?: number | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_merged_into_sponsor_id_fkey_lovable"
            columns: ["merged_into_sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorship_tiers: {
        Row: {
          benefits: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          level: string
          name: string
          organization_id: string | null
          owner_id: string
          position: number
          property_id: string
          total_slots: number
          updated_at: string
          value: number
        }
        Insert: {
          benefits?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: string
          name: string
          organization_id?: string | null
          owner_id: string
          position?: number
          property_id: string
          total_slots?: number
          updated_at?: string
          value?: number
        }
        Update: {
          benefits?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
          position?: number
          property_id?: string
          total_slots?: number
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sponsorship_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorship_tiers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_properties: {
        Row: {
          about: string | null
          audience_estimate: number | null
          category: string
          created_at: string
          description: string | null
          end_date: string | null
          fans_count: number | null
          final_location: string | null
          id: string
          is_published: boolean
          key_notes: string | null
          locations: string[]
          name: string
          organization_id: string | null
          owner_id: string
          parent_property_id: string | null
          participants_count: number | null
          prize_pool: number | null
          public_about: string | null
          public_cover_path: string | null
          public_headline: string | null
          public_slug: string | null
          season_year: number | null
          social_links: Json
          social_stats: Json
          start_date: string | null
          status: string
          teams_count: number | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          audience_estimate?: number | null
          category: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          fans_count?: number | null
          final_location?: string | null
          id?: string
          is_published?: boolean
          key_notes?: string | null
          locations?: string[]
          name: string
          organization_id?: string | null
          owner_id: string
          parent_property_id?: string | null
          participants_count?: number | null
          prize_pool?: number | null
          public_about?: string | null
          public_cover_path?: string | null
          public_headline?: string | null
          public_slug?: string | null
          season_year?: number | null
          social_links?: Json
          social_stats?: Json
          start_date?: string | null
          status?: string
          teams_count?: number | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          audience_estimate?: number | null
          category?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          fans_count?: number | null
          final_location?: string | null
          id?: string
          is_published?: boolean
          key_notes?: string | null
          locations?: string[]
          name?: string
          organization_id?: string | null
          owner_id?: string
          parent_property_id?: string | null
          participants_count?: number | null
          prize_pool?: number | null
          public_about?: string | null
          public_cover_path?: string | null
          public_headline?: string | null
          public_slug?: string | null
          season_year?: number | null
          social_links?: Json
          social_stats?: Json
          start_date?: string | null
          status?: string
          teams_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_properties_parent_property_id_fkey"
            columns: ["parent_property_id"]
            isOneToOne: false
            referencedRelation: "sports_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json
          new_role: Database["public"]["Enums"]["org_role"] | null
          old_role: Database["public"]["Enums"]["org_role"] | null
          organization_id: string
          target_email: string | null
          target_member_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: Database["public"]["Enums"]["org_role"] | null
          old_role?: Database["public"]["Enums"]["org_role"] | null
          organization_id: string
          target_email?: string | null
          target_member_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          new_role?: Database["public"]["Enums"]["org_role"] | null
          old_role?: Database["public"]["Enums"]["org_role"] | null
          organization_id?: string
          target_email?: string | null
          target_member_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_log_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_assets: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          organization_id: string | null
          quantity: number
          tier_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          quantity?: number
          tier_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          quantity?: number
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_assets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_sales: {
        Row: {
          brand: string | null
          contract_id: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string | null
          owner_id: string
          sold_at: string
          sponsor_id: string | null
          status: string
          tier_id: string
        }
        Insert: {
          brand?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_id: string
          sold_at?: string
          sponsor_id?: string | null
          status?: string
          tier_id: string
        }
        Update: {
          brand?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_id?: string
          sold_at?: string
          sponsor_id?: string | null
          status?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_sales_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_sales_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_sales_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dashboard_preferences: {
        Row: {
          organization_id: string
          updated_at: string
          user_id: string
          widgets: Json
        }
        Insert: {
          organization_id: string
          updated_at?: string
          user_id: string
          widgets?: Json
        }
        Update: {
          organization_id?: string
          updated_at?: string
          user_id?: string
          widgets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_dashboard_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stage_probabilities: {
        Row: {
          organization_id: string
          probability: number
          stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          organization_id: string
          probability?: number
          stage: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          organization_id?: string
          probability?: number
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stage_probabilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_unlinked_records: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          label: string | null
          organization_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_sponsor_invite_by_token: {
        Args: { p_token: string }
        Returns: boolean
      }
      archive_sponsor: {
        Args: { _reason: string; _sponsor_id: string }
        Returns: undefined
      }
      can_access_contract_file: {
        Args: { _path: string; _user_id: string }
        Returns: boolean
      }
      can_access_module: {
        Args: {
          _module: string
          _org_id: string
          _user_id: string
          _write: boolean
        }
        Returns: boolean
      }
      copy_opportunity_tier_to_contract: {
        Args: { _contract_id: string; _opportunity_id: string }
        Returns: undefined
      }
      copy_opportunity_tier_to_proposal: {
        Args: { _opportunity_id: string; _proposal_id: string }
        Returns: undefined
      }
      copy_proposal_items_to_contract: {
        Args: { _contract_id: string; _proposal_id: string }
        Returns: undefined
      }
      create_organization_with_owner: {
        Args: { _cnpj?: string; _name: string; _owner_id: string }
        Returns: string
      }
      create_renewal_opportunity: {
        Args: { _contract_id: string }
        Returns: string
      }
      debug_table_policies: { Args: { _table_name: string }; Returns: Json }
      generate_contract_deliveries: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      generate_contract_installments: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      get_delivery_report_data: {
        Args: { _contract_id?: string; _opportunity_id: string }
        Returns: Json
      }
      get_organization_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          organization_name: string
          role: string
          status: string
        }[]
      }
      get_portal_sponsor_overview: {
        Args: { _sponsor_id: string }
        Returns: Json
      }
      get_sponsor_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          sponsor_name: string
          status: string
        }[]
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_org_role:
        | {
            Args: {
              _org_id: string
              _roles: Database["public"]["Enums"]["org_role"][]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: { allowed_roles: string[]; target_org_id: string }
            Returns: boolean
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_sponsor_access: {
        Args: { _sponsor_id: string; _user_id: string }
        Returns: boolean
      }
      has_sponsor_portal_access: {
        Args: { target_sponsor_id: string }
        Returns: boolean
      }
      is_asset_publicly_visible: {
        Args: { target_asset_id: string }
        Returns: boolean
      }
      is_org_member:
        | { Args: { _org_id: string; _user_id: string }; Returns: boolean }
        | { Args: { target_org_id: string }; Returns: boolean }
      is_property_published: {
        Args: { target_property_id: string }
        Returns: boolean
      }
      is_sponsor_publicly_visible: {
        Args: { target_sponsor_id: string }
        Returns: boolean
      }
      is_tier_publicly_visible: {
        Args: { target_tier_id: string }
        Returns: boolean
      }
      log_sponsor_interaction: {
        Args: {
          _contract_id: string
          _delivery_id: string
          _description: string
          _installment_id: string
          _metadata: Json
          _opportunity_id: string
          _owner_id: string
          _proposal_id: string
          _sponsor_id: string
          _title: string
          _type: Database["public"]["Enums"]["sponsor_interaction_type"]
        }
        Returns: undefined
      }
      mark_overdue_installments: {
        Args: { _owner: string }
        Returns: undefined
      }
      merge_sponsors: {
        Args: { _duplicate_id: string; _target_id: string }
        Returns: Json
      }
      safe_uuid: { Args: { value: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_opportunity_contact_to_sponsor: {
        Args: { _contact_id: string }
        Returns: undefined
      }
      sync_opportunity_stage: {
        Args: {
          _opportunity_id: string
          _target: Database["public"]["Enums"]["opportunity_stage"]
        }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      unarchive_sponsor: {
        Args: {
          _lifecycle?: Database["public"]["Enums"]["sponsor_lifecycle"]
          _sponsor_id: string
        }
        Returns: undefined
      }
      user_sponsor_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "comercial" | "patrocinador"
      contract_status:
        | "rascunho"
        | "em_assinatura"
        | "ativo"
        | "vencendo"
        | "encerrado"
        | "cancelado"
      crm_audit_source: "manual" | "automatico" | "ia"
      delivery_approval: "pendente" | "aprovada" | "reprovada"
      delivery_status:
        | "pendente"
        | "em_producao"
        | "entregue"
        | "aprovada"
        | "atrasada"
      installment_status: "pendente" | "pago" | "atrasado" | "cancelado"
      opportunity_stage:
        | "prospect"
        | "reuniao"
        | "proposta_enviada"
        | "negociacao"
        | "fechado"
        | "perdido"
      org_role: "owner" | "admin" | "comercial" | "operacional" | "financeiro"
      payment_method:
        | "a_vista"
        | "parcelado"
        | "mensal"
        | "personalizado"
        | "quinzenal"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
      proposal_status:
        | "rascunho"
        | "enviada"
        | "aceita"
        | "recusada"
        | "expirada"
      sponsor_health: "saudavel" | "atencao" | "risco" | "nao_aplicavel"
      sponsor_interaction_source: "manual" | "auto"
      sponsor_interaction_type:
        | "reuniao"
        | "ligacao"
        | "email"
        | "whatsapp"
        | "nota"
        | "proposta"
        | "contrato"
        | "oportunidade"
        | "entrega"
        | "parcela"
        | "sistema"
      sponsor_lifecycle:
        | "prospect"
        | "em_abordagem"
        | "qualificado"
        | "em_negociacao"
        | "cliente_ativo"
        | "cliente_inativo"
        | "perdido"
        | "arquivado"
      sponsor_priority: "A" | "B" | "C"
      sponsor_score: "quente" | "morno" | "frio"
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
    Enums: {
      app_role: ["admin", "comercial", "patrocinador"],
      contract_status: [
        "rascunho",
        "em_assinatura",
        "ativo",
        "vencendo",
        "encerrado",
        "cancelado",
      ],
      crm_audit_source: ["manual", "automatico", "ia"],
      delivery_approval: ["pendente", "aprovada", "reprovada"],
      delivery_status: [
        "pendente",
        "em_producao",
        "entregue",
        "aprovada",
        "atrasada",
      ],
      installment_status: ["pendente", "pago", "atrasado", "cancelado"],
      opportunity_stage: [
        "prospect",
        "reuniao",
        "proposta_enviada",
        "negociacao",
        "fechado",
        "perdido",
      ],
      org_role: ["owner", "admin", "comercial", "operacional", "financeiro"],
      payment_method: [
        "a_vista",
        "parcelado",
        "mensal",
        "personalizado",
        "quinzenal",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
      ],
      proposal_status: [
        "rascunho",
        "enviada",
        "aceita",
        "recusada",
        "expirada",
      ],
      sponsor_health: ["saudavel", "atencao", "risco", "nao_aplicavel"],
      sponsor_interaction_source: ["manual", "auto"],
      sponsor_interaction_type: [
        "reuniao",
        "ligacao",
        "email",
        "whatsapp",
        "nota",
        "proposta",
        "contrato",
        "oportunidade",
        "entrega",
        "parcela",
        "sistema",
      ],
      sponsor_lifecycle: [
        "prospect",
        "em_abordagem",
        "qualificado",
        "em_negociacao",
        "cliente_ativo",
        "cliente_inativo",
        "perdido",
        "arquivado",
      ],
      sponsor_priority: ["A", "B", "C"],
      sponsor_score: ["quente", "morno", "frio"],
    },
  },
} as const
