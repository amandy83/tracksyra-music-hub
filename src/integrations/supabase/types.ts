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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          budget_inr: number
          campaign_name: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          platform: string
          song_id: string
          start_date: string | null
          status: string
          target_age: string | null
          target_countries: string | null
          target_genre: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_inr: number
          campaign_name: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          platform?: string
          song_id: string
          start_date?: string | null
          status?: string
          target_age?: string | null
          target_countries?: string | null
          target_genre?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_inr?: number
          campaign_name?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          platform?: string
          song_id?: string
          start_date?: string | null
          status?: string
          target_age?: string | null
          target_countries?: string | null
          target_genre?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_pitches: {
        Row: {
          admin_notes: string | null
          created_at: string
          genre: string | null
          id: string
          mood: string | null
          pitch_story: string
          platform: string
          similar_artists: string | null
          song_id: string
          status: string
          target_audience: string | null
          target_playlist: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          mood?: string | null
          pitch_story: string
          platform?: string
          similar_artists?: string | null
          song_id: string
          status?: string
          target_audience?: string | null
          target_playlist: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          mood?: string | null
          pitch_story?: string
          platform?: string
          similar_artists?: string | null
          song_id?: string
          status?: string
          target_audience?: string | null
          target_playlist?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_pitches_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          artist_name: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          full_name: string | null
          id: string
          main_genre: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          artist_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          main_genre?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          artist_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          main_genre?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      royalties: {
        Row: {
          created_at: string
          id: string
          payout_status: string
          period: string
          platform: string
          revenue_inr: number
          song_id: string
          streams: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payout_status?: string
          period: string
          platform: string
          revenue_inr?: number
          song_id: string
          streams?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payout_status?: string
          period?: string
          platform?: string
          revenue_inr?: number
          song_id?: string
          streams?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royalties_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_analytics: {
        Row: {
          created_at: string
          date: string
          id: string
          listeners: number
          platform: string
          saves: number
          song_id: string
          streams: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          listeners?: number
          platform: string
          saves?: number
          song_id: string
          streams?: number
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          listeners?: number
          platform?: string
          saves?: number
          song_id?: string
          streams?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_analytics_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          audio_url: string | null
          canvas_video_url: string | null
          copyright_info: string | null
          cover_art_url: string | null
          created_at: string
          explicit: boolean
          featured_artists: string | null
          genre: string | null
          id: string
          isrc: string | null
          language: string | null
          lyrics: string | null
          platforms: string[]
          primary_artist: string
          release_date: string | null
          songwriter_credits: string | null
          status: string
          title: string
          upc: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          canvas_video_url?: string | null
          copyright_info?: string | null
          cover_art_url?: string | null
          created_at?: string
          explicit?: boolean
          featured_artists?: string | null
          genre?: string | null
          id?: string
          isrc?: string | null
          language?: string | null
          lyrics?: string | null
          platforms?: string[]
          primary_artist: string
          release_date?: string | null
          songwriter_credits?: string | null
          status?: string
          title: string
          upc?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          canvas_video_url?: string | null
          copyright_info?: string | null
          cover_art_url?: string | null
          created_at?: string
          explicit?: boolean
          featured_artists?: string | null
          genre?: string | null
          id?: string
          isrc?: string | null
          language?: string | null
          lyrics?: string | null
          platforms?: string[]
          primary_artist?: string
          release_date?: string | null
          songwriter_credits?: string | null
          status?: string
          title?: string
          upc?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
