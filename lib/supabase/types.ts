export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          demo_owner_id: string | null
          id: boolean
        }
        Insert: {
          demo_owner_id?: string | null
          id?: boolean
        }
        Update: {
          demo_owner_id?: string | null
          id?: boolean
        }
        Relationships: []
      }
      audio_overviews: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error: string | null
          id: string
          notebook_id: string
          progress: Json | null
          script: Json | null
          source_fingerprint: string | null
          status: string
          storage_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          notebook_id: string
          progress?: Json | null
          script?: Json | null
          source_fingerprint?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          id?: string
          notebook_id?: string
          progress?: Json | null
          script?: Json | null
          source_fingerprint?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_overviews_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          content: string
          embedding: string | null
          fts: unknown
          id: string
          notebook_id: string
          ordinal: number
          page_from: number | null
          page_to: number | null
          source_id: string
          token_count: number | null
          user_id: string
        }
        Insert: {
          content: string
          embedding?: string | null
          fts?: unknown
          id?: string
          notebook_id: string
          ordinal: number
          page_from?: number | null
          page_to?: number | null
          source_id: string
          token_count?: number | null
          user_id?: string
        }
        Update: {
          content?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          notebook_id?: string
          ordinal?: number
          page_from?: number | null
          page_to?: number | null
          source_id?: string
          token_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_source_notebook_fkey"
            columns: ["source_id", "notebook_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "notebook_id"]
          },
        ]
      }
      demo_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          label: string
          max_sessions: number
          revoked_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          label: string
          max_sessions?: number
          revoked_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          label?: string
          max_sessions?: number
          revoked_at?: string | null
        }
        Relationships: []
      }
      demo_entitlements: {
        Row: {
          code_id: string
          expires_at: string
          user_id: string
        }
        Insert: {
          code_id: string
          expires_at: string
          user_id: string
        }
        Update: {
          code_id?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_entitlements_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "demo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          citations: Json | null
          content: string
          created_at: string
          id: string
          notebook_id: string
          role: string
          user_id: string
        }
        Insert: {
          citations?: Json | null
          content: string
          created_at?: string
          id?: string
          notebook_id: string
          role: string
          user_id?: string
        }
        Update: {
          citations?: Json | null
          content?: string
          created_at?: string
          id?: string
          notebook_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_guides: {
        Row: {
          created_at: string
          notebook_id: string
          questions: Json | null
          source_fingerprint: string | null
          summary: string | null
          topics: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          notebook_id: string
          questions?: Json | null
          source_fingerprint?: string | null
          summary?: string | null
          topics?: Json | null
          user_id?: string
        }
        Update: {
          created_at?: string
          notebook_id?: string
          questions?: Json | null
          source_fingerprint?: string | null
          summary?: string | null
          topics?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_guides_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: true
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      notebooks: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          citations: Json | null
          content: string
          created_at: string
          id: string
          notebook_id: string
          origin: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          citations?: Json | null
          content: string
          created_at?: string
          id?: string
          notebook_id: string
          origin: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          citations?: Json | null
          content?: string
          created_at?: string
          id?: string
          notebook_id?: string
          origin?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_state: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          char_count: number | null
          created_at: string
          error: string | null
          id: string
          kind: string
          notebook_id: string
          page_count: number | null
          progress: Json | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          char_count?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          notebook_id: string
          page_count?: number | null
          progress?: Json | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          char_count?: number | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          notebook_id?: string
          page_count?: number | null
          progress?: Json | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          last_seen_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_demo_session: {
        Args: { p_code_hash: string; p_ttl_seconds: number; p_user_id: string }
        Returns: string
      }
      claim_retention_user: {
        Args: {
          p_inactive_before: string
          p_retry_after: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_demo_entitled: { Args: never; Returns: boolean }
      list_retention_candidates: {
        Args: { p_inactive_before: string; p_limit: number }
        Returns: {
          is_anonymous: boolean
          last_active_at: string
          user_id: string
        }[]
      }
      match_chunks: {
        Args: {
          p_k?: number
          p_notebook_id: string
          p_query_embedding: string
          p_query_text: string
          p_source_ids: string[]
        }
        Returns: {
          chunk_id: string
          content: string
          fused_score: number
          page_from: number
          page_to: number
          source_id: string
          text_rank: number
          vector_score: number
        }[]
      }
      own_source_object_count: { Args: never; Returns: number }
      record_ai_usage_if_allowed: {
        Args: {
          p_daily_cap: number
          p_kind: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: string
      }
      touch_last_seen: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

