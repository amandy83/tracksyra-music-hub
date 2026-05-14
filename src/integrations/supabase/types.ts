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
      distribution_timeline: {
        Row: {
          created_at: string
          id: string
          note: string | null
          release_id: string
          stage: Database["public"]["Enums"]["release_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          release_id: string
          stage: Database["public"]["Enums"]["release_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          release_id?: string
          stage?: Database["public"]["Enums"]["release_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_timeline_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          related_id: string | null
          related_table: string | null
          sent_at: string | null
          status: string
          subject: string
          template: string
          template_data: Json
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          related_id?: string | null
          related_table?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template: string
          template_data?: Json
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          related_id?: string | null
          related_table?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template?: string
          template_data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string
          data: Json
          email: string | null
          form_type: string
          id: string
          name: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          form_type?: string
          id?: string
          name?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          form_type?: string
          id?: string
          name?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          live_url: string | null
          notes: string | null
          platform: Database["public"]["Enums"]["dsp_platform"]
          release_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          live_url?: string | null
          notes?: string | null
          platform: Database["public"]["Enums"]["dsp_platform"]
          release_id: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          live_url?: string | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["dsp_platform"]
          release_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_deliveries_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
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
      releases: {
        Row: {
          admin_notes: string | null
          ai_content_declared: boolean
          copyright_declared: boolean
          copyright_owner: string | null
          cover_art_url: string | null
          created_at: string
          genre: string | null
          id: string
          language: string | null
          primary_artist: string
          rejection_reason: string | null
          release_date: string | null
          release_type: string
          rights_owned: boolean
          status: Database["public"]["Enums"]["release_status"]
          title: string
          upc: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          ai_content_declared?: boolean
          copyright_declared?: boolean
          copyright_owner?: string | null
          cover_art_url?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          language?: string | null
          primary_artist: string
          rejection_reason?: string | null
          release_date?: string | null
          release_type?: string
          rights_owned?: boolean
          status?: Database["public"]["Enums"]["release_status"]
          title: string
          upc?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          ai_content_declared?: boolean
          copyright_declared?: boolean
          copyright_owner?: string | null
          cover_art_url?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          language?: string | null
          primary_artist?: string
          rejection_reason?: string | null
          release_date?: string | null
          release_type?: string
          rights_owned?: boolean
          status?: Database["public"]["Enums"]["release_status"]
          title?: string
          upc?: string | null
          updated_at?: string
          user_id?: string
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
      smtp_settings: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          host: string
          id: string
          is_active: boolean
          password: string
          port: number
          secure: boolean
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name?: string
          host: string
          id?: string
          is_active?: boolean
          password: string
          port?: number
          secure?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          is_active?: boolean
          password?: string
          port?: number
          secure?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
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
      tracks: {
        Row: {
          audio_format: string | null
          audio_hash: string | null
          audio_url: string | null
          bitrate_kbps: number | null
          channels: number | null
          composer: string | null
          created_at: string
          duration_sec: number | null
          explicit: boolean
          featured_artists: string | null
          file_size_bytes: number | null
          id: string
          isrc: string | null
          lyrics: string | null
          primary_artist: string
          release_id: string
          sample_rate_hz: number | null
          title: string
          track_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_format?: string | null
          audio_hash?: string | null
          audio_url?: string | null
          bitrate_kbps?: number | null
          channels?: number | null
          composer?: string | null
          created_at?: string
          duration_sec?: number | null
          explicit?: boolean
          featured_artists?: string | null
          file_size_bytes?: number | null
          id?: string
          isrc?: string | null
          lyrics?: string | null
          primary_artist: string
          release_id: string
          sample_rate_hz?: number | null
          title: string
          track_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_format?: string | null
          audio_hash?: string | null
          audio_url?: string | null
          bitrate_kbps?: number | null
          channels?: number | null
          composer?: string | null
          created_at?: string
          duration_sec?: number | null
          explicit?: boolean
          featured_artists?: string | null
          file_size_bytes?: number | null
          id?: string
          isrc?: string | null
          lyrics?: string | null
          primary_artist?: string
          release_id?: string
          sample_rate_hz?: number | null
          title?: string
          track_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_logs: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          id: string
          release_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          release_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          id?: string
          release_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_logs_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      queue_email: {
        Args: {
          p_recipient_email: string
          p_recipient_name: string
          p_related_id: string
          p_related_table: string
          p_subject: string
          p_template: string
          p_template_data: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "artist"
      delivery_status:
        | "pending"
        | "processing"
        | "delivered"
        | "live"
        | "rejected"
      dsp_platform:
        | "spotify"
        | "apple_music"
        | "youtube_music"
        | "amazon_music"
        | "jiosaavn"
        | "gaana"
        | "wynk"
        | "deezer"
        | "tidal"
        | "pandora"
        | "instagram_facebook"
        | "tiktok"
      release_status:
        | "draft"
        | "uploaded"
        | "under_review"
        | "approved"
        | "sent_to_stores"
        | "processing"
        | "live"
        | "rejected"
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
      app_role: ["admin", "artist"],
      delivery_status: [
        "pending",
        "processing",
        "delivered",
        "live",
        "rejected",
      ],
      dsp_platform: [
        "spotify",
        "apple_music",
        "youtube_music",
        "amazon_music",
        "jiosaavn",
        "gaana",
        "wynk",
        "deezer",
        "tidal",
        "pandora",
        "instagram_facebook",
        "tiktok",
      ],
      release_status: [
        "draft",
        "uploaded",
        "under_review",
        "approved",
        "sent_to_stores",
        "processing",
        "live",
        "rejected",
      ],
    },
  },
} as const
