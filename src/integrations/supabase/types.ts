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
          balance: number
          bank_name: string
          branch: string | null
          created_at: string
          id: string
          IFSC: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          balance?: number
          bank_name: string
          branch?: string | null
          created_at?: string
          id?: string
          IFSC?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          balance?: number
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          IFSC?: string | null
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
          default_risk_level: string | null
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
          default_risk_level?: string | null
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
          default_risk_level?: string | null
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
      interview_schedules: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          interview_date: string
          interview_type: string | null
          interviewer_name: string | null
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          interview_date: string
          interview_type?: string | null
          interviewer_name?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          interview_date?: string
          interview_type?: string | null
          interviewer_name?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_schedules_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "job_applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applicants: {
        Row: {
          address: string | null
          applied_at: string
          email: string
          id: string
          is_interested: boolean | null
          job_posting_id: string
          name: string
          notes: string | null
          phone: string | null
          resume_url: string | null
          stage: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          applied_at?: string
          email: string
          id?: string
          is_interested?: boolean | null
          job_posting_id: string
          name: string
          notes?: string | null
          phone?: string | null
          resume_url?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          applied_at?: string
          email?: string
          id?: string
          is_interested?: boolean | null
          job_posting_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          resume_url?: string | null
          stage?: string | null
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
      offer_documents: {
        Row: {
          applicant_id: string
          created_at: string
          document_type: string
          document_url: string | null
          id: string
          notes: string | null
          response_date: string | null
          sent_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          document_type: string
          document_url?: string | null
          id?: string
          notes?: string | null
          response_date?: string | null
          sent_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          document_type?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          response_date?: string | null
          sent_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_documents_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "job_applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          current_daily_used: number | null
          current_monthly_used: number | null
          daily_limit: number | null
          id: string
          ifsc_code: string | null
          is_active: boolean
          monthly_limit: number | null
          risk_category: string
          type: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          current_daily_used?: number | null
          current_monthly_used?: number | null
          daily_limit?: number | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          monthly_limit?: number | null
          risk_category: string
          type: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          current_daily_used?: number | null
          current_monthly_used?: number | null
          daily_limit?: number | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          monthly_limit?: number | null
          risk_category?: string
          type?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: []
      }
      platforms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          average_buying_price: number | null
          average_selling_price: number | null
          code: string
          cost_price: number
          created_at: string
          current_stock_quantity: number
          id: string
          name: string
          selling_price: number
          total_purchases: number | null
          total_sales: number | null
          unit_of_measurement: string
          updated_at: string
          warehouse_id: string | null
          warehouse_stock: Json | null
        }
        Insert: {
          average_buying_price?: number | null
          average_selling_price?: number | null
          code: string
          cost_price: number
          created_at?: string
          current_stock_quantity?: number
          id?: string
          name: string
          selling_price: number
          total_purchases?: number | null
          total_sales?: number | null
          unit_of_measurement: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_stock?: Json | null
        }
        Update: {
          average_buying_price?: number | null
          average_selling_price?: number | null
          code?: string
          cost_price?: number
          created_at?: string
          current_stock_quantity?: number
          id?: string
          name?: string
          selling_price?: number
          total_purchases?: number | null
          total_sales?: number | null
          unit_of_measurement?: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_stock?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
          warehouse_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          bank_account_id: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          order_date: string
          order_number: string
          purchase_payment_method_id: string | null
          status: string
          supplier_name: string
          total_amount: number
          updated_at: string
          warehouse_name: string | null
        }
        Insert: {
          bank_account_id?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_date: string
          order_number: string
          purchase_payment_method_id?: string | null
          status?: string
          supplier_name: string
          total_amount: number
          updated_at?: string
          warehouse_name?: string | null
        }
        Update: {
          bank_account_id?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_date?: string
          order_number?: string
          purchase_payment_method_id?: string | null
          status?: string
          supplier_name?: string
          total_amount?: number
          updated_at?: string
          warehouse_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_purchase_payment_method_id_fkey"
            columns: ["purchase_payment_method_id"]
            isOneToOne: false
            referencedRelation: "purchase_payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payment_methods: {
        Row: {
          bank_account_name: string | null
          created_at: string
          current_usage: number | null
          custom_frequency: string | null
          frequency: string
          id: string
          is_active: boolean
          last_reset: string | null
          payment_limit: number
          type: string
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          payment_limit?: number
          type?: string
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          payment_limit?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payment_methods_bank_account_name_fkey"
            columns: ["bank_account_name"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["account_name"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount: number
          attachment_urls: string[] | null
          client_name: string
          cosmos_alert: boolean | null
          created_at: string
          created_by: string | null
          credits_applied: number | null
          delivery_date: string | null
          description: string | null
          id: string
          order_date: string
          order_number: string
          payment_status: string
          platform: string | null
          price_per_unit: number | null
          quantity: number | null
          risk_level: string | null
          sales_payment_method_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_urls?: string[] | null
          client_name: string
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          credits_applied?: number | null
          delivery_date?: string | null
          description?: string | null
          id?: string
          order_date: string
          order_number: string
          payment_status?: string
          platform?: string | null
          price_per_unit?: number | null
          quantity?: number | null
          risk_level?: string | null
          sales_payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_urls?: string[] | null
          client_name?: string
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          credits_applied?: number | null
          delivery_date?: string | null
          description?: string | null
          id?: string
          order_date?: string
          order_number?: string
          payment_status?: string
          platform?: string | null
          price_per_unit?: number | null
          quantity?: number | null
          risk_level?: string | null
          sales_payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_sales_payment_method_id_fkey"
            columns: ["sales_payment_method_id"]
            isOneToOne: false
            referencedRelation: "sales_payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_payment_methods: {
        Row: {
          bank_account_id: string | null
          created_at: string
          current_usage: number | null
          custom_frequency: string | null
          frequency: string
          id: string
          is_active: boolean
          last_reset: string | null
          payment_limit: number
          risk_category: string
          type: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          payment_limit?: number
          risk_category: string
          type: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          payment_limit?: number
          risk_category?: string
          type?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_payment_methods_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_type: string
          created_at: string
          created_by: string | null
          from_warehouse_id: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          reference_number: string | null
          to_warehouse_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          adjustment_date?: string
          adjustment_type: string
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_number?: string | null
          to_warehouse_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          adjustment_date?: string
          adjustment_type?: string
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_number?: string | null
          to_warehouse_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_default_risk_level: {
        Args: Record<PropertyKey, never>
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
