// Generado a partir del esquema de Supabase. No editar a mano:
// se regenera tras cada migración (ver CLAUDE.md).

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ajustes_organizacion: {
        Row: {
          marca: Json
          modulos: string[]
          moneda: string
          organizacion_id: string
          zona_horaria: string
        }
        Insert: {
          marca?: Json
          modulos?: string[]
          moneda?: string
          organizacion_id: string
          zona_horaria?: string
        }
        Update: {
          marca?: Json
          modulos?: string[]
          moneda?: string
          organizacion_id?: string
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_organizacion_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: true
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      locales: {
        Row: {
          creado_en: string
          id: string
          nombre: string
          organizacion_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          nombre: string
          organizacion_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          nombre?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locales_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros: {
        Row: {
          creado_en: string
          organizacion_id: string
          rol: Database["public"]["Enums"]["rol_miembro"]
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          organizacion_id: string
          rol: Database["public"]["Enums"]["rol_miembro"]
          usuario_id: string
        }
        Update: {
          creado_en?: string
          organizacion_id?: string
          rol?: Database["public"]["Enums"]["rol_miembro"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      organizaciones: {
        Row: {
          creado_en: string
          id: string
          nombre: string
          plan: string
        }
        Insert: {
          creado_en?: string
          id?: string
          nombre: string
          plan?: string
        }
        Update: {
          creado_en?: string
          id?: string
          nombre?: string
          plan?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          creado_en: string
          nombre: string | null
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          nombre?: string | null
          usuario_id: string
        }
        Update: {
          creado_en?: string
          nombre?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      permisos_rol: {
        Row: {
          permiso: string
          rol: Database["public"]["Enums"]["rol_miembro"]
        }
        Insert: {
          permiso: string
          rol: Database["public"]["Enums"]["rol_miembro"]
        }
        Update: {
          permiso?: string
          rol?: Database["public"]["Enums"]["rol_miembro"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crear_organizacion: {
        Args: { p_local?: string; p_nombre: string }
        Returns: string
      }
      mis_permisos: { Args: { p_organizacion: string }; Returns: string[] }
    }
    Enums: {
      rol_miembro: "dueno" | "encargado" | "empleado" | "gestoria"
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

export const Constants = {
  public: {
    Enums: {
      rol_miembro: ["dueno", "encargado", "empleado", "gestoria"],
    },
  },
} as const
