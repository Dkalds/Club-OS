// ESCRITO A MANO a partir de supabase/migrations/, con la forma que produce
// `supabase gen types typescript`. `pnpm db:types` no se pudo ejecutar porque no había
// una base de datos local disponible. En cuanto haya una, regenera este archivo con
// `pnpm db:types` y revisa el diff: el archivo generado manda.
//
// Diferencias conocidas con la salida real: falta la clave `__InternalSupabase`
// (versión de PostgREST), que solo se conoce con la base arrancada.
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
      categories: {
        Row: {
          age_band: string
          id: string
          name: string
          organization_id: string
          sort: number
        }
        Insert: {
          age_band: string
          id?: string
          name: string
          organization_id: string
          sort?: number
        }
        Update: {
          age_band?: string
          id?: string
          name?: string
          organization_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          person_id: string | null
          role: Database["public"]["Enums"]["org_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          person_id?: string | null
          role: Database["public"]["Enums"]["org_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          person_id?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_person_id_fkey"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          color_accent: string
          color_accent_pressed: string
          color_accent_soft: string
          color_on_accent: string
          display_name: string
          organization_id: string
          short_name: string
          tagline: string | null
          terminology: Json
          updated_at: string
          way_name: string
          wordmark_sub: string | null
        }
        Insert: {
          color_accent: string
          color_accent_pressed: string
          color_accent_soft: string
          color_on_accent: string
          display_name: string
          organization_id: string
          short_name: string
          tagline?: string | null
          terminology?: Json
          updated_at?: string
          way_name: string
          wordmark_sub?: string | null
        }
        Update: {
          color_accent?: string
          color_accent_pressed?: string
          color_accent_soft?: string
          color_on_accent?: string
          display_name?: string
          organization_id?: string
          short_name?: string
          tagline?: string | null
          terminology?: Json
          updated_at?: string
          way_name?: string
          wordmark_sub?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          archived_at: string | null
          birth_year: number | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          organization_id: string
        }
        Insert: {
          archived_at?: string | null
          birth_year?: number | null
          created_at?: string
          first_name: string
          id?: string
          last_name: string
          organization_id: string
        }
        Update: {
          archived_at?: string | null
          birth_year?: number | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          locale: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          locale?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          locale?: string
          user_id?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          ends_on: string
          id: string
          is_current: boolean
          name: string
          organization_id: string
          starts_on: string
        }
        Insert: {
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          organization_id: string
          starts_on: string
        }
        Update: {
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          organization_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_players: {
        Row: {
          jersey_number: number | null
          organization_id: string
          person_id: string
          position: string | null
          team_id: string
        }
        Insert: {
          jersey_number?: number | null
          organization_id: string
          person_id: string
          position?: string | null
          team_id: string
        }
        Update: {
          jersey_number?: number | null
          organization_id?: string
          person_id?: string
          position?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_organization_id_person_id_fkey"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "team_players_organization_id_team_id_fkey"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      team_staff: {
        Row: {
          organization_id: string
          person_id: string
          staff_role: Database["public"]["Enums"]["staff_role"]
          team_id: string
        }
        Insert: {
          organization_id: string
          person_id: string
          staff_role: Database["public"]["Enums"]["staff_role"]
          team_id: string
        }
        Update: {
          organization_id?: string
          person_id?: string
          staff_role?: Database["public"]["Enums"]["staff_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_staff_organization_id_person_id_fkey"
            columns: ["organization_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "team_staff_organization_id_team_id_fkey"
            columns: ["organization_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      teams: {
        Row: {
          category_id: string
          id: string
          name: string
          organization_id: string
          season_id: string
        }
        Insert: {
          category_id: string
          id?: string
          name: string
          organization_id: string
          season_id: string
        }
        Update: {
          category_id?: string
          id?: string
          name?: string
          organization_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_category_id_fkey"
            columns: ["organization_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_season_id_fkey"
            columns: ["organization_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      org_role: "admin" | "coach" | "player" | "guardian"
      staff_role: "head_coach" | "assistant"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      org_role: ["admin", "coach", "player", "guardian"],
      staff_role: ["head_coach", "assistant"],
    },
  },
} as const
