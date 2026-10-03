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
      cierre_tandas: {
        Row: {
          cierre_id: string
          organizacion_id: string
          sabor_id: string
        }
        Insert: {
          cierre_id: string
          organizacion_id: string
          sabor_id: string
        }
        Update: {
          cierre_id?: string
          organizacion_id?: string
          sabor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierre_tandas_cierre_id_organizacion_id_fkey"
            columns: ["cierre_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "cierres_diarios"
            referencedColumns: ["id", "organizacion_id"]
          },
          {
            foreignKeyName: "cierre_tandas_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_tandas_sabor_id_organizacion_id_fkey"
            columns: ["sabor_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "sabores"
            referencedColumns: ["id", "organizacion_id"]
          },
        ]
      }
      cierres_diarios: {
        Row: {
          actualizado_en: string
          creado_en: string
          banco: number | null
          creado_por: string | null
          documento_id: string | null
          efectivo: number | null
          fecha: string
          id: string
          local_id: string
          notas: string | null
          organizacion_id: string
          venta: number
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          banco?: number | null
          creado_por?: string | null
          documento_id?: string | null
          efectivo?: number | null
          fecha: string
          id?: string
          local_id: string
          notas?: string | null
          organizacion_id: string
          venta: number
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          banco?: number | null
          creado_por?: string | null
          documento_id?: string | null
          efectivo?: number | null
          fecha?: string
          id?: string
          local_id?: string
          notas?: string | null
          organizacion_id?: string
          venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "cierres_diarios_local_id_organizacion_id_fkey"
            columns: ["local_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id", "organizacion_id"]
          },
          {
            foreignKeyName: "cierres_diarios_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_entrantes: {
        Row: {
          archivo_nombre: string
          archivo_ruta: string
          archivo_tipo: string
          asunto: string | null
          datos: Json
          estado: string
          huella: string
          id: string
          organizacion_id: string
          origen: string
          recibido_en: string
          remitente: string | null
          revisado_en: string | null
          revisado_por: string | null
          subido_por: string | null
          tipo: string
        }
        Insert: {
          archivo_nombre: string
          archivo_ruta: string
          archivo_tipo: string
          asunto?: string | null
          datos?: Json
          estado?: string
          huella: string
          id?: string
          organizacion_id: string
          origen: string
          recibido_en?: string
          remitente?: string | null
          revisado_en?: string | null
          revisado_por?: string | null
          subido_por?: string | null
          tipo: string
        }
        Update: {
          archivo_nombre?: string
          archivo_ruta?: string
          archivo_tipo?: string
          asunto?: string | null
          datos?: Json
          estado?: string
          huella?: string
          id?: string
          organizacion_id?: string
          origen?: string
          recibido_en?: string
          remitente?: string | null
          revisado_en?: string | null
          revisado_por?: string | null
          subido_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_entrantes_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_lineas: {
        Row: {
          cantidad: number | null
          descripcion: string
          factura_id: string
          id: string
          importe: number
          organizacion_id: string
          precio_unitario: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number | null
          descripcion: string
          factura_id: string
          id?: string
          importe: number
          organizacion_id: string
          precio_unitario?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number | null
          descripcion?: string
          factura_id?: string
          id?: string
          importe?: number
          organizacion_id?: string
          precio_unitario?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_lineas_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_recibidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_lineas_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_recibidas: {
        Row: {
          categoria: string
          creado_en: string | null
          creado_por: string | null
          documento_id: string | null
          estado_pago: string
          fecha: string
          id: string
          importe: number
          numero: string | null
          organizacion_id: string
          proveedor: string
        }
        Insert: {
          categoria?: string
          creado_en?: string | null
          creado_por?: string | null
          documento_id?: string | null
          estado_pago?: string
          fecha: string
          id?: string
          importe: number
          numero?: string | null
          organizacion_id: string
          proveedor: string
        }
        Update: {
          categoria?: string
          creado_en?: string | null
          creado_por?: string | null
          documento_id?: string | null
          estado_pago?: string
          fecha?: string
          id?: string
          importe?: number
          numero?: string | null
          organizacion_id?: string
          proveedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_recibidas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_entrantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_recibidas_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones: {
        Row: {
          caduca_en: string
          codigo_hash: string
          creada_en: string
          creada_por: string | null
          etiqueta: string
          id: string
          organizacion_id: string
          rol: Database["public"]["Enums"]["rol_miembro"]
          usada_en: string | null
          usada_por: string | null
        }
        Insert: {
          caduca_en?: string
          codigo_hash: string
          creada_en?: string
          creada_por?: string | null
          etiqueta: string
          id?: string
          organizacion_id: string
          rol: Database["public"]["Enums"]["rol_miembro"]
          usada_en?: string | null
          usada_por?: string | null
        }
        Update: {
          caduca_en?: string
          codigo_hash?: string
          creada_en?: string
          creada_por?: string | null
          etiqueta?: string
          id?: string
          organizacion_id?: string
          rol?: Database["public"]["Enums"]["rol_miembro"]
          usada_en?: string | null
          usada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
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
      sabores: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          nombre: string
          organizacion_id: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre: string
          organizacion_id: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sabores_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_codigos: {
        Row: {
          caduca: string
          codigo: string
          creado_por: string | null
          local_id: string
          organizacion_id: string
        }
        Insert: {
          caduca?: string
          codigo: string
          creado_por?: string | null
          local_id: string
          organizacion_id: string
        }
        Update: {
          caduca?: string
          codigo?: string
          creado_por?: string | null
          local_id?: string
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_codigos_local_id_organizacion_id_fkey"
            columns: ["local_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id", "organizacion_id"]
          },
          {
            foreignKeyName: "telegram_codigos_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_conversaciones: {
        Row: {
          actualizado_en: string
          chat_id: number
          fecha: string
          local_id: string
          organizacion_id: string
          paso: string
          sabores: Json
          seleccion: number[]
          venta: number | null
        }
        Insert: {
          actualizado_en?: string
          chat_id: number
          fecha: string
          local_id: string
          organizacion_id: string
          paso: string
          sabores?: Json
          seleccion?: number[]
          venta?: number | null
        }
        Update: {
          actualizado_en?: string
          chat_id?: number
          fecha?: string
          local_id?: string
          organizacion_id?: string
          paso?: string
          sabores?: Json
          seleccion?: number[]
          venta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_conversaciones_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "telegram_vinculos"
            referencedColumns: ["chat_id"]
          },
          {
            foreignKeyName: "telegram_conversaciones_local_id_organizacion_id_fkey"
            columns: ["local_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id", "organizacion_id"]
          },
          {
            foreignKeyName: "telegram_conversaciones_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_vinculos: {
        Row: {
          chat_id: number
          creado_en: string
          id: string
          local_id: string
          nombre: string | null
          organizacion_id: string
        }
        Insert: {
          chat_id: number
          creado_en?: string
          id?: string
          local_id: string
          nombre?: string | null
          organizacion_id: string
        }
        Update: {
          chat_id?: number
          creado_en?: string
          id?: string
          local_id?: string
          nombre?: string | null
          organizacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_vinculos_local_id_organizacion_id_fkey"
            columns: ["local_id", "organizacion_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id", "organizacion_id"]
          },
          {
            foreignKeyName: "telegram_vinculos_organizacion_id_fkey"
            columns: ["organizacion_id"]
            isOneToOne: false
            referencedRelation: "organizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceptar_invitacion: { Args: { p_codigo: string }; Returns: string }
      aprobar_cierre: {
        Args: {
          p_banco?: number
          p_documento: string
          p_efectivo?: number
          p_fecha: string
          p_local: string
          p_venta: number
        }
        Returns: string
      }
      aprobar_factura: {
        Args: {
          p_categoria?: string
          p_documento: string
          p_fecha: string
          p_importe: number
          p_numero?: string
          p_proveedor: string
        }
        Returns: string
      }
      cerrar_parte: {
        Args: { p_documento: string; p_parte: string; p_resultado: string }
        Returns: undefined
      }
      crear_organizacion: {
        Args: { p_local?: string; p_nombre: string }
        Returns: string
      }
      deshacer_documento: {
        Args: { p_documento: string }
        Returns: Json
      }
      equipo_del_negocio: {
        Args: { p_organizacion: string }
        Returns: {
          correo: string
          creado_en: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_miembro"]
          usuario_id: string
        }[]
      }
      guardar_cierre: {
        Args: {
          p_fecha: string
          p_local: string
          p_notas?: string
          p_organizacion: string
          p_sabores?: string[]
          p_venta: number
        }
        Returns: string
      }
      mis_permisos: { Args: { p_organizacion: string }; Returns: string[] }
      registrar_facturas: {
        Args: { p_documento: string; p_facturas: Json }
        Returns: number
      }
      registrar_ingresos: {
        Args: { p_dias: Json; p_documento: string; p_local: string }
        Returns: number
      }
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
