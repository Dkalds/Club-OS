export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          entity_id: string;
          entity_table: string;
          id: string;
          organization_id: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          entity_id: string;
          entity_table: string;
          id?: string;
          organization_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_table?: string;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          age_band: string;
          id: string;
          name: string;
          organization_id: string;
          sort: number;
        };
        Insert: {
          age_band: string;
          id?: string;
          name: string;
          organization_id: string;
          sort?: number;
        };
        Update: {
          age_band?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          sort?: number;
        };
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      club_values: {
        Row: {
          code: string;
          created_at: string;
          description: string;
          id: string;
          organization_id: string;
          sort: number;
          status: Database["public"]["Enums"]["content_status"];
          title: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          description: string;
          id?: string;
          organization_id: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          title?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string;
          id?: string;
          organization_id?: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "club_values_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      coach_notes: {
        Row: {
          author_id: string;
          author_person_id: string | null;
          body: string;
          created_at: string;
          id: string;
          organization_id: string;
          person_id: string;
          team_id: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["note_visibility"];
        };
        Insert: {
          author_id?: string;
          author_person_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          person_id: string;
          team_id: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["note_visibility"];
        };
        Update: {
          author_id?: string;
          author_person_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          person_id?: string;
          team_id?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["note_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "coach_notes_organization_id_author_person_id_fkey";
            columns: ["organization_id", "author_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "coach_notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coach_notes_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "coach_notes_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      consents: {
        Row: {
          body_snapshot: string;
          granted_at: string;
          granted_by: string;
          id: string;
          kind: string;
          organization_id: string;
          person_id: string | null;
          revoked_at: string | null;
        };
        Insert: {
          body_snapshot: string;
          granted_at?: string;
          granted_by: string;
          id?: string;
          kind: string;
          organization_id: string;
          person_id?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          body_snapshot?: string;
          granted_at?: string;
          granted_by?: string;
          id?: string;
          kind?: string;
          organization_id?: string;
          person_id?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      drill_coaching_points: {
        Row: {
          drill_id: string;
          id: string;
          is_key: boolean;
          organization_id: string;
          sort: number;
          text: string;
        };
        Insert: {
          drill_id: string;
          id?: string;
          is_key?: boolean;
          organization_id: string;
          sort: number;
          text: string;
        };
        Update: {
          drill_id?: string;
          id?: string;
          is_key?: boolean;
          organization_id?: string;
          sort?: number;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drill_coaching_points_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drill_coaching_points_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      drill_focus_areas: {
        Row: {
          drill_id: string;
          focus_area_id: string;
          organization_id: string;
        };
        Insert: {
          drill_id: string;
          focus_area_id: string;
          organization_id: string;
        };
        Update: {
          drill_id?: string;
          focus_area_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drill_focus_areas_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drill_focus_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drill_focus_areas_organization_id_focus_area_id_fkey";
            columns: ["organization_id", "focus_area_id"];
            isOneToOne: false;
            referencedRelation: "focus_areas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      drill_principles: {
        Row: {
          drill_id: string;
          organization_id: string;
          principle_id: string;
        };
        Insert: {
          drill_id: string;
          organization_id: string;
          principle_id: string;
        };
        Update: {
          drill_id?: string;
          organization_id?: string;
          principle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drill_principles_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drill_principles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drill_principles_organization_id_principle_id_fkey";
            columns: ["organization_id", "principle_id"];
            isOneToOne: false;
            referencedRelation: "game_principles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      drill_standards: {
        Row: {
          drill_id: string;
          organization_id: string;
          standard_id: string;
        };
        Insert: {
          drill_id: string;
          organization_id: string;
          standard_id: string;
        };
        Update: {
          drill_id?: string;
          organization_id?: string;
          standard_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drill_standards_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drill_standards_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drill_standards_organization_id_standard_id_fkey";
            columns: ["organization_id", "standard_id"];
            isOneToOne: false;
            referencedRelation: "standards";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      drill_variants: {
        Row: {
          description: string | null;
          drill_id: string;
          id: string;
          organization_id: string;
          sort: number;
          title: string;
        };
        Insert: {
          description?: string | null;
          drill_id: string;
          id?: string;
          organization_id: string;
          sort: number;
          title: string;
        };
        Update: {
          description?: string | null;
          drill_id?: string;
          id?: string;
          organization_id?: string;
          sort?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drill_variants_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drill_variants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      drills: {
        Row: {
          created_at: string;
          created_by: string | null;
          diagram_media_id: string | null;
          equipment: string[];
          id: string;
          max_age: number | null;
          max_minutes: number;
          max_players: number;
          min_age: number;
          min_minutes: number;
          min_players: number;
          objective: string | null;
          organization_id: string;
          search: unknown;
          setup_md: string | null;
          status: Database["public"]["Enums"]["drill_status"];
          summary: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          diagram_media_id?: string | null;
          equipment?: string[];
          id?: string;
          max_age?: number | null;
          max_minutes: number;
          max_players: number;
          min_age: number;
          min_minutes: number;
          min_players: number;
          objective?: string | null;
          organization_id: string;
          search?: never;
          setup_md?: string | null;
          status?: Database["public"]["Enums"]["drill_status"];
          summary?: string | null;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          diagram_media_id?: string | null;
          equipment?: string[];
          id?: string;
          max_age?: number | null;
          max_minutes?: number;
          max_players?: number;
          min_age?: number;
          min_minutes?: number;
          min_players?: number;
          objective?: string | null;
          organization_id?: string;
          search?: never;
          setup_md?: string | null;
          status?: Database["public"]["Enums"]["drill_status"];
          summary?: string | null;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drills_diagram_fk";
            columns: ["organization_id", "diagram_media_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "drills_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          ends_at: string;
          id: string;
          kind: Database["public"]["Enums"]["event_kind"];
          location: string | null;
          organization_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          team_id: string;
        };
        Insert: {
          ends_at: string;
          id?: string;
          kind: Database["public"]["Enums"]["event_kind"];
          location?: string | null;
          organization_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["event_status"];
          team_id: string;
        };
        Update: {
          ends_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["event_kind"];
          location?: string | null;
          organization_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["event_status"];
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      external_connections: {
        Row: {
          capabilities: string[];
          config: NonNullable<Json>;
          created_at: string;
          id: string;
          organization_id: string;
          provider: string;
        };
        Insert: {
          capabilities?: string[];
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          organization_id: string;
          provider: string;
        };
        Update: {
          capabilities?: string[];
          config?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          organization_id?: string;
          provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "external_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      external_links: {
        Row: {
          capability: string;
          connection_id: string;
          created_at: string;
          entity_id: string;
          entity_table: string;
          external_id: string;
          id: string;
          organization_id: string;
        };
        Insert: {
          capability: string;
          connection_id: string;
          created_at?: string;
          entity_id: string;
          entity_table: string;
          external_id: string;
          id?: string;
          organization_id: string;
        };
        Update: {
          capability?: string;
          connection_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_table?: string;
          external_id?: string;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "external_links_organization_id_connection_id_fkey";
            columns: ["organization_id", "connection_id"];
            isOneToOne: false;
            referencedRelation: "external_connections";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "external_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      external_records: {
        Row: {
          capability: string;
          checksum: string;
          connection_id: string;
          external_id: string;
          fetched_at: string;
          id: string;
          organization_id: string;
          payload: NonNullable<Json>;
        };
        Insert: {
          capability: string;
          checksum: string;
          connection_id: string;
          external_id: string;
          fetched_at?: string;
          id?: string;
          organization_id: string;
          payload: NonNullable<Json>;
        };
        Update: {
          capability?: string;
          checksum?: string;
          connection_id?: string;
          external_id?: string;
          fetched_at?: string;
          id?: string;
          organization_id?: string;
          payload?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "external_records_organization_id_connection_id_fkey";
            columns: ["organization_id", "connection_id"];
            isOneToOne: false;
            referencedRelation: "external_connections";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "external_records_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      focus_areas: {
        Row: {
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          sort: number;
        };
        Insert: {
          id?: string;
          name: string;
          organization_id: string;
          slug: string;
          sort?: number;
        };
        Update: {
          id?: string;
          name?: string;
          organization_id?: string;
          slug?: string;
          sort?: number;
        };
        Relationships: [
          {
            foreignKeyName: "focus_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      game_principles: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          slug: string;
          sort: number;
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          slug: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          slug?: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_principles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          competition_name: string | null;
          event_id: string;
          event_kind: Database["public"]["Enums"]["event_kind"];
          home_away: string | null;
          opponent_name: string;
          opponent_notes: string | null;
          organization_id: string;
          score_against: number | null;
          score_for: number | null;
          source: string;
        };
        Insert: {
          competition_name?: string | null;
          event_id: string;
          event_kind?: Database["public"]["Enums"]["event_kind"];
          home_away?: string | null;
          opponent_name: string;
          opponent_notes?: string | null;
          organization_id: string;
          score_against?: number | null;
          score_for?: number | null;
          source?: string;
        };
        Update: {
          competition_name?: string | null;
          event_id?: string;
          event_kind?: Database["public"]["Enums"]["event_kind"];
          home_away?: string | null;
          opponent_name?: string;
          opponent_notes?: string | null;
          organization_id?: string;
          score_against?: number | null;
          score_for?: number | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "games_event_fkey";
            columns: ["organization_id", "event_kind", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["organization_id", "kind", "id"];
          },
          {
            foreignKeyName: "games_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      guardianships: {
        Row: {
          child_person_id: string;
          created_at: string;
          guardian_person_id: string;
          organization_id: string;
        };
        Insert: {
          child_person_id: string;
          created_at?: string;
          guardian_person_id: string;
          organization_id: string;
        };
        Update: {
          child_person_id?: string;
          created_at?: string;
          guardian_person_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardianships_organization_id_child_person_id_fkey";
            columns: ["organization_id", "child_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "guardianships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guardianships_organization_id_guardian_person_id_fkey";
            columns: ["organization_id", "guardian_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          first_name: string | null;
          id: string;
          invited_by: string | null;
          last_name: string | null;
          organization_id: string;
          person_id: string | null;
          role: Database["public"]["Enums"]["org_role"];
          staff_role: Database["public"]["Enums"]["staff_role"] | null;
          team_id: string | null;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          first_name?: string | null;
          id?: string;
          invited_by?: string | null;
          last_name?: string | null;
          organization_id: string;
          person_id?: string | null;
          role: Database["public"]["Enums"]["org_role"];
          staff_role?: Database["public"]["Enums"]["staff_role"] | null;
          team_id?: string | null;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          first_name?: string | null;
          id?: string;
          invited_by?: string | null;
          last_name?: string | null;
          organization_id?: string;
          person_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          staff_role?: Database["public"]["Enums"]["staff_role"] | null;
          team_id?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "invitations_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      media_assets: {
        Row: {
          bucket: string;
          bytes: number;
          contains_minor: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          mime: string;
          organization_id: string;
          path: string;
        };
        Insert: {
          bucket?: string;
          bytes: number;
          contains_minor?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          mime: string;
          organization_id: string;
          path: string;
        };
        Update: {
          bucket?: string;
          bytes?: number;
          contains_minor?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          mime?: string;
          organization_id?: string;
          path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          person_id: string | null;
          role: Database["public"]["Enums"]["org_role"];
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          person_id?: string | null;
          role: Database["public"]["Enums"]["org_role"];
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          person_id?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organization_branding: {
        Row: {
          color_accent: string;
          color_accent_pressed: string;
          color_accent_soft: string;
          color_on_accent: string;
          display_name: string;
          image_consent_text: string;
          organization_id: string;
          short_name: string;
          tagline: string | null;
          terminology: NonNullable<Json>;
          terms_text: string;
          updated_at: string;
          way_name: string;
          wordmark_sub: string | null;
        };
        Insert: {
          color_accent: string;
          color_accent_pressed: string;
          color_accent_soft: string;
          color_on_accent: string;
          display_name: string;
          image_consent_text?: string;
          organization_id: string;
          short_name: string;
          tagline?: string | null;
          terminology?: NonNullable<Json>;
          terms_text?: string;
          updated_at?: string;
          way_name: string;
          wordmark_sub?: string | null;
        };
        Update: {
          color_accent?: string;
          color_accent_pressed?: string;
          color_accent_soft?: string;
          color_on_accent?: string;
          display_name?: string;
          image_consent_text?: string;
          organization_id?: string;
          short_name?: string;
          tagline?: string | null;
          terminology?: NonNullable<Json>;
          terms_text?: string;
          updated_at?: string;
          way_name?: string;
          wordmark_sub?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      people: {
        Row: {
          archived_at: string | null;
          birth_year: number | null;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          organization_id: string;
          photo_media_id: string | null;
        };
        Insert: {
          archived_at?: string | null;
          birth_year?: number | null;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
          organization_id: string;
          photo_media_id?: string | null;
        };
        Update: {
          archived_at?: string | null;
          birth_year?: number | null;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          organization_id?: string;
          photo_media_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "people_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "people_photo_media_fk";
            columns: ["organization_id", "photo_media_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      player_goals: {
        Row: {
          achieved_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          focus_area_id: string | null;
          id: string;
          organization_id: string;
          person_id: string;
          standard_id: string | null;
          status: Database["public"]["Enums"]["goal_status"];
          team_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          achieved_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          focus_area_id?: string | null;
          id?: string;
          organization_id: string;
          person_id: string;
          standard_id?: string | null;
          status?: Database["public"]["Enums"]["goal_status"];
          team_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          achieved_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          focus_area_id?: string | null;
          id?: string;
          organization_id?: string;
          person_id?: string;
          standard_id?: string | null;
          status?: Database["public"]["Enums"]["goal_status"];
          team_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_goals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_goals_organization_id_focus_area_id_fkey";
            columns: ["organization_id", "focus_area_id"];
            isOneToOne: false;
            referencedRelation: "focus_areas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "player_goals_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "player_goals_organization_id_standard_id_fkey";
            columns: ["organization_id", "standard_id"];
            isOneToOne: false;
            referencedRelation: "standards";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "player_goals_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      practice_items: {
        Row: {
          actual_minutes: number | null;
          completed: boolean | null;
          drill_id: string | null;
          id: string;
          minutes: number;
          notes: string | null;
          organization_id: string;
          phase: string | null;
          plan_id: string;
          sort: number;
          title_override: string | null;
        };
        Insert: {
          actual_minutes?: number | null;
          completed?: boolean | null;
          drill_id?: string | null;
          id?: string;
          minutes: number;
          notes?: string | null;
          organization_id: string;
          phase?: string | null;
          plan_id: string;
          sort: number;
          title_override?: string | null;
        };
        Update: {
          actual_minutes?: number | null;
          completed?: boolean | null;
          drill_id?: string | null;
          id?: string;
          minutes?: number;
          notes?: string | null;
          organization_id?: string;
          phase?: string | null;
          plan_id?: string;
          sort?: number;
          title_override?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "practice_items_organization_id_drill_id_fkey";
            columns: ["organization_id", "drill_id"];
            isOneToOne: false;
            referencedRelation: "drills";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "practice_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_items_organization_id_plan_id_fkey";
            columns: ["organization_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "practice_plans";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      practice_plans: {
        Row: {
          actual_minutes: number | null;
          created_at: string;
          created_by: string | null;
          event_id: string | null;
          event_kind: Database["public"]["Enums"]["event_kind"];
          id: string;
          is_template: boolean;
          last_save_id: string | null;
          notes: string | null;
          organization_id: string;
          primary_focus_id: string | null;
          secondary_focus_id: string | null;
          status: string;
          team_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          actual_minutes?: number | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          event_kind?: Database["public"]["Enums"]["event_kind"];
          id?: string;
          is_template?: boolean;
          last_save_id?: string | null;
          notes?: string | null;
          organization_id: string;
          primary_focus_id?: string | null;
          secondary_focus_id?: string | null;
          status?: string;
          team_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          actual_minutes?: number | null;
          created_at?: string;
          created_by?: string | null;
          event_id?: string | null;
          event_kind?: Database["public"]["Enums"]["event_kind"];
          id?: string;
          is_template?: boolean;
          last_save_id?: string | null;
          notes?: string | null;
          organization_id?: string;
          primary_focus_id?: string | null;
          secondary_focus_id?: string | null;
          status?: string;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "practice_plans_event_fkey";
            columns: ["organization_id", "team_id", "event_kind", "event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["organization_id", "team_id", "kind", "id"];
          },
          {
            foreignKeyName: "practice_plans_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_plans_organization_id_primary_focus_id_fkey";
            columns: ["organization_id", "primary_focus_id"];
            isOneToOne: false;
            referencedRelation: "focus_areas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "practice_plans_organization_id_secondary_focus_id_fkey";
            columns: ["organization_id", "secondary_focus_id"];
            isOneToOne: false;
            referencedRelation: "focus_areas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "practice_plans_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      principle_points: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          principle_id: string;
          sort: number;
          text: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          principle_id: string;
          sort: number;
          text: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          principle_id?: string;
          sort?: number;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "principle_points_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "principle_points_organization_id_principle_id_fkey";
            columns: ["organization_id", "principle_id"];
            isOneToOne: false;
            referencedRelation: "game_principles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          locale: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          locale?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          locale?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          ends_on: string;
          id: string;
          is_current: boolean;
          name: string;
          organization_id: string;
          starts_on: string;
        };
        Insert: {
          ends_on: string;
          id?: string;
          is_current?: boolean;
          name: string;
          organization_id: string;
          starts_on: string;
        };
        Update: {
          ends_on?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
          organization_id?: string;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seasons_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      standards: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          number: number;
          organization_id: string;
          sort: number;
          status: Database["public"]["Enums"]["content_status"];
          title: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          number: number;
          organization_id: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          number?: number;
          organization_id?: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "standards_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_runs: {
        Row: {
          capability: string;
          connection_id: string;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          organization_id: string;
          records_count: number | null;
          started_at: string;
          status: string;
        };
        Insert: {
          capability: string;
          connection_id: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          organization_id: string;
          records_count?: number | null;
          started_at?: string;
          status?: string;
        };
        Update: {
          capability?: string;
          connection_id?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          organization_id?: string;
          records_count?: number | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_runs_organization_id_connection_id_fkey";
            columns: ["organization_id", "connection_id"];
            isOneToOne: false;
            referencedRelation: "external_connections";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sync_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      team_players: {
        Row: {
          jersey_number: number | null;
          organization_id: string;
          person_id: string;
          position: string | null;
          team_id: string;
        };
        Insert: {
          jersey_number?: number | null;
          organization_id: string;
          person_id: string;
          position?: string | null;
          team_id: string;
        };
        Update: {
          jersey_number?: number | null;
          organization_id?: string;
          person_id?: string;
          position?: string | null;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_players_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_players_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "team_players_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      team_staff: {
        Row: {
          organization_id: string;
          person_id: string;
          staff_role: Database["public"]["Enums"]["staff_role"];
          team_id: string;
        };
        Insert: {
          organization_id: string;
          person_id: string;
          staff_role: Database["public"]["Enums"]["staff_role"];
          team_id: string;
        };
        Update: {
          organization_id?: string;
          person_id?: string;
          staff_role?: Database["public"]["Enums"]["staff_role"];
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_staff_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_staff_organization_id_person_id_fkey";
            columns: ["organization_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "team_staff_organization_id_team_id_fkey";
            columns: ["organization_id", "team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      teams: {
        Row: {
          category_id: string;
          id: string;
          name: string;
          organization_id: string;
          season_id: string;
        };
        Insert: {
          category_id: string;
          id?: string;
          name: string;
          organization_id: string;
          season_id: string;
        };
        Update: {
          category_id?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          season_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_category_id_fkey";
            columns: ["organization_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "teams_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_organization_id_season_id_fkey";
            columns: ["organization_id", "season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      way_sections: {
        Row: {
          body_md: string;
          content_kind: string;
          created_at: string;
          id: string;
          number: number;
          organization_id: string;
          slug: string;
          sort: number;
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_md?: string;
          content_kind?: string;
          created_at?: string;
          id?: string;
          number: number;
          organization_id: string;
          slug: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_md?: string;
          content_kind?: string;
          created_at?: string;
          id?: string;
          number?: number;
          organization_id?: string;
          slug?: string;
          sort?: number;
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "way_sections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_pending_invitations: { Args: Record<PropertyKey, never>; Returns: string[] };
      cancel_game: { Args: { p_event: string }; Returns: undefined };
      create_game: {
        Args: {
          p_competition?: string;
          p_ends_at: string;
          p_home_away?: string;
          p_location?: string;
          p_opponent: string;
          p_starts_at: string;
          p_team: string;
        };
        Returns: string;
      };
      create_invitation: {
        Args: {
          p_email: string;
          p_expires_at: string;
          p_first_name?: string;
          p_last_name?: string;
          p_org: string;
          p_person?: string;
          p_role: Database["public"]["Enums"]["org_role"];
          p_staff_role?: Database["public"]["Enums"]["staff_role"];
          p_team?: string;
          p_token_hash: string;
        };
        Returns: string;
      };
      create_practice_session: {
        Args: {
          p_ends_at: string;
          p_location?: string;
          p_primary_focus?: string;
          p_secondary_focus?: string;
          p_starts_at: string;
          p_team: string;
          p_title: string;
        };
        Returns: string;
      };
      duplicate_practice: { Args: { p_event: string; p_starts_at: string }; Returns: string };
      grant_image_consent: { Args: { p_person: string }; Returns: string };
      grant_terms_consent: { Args: { p_org: string }; Returns: string };
      record_game_result: {
        Args: { p_event: string; p_score_against: number; p_score_for: number };
        Returns: undefined;
      };
      record_live_progress: {
        Args: { p_actual_minutes?: number; p_event: string; p_finished: boolean; p_items: Json };
        Returns: Json;
      };
      reorder_methodology: {
        Args: { p_ids: string[]; p_kind: string; p_org: string };
        Returns: undefined;
      };
      revoke_image_consent: { Args: { p_consent: string }; Returns: undefined };
      save_drill: {
        Args: { p_drill?: string; p_expected_updated_at?: string; p_org: string; p_payload?: Json };
        Returns: {
          id: string;
          updated_at: string;
        }[];
      };
      save_game_principle: {
        Args: { p_id: string; p_points: string[]; p_summary: string; p_title: string };
        Returns: undefined;
      };
      save_practice_items: {
        Args: { p_expected_updated_at: string; p_items: Json; p_plan: string; p_save_id?: string };
        Returns: Json;
      };
      search_drills: {
        Args: {
          p_age?: number;
          p_focus?: string;
          p_minutes?: number;
          p_org: string;
          p_players?: number;
          p_principle?: string;
          p_q?: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          diagram_media_id: string | null;
          equipment: string[];
          id: string;
          max_age: number | null;
          max_minutes: number;
          max_players: number;
          min_age: number;
          min_minutes: number;
          min_players: number;
          objective: string | null;
          organization_id: string;
          search: unknown;
          setup_md: string | null;
          status: Database["public"]["Enums"]["drill_status"];
          summary: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "drills";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      update_game: {
        Args: {
          p_competition?: string;
          p_ends_at: string;
          p_event: string;
          p_home_away?: string;
          p_location?: string;
          p_opponent: string;
          p_opponent_notes?: string;
          p_starts_at: string;
        };
        Returns: undefined;
      };
      update_practice_session: {
        Args: {
          p_ends_at: string;
          p_event: string;
          p_expected_updated_at: string;
          p_location?: string;
          p_notes?: string;
          p_primary_focus?: string;
          p_secondary_focus?: string;
          p_starts_at: string;
          p_title: string;
        };
        Returns: string;
      };
      update_way_section: {
        Args: {
          p_body_md: string;
          p_content_kind: string;
          p_expected_updated_at: string;
          p_id: string;
          p_summary: string;
          p_title: string;
        };
        Returns: string;
      };
    };
    Enums: {
      content_status: "draft" | "published";
      drill_status: "draft" | "published" | "archived";
      event_kind: "practice" | "game";
      event_status: "scheduled" | "done" | "cancelled";
      goal_status: "active" | "achieved" | "archived";
      note_visibility: "private" | "staff";
      org_role: "admin" | "coach" | "player" | "guardian";
      staff_role: "head_coach" | "assistant";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      content_status: ["draft", "published"],
      drill_status: ["draft", "published", "archived"],
      event_kind: ["practice", "game"],
      event_status: ["scheduled", "done", "cancelled"],
      goal_status: ["active", "achieved", "archived"],
      note_visibility: ["private", "staff"],
      org_role: ["admin", "coach", "player", "guardian"],
      staff_role: ["head_coach", "assistant"],
    },
  },
} as const;
