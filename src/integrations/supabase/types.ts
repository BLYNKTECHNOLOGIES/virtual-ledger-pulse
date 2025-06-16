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
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          balance: number
          bank_name: string
          branch: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          account_type: string
          balance?: number
          bank_name: string
          branch?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          balance?: number
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          assigned_operator: string | null
          buying_purpose: string | null
          client_id: string
          client_type: string
          client_value_score: number | null
          created_at: string
          current_month_used: number | null
          date_of_onboarding: string
          email: string | null
          first_order_value: number | null
          id: string
          kyc_status: string
          monthly_limit: number | null
          name: string
          phone: string | null
          risk_appetite: string
          updated_at: string
        }
        Insert: {
          assigned_operator?: string | null
          buying_purpose?: string | null
          client_id: string
          client_type: string
          client_value_score?: number | null
          created_at?: string
          current_month_used?: number | null
          date_of_onboarding: string
          email?: string | null
          first_order_value?: number | null
          id?: string
          kyc_status?: string
          monthly_limit?: number | null
          name: string
          phone?: string | null
          risk_appetite?: string
          updated_at?: string
        }
        Update: {
          assigned_operator?: string | null
          buying_purpose?: string | null
          client_id?: string
          client_type?: string
          client_value_score?: number | null
          created_at?: string
          current_month_used?: number | null
          date_of_onboarding?: string
          email?: string | null
          first_order_value?: number | null
          id?: string
          kyc_status?: string
          monthly_limit?: number | null
          name?: string
          phone?: string | null
          risk_appetite?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          date_of_joining: string
          department: string
          designation: string
          email: string
          employee_id: string
          id: string
          name: string
          onboarding_completed: boolean | null
          phone: string | null
          salary: number
          shift: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_joining: string
          department: string
          designation: string
          email: string
          employee_id: string
          id?: string
          name: string
          onboarding_completed?: boolean | null
          phone?: string | null
          salary: number
          shift?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_joining?: string
          department?: string
          designation?: string
          email?: string
          employee_id?: string
          id?: string
          name?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          salary?: number
          shift?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_applicants: {
        Row: {
          applied_at: string
          email: string
          id: string
          job_posting_id: string
          name: string
          phone: string | null
          resume_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string
          email: string
          id?: string
          job_posting_id: string
          name: string
          phone?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string
          email?: string
          id?: string
          job_posting_id?: string
          name?: string
          phone?: string | null
          resume_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applicants_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          created_at: string
          department: string
          description: string | null
          experience_required: string | null
          id: string
          job_type: string
          location: string | null
          qualifications: string | null
          salary_range_max: number | null
          salary_range_min: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          description?: string | null
          experience_required?: string | null
          id?: string
          job_type: string
          location?: string | null
          qualifications?: string | null
          salary_range_max?: number | null
          salary_range_min?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          description?: string | null
          experience_required?: string | null
          id?: string
          job_type?: string
          location?: string | null
          qualifications?: string | null
          salary_range_max?: number | null
          salary_range_min?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string | null
          entry_date: string
          id: string
          reference_number: string
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_date: string
          id?: string
          reference_number: string
          status?: string
          total_amount: number
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          reference_number?: string
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          id: string
          journal_entry_id: string
          ledger_account_id: string
        }
        Insert: {
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          journal_entry_id: string
          ledger_account_id: string
        }
        Update: {
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          journal_entry_id?: string
          ledger_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_code: string | null
          account_type: string
          created_at: string
          current_balance: number
          id: string
          name: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          account_type: string
          created_at?: string
          current_balance?: number
          id?: string
          name: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          account_type?: string
          created_at?: string
          current_balance?: number
          id?: string
          name?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          code: string
          cost_price: number
          created_at: string
          current_stock_quantity: number
          id: string
          name: string
          reorder_level: number
          selling_price: number
          unit_of_measurement: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          cost_price: number
          created_at?: string
          current_stock_quantity?: number
          id?: string
          name: string
          reorder_level?: number
          selling_price: number
          unit_of_measurement: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          cost_price?: number
          created_at?: string
          current_stock_quantity?: number
          id?: string
          name?: string
          reorder_level?: number
          selling_price?: number
          unit_of_measurement?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_orders: {
        Row: {
          amount: number
          client_name: string
          created_at: string
          delivery_date: string | null
          id: string
          order_date: string
          order_number: string
          payment_status: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_name: string
          created_at?: string
          delivery_date?: string | null
          id?: string
          order_date: string
          order_number: string
          payment_status?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_name?: string
          created_at?: string
          delivery_date?: string | null
          id?: string
          order_date?: string
          order_number?: string
          payment_status?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_transactions: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          reference_number: string | null
          supplier_customer_name: string | null
          total_amount: number | null
          transaction_date: string
          transaction_type: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_number?: string | null
          supplier_customer_name?: string | null
          total_amount?: number | null
          transaction_date: string
          transaction_type: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_number?: string | null
          supplier_customer_name?: string | null
          total_amount?: number | null
          transaction_date?: string
          transaction_type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
