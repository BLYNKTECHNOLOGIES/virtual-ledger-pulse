export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          balance: number
          bank_account_holder_name: string | null
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
          bank_account_holder_name?: string | null
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
          bank_account_holder_name?: string | null
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
      bank_communications: {
        Row: {
          bank_name: string
          communication_date: string
          contact_person: string
          created_at: string
          id: string
          mode: string
          notes: string | null
        }
        Insert: {
          bank_name: string
          communication_date?: string
          contact_person: string
          created_at?: string
          id?: string
          mode: string
          notes?: string | null
        }
        Update: {
          bank_name?: string
          communication_date?: string
          contact_person?: string
          created_at?: string
          id?: string
          mode?: string
          notes?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          reference_number: string | null
          related_account_name: string | null
          related_transaction_id: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reference_number?: string | null
          related_account_name?: string | null
          related_transaction_id?: string | null
          transaction_date: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reference_number?: string | null
          related_account_name?: string | null
          related_transaction_id?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      banking_credentials: {
        Row: {
          bank_account_id: string
          created_at: string
          credential_name: string | null
          credential_type: string
          credential_value: string | null
          customer_id: string | null
          id: string
          login_id: string | null
          notes: string | null
          password: string | null
          profile_password: string | null
          security_questions: Json | null
          transaction_password: string | null
          updated_at: string
          upi_pin: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          credential_name?: string | null
          credential_type: string
          credential_value?: string | null
          customer_id?: string | null
          id?: string
          login_id?: string | null
          notes?: string | null
          password?: string | null
          profile_password?: string | null
          security_questions?: Json | null
          transaction_password?: string | null
          updated_at?: string
          upi_pin?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          credential_name?: string | null
          credential_type?: string
          credential_value?: string | null
          customer_id?: string | null
          id?: string
          login_id?: string | null
          notes?: string | null
          password?: string | null
          profile_password?: string | null
          security_questions?: Json | null
          transaction_password?: string | null
          updated_at?: string
          upi_pin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banking_credentials_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      departments: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          hierarchy_level: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_verification_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_offboarding: {
        Row: {
          assets_returned: boolean | null
          created_at: string
          employee_id: string
          exit_interview_completed: boolean | null
          final_settlement_amount: number | null
          handover_status: string
          id: string
          initiated_by: string | null
          last_working_day: string | null
          notice_period_days: number | null
          reason_for_leaving: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assets_returned?: boolean | null
          created_at?: string
          employee_id: string
          exit_interview_completed?: boolean | null
          final_settlement_amount?: number | null
          handover_status?: string
          id?: string
          initiated_by?: string | null
          last_working_day?: string | null
          notice_period_days?: number | null
          reason_for_leaving?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assets_returned?: boolean | null
          created_at?: string
          employee_id?: string
          exit_interview_completed?: boolean | null
          final_settlement_amount?: number | null
          handover_status?: string
          id?: string
          initiated_by?: string | null
          last_working_day?: string | null
          notice_period_days?: number | null
          reason_for_leaving?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_offboarding_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          date_of_joining: string
          department: string
          department_code: string | null
          department_id: string | null
          designation: string
          email: string
          employee_id: string
          has_payment_rights: boolean | null
          hierarchy_level: number | null
          id: string
          name: string
          onboarding_completed: boolean | null
          phone: string | null
          position_id: string | null
          reports_to: string | null
          salary: number
          shift: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_joining: string
          department: string
          department_code?: string | null
          department_id?: string | null
          designation: string
          email: string
          employee_id: string
          has_payment_rights?: boolean | null
          hierarchy_level?: number | null
          id?: string
          name: string
          onboarding_completed?: boolean | null
          phone?: string | null
          position_id?: string | null
          reports_to?: string | null
          salary: number
          shift?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_joining?: string
          department?: string
          department_code?: string | null
          department_id?: string | null
          designation?: string
          email?: string
          employee_id?: string
          has_payment_rights?: boolean | null
          hierarchy_level?: number | null
          id?: string
          name?: string
          onboarding_completed?: boolean | null
          phone?: string | null
          position_id?: string | null
          reports_to?: string | null
          salary?: number
          shift?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
      kyc_approval_requests: {
        Row: {
          aadhar_back_url: string | null
          aadhar_front_url: string | null
          additional_documents_url: string | null
          additional_info: string | null
          binance_id_screenshot_url: string
          counterparty_name: string
          created_at: string
          created_by: string | null
          id: string
          negative_feedback_url: string | null
          order_amount: number
          purpose_of_buying: string | null
          status: string
          updated_at: string
          verified_feedback_url: string | null
        }
        Insert: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          additional_documents_url?: string | null
          additional_info?: string | null
          binance_id_screenshot_url: string
          counterparty_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          negative_feedback_url?: string | null
          order_amount: number
          purpose_of_buying?: string | null
          status?: string
          updated_at?: string
          verified_feedback_url?: string | null
        }
        Update: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          additional_documents_url?: string | null
          additional_info?: string | null
          binance_id_screenshot_url?: string
          counterparty_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          negative_feedback_url?: string | null
          order_amount?: number
          purpose_of_buying?: string | null
          status?: string
          updated_at?: string
          verified_feedback_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_approval_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_queries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kyc_request_id: string
          manual_query: string | null
          resolved: boolean
          resolved_at: string | null
          response_text: string | null
          vkyc_required: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kyc_request_id: string
          manual_query?: string | null
          resolved?: boolean
          resolved_at?: string | null
          response_text?: string | null
          vkyc_required?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kyc_request_id?: string
          manual_query?: string | null
          resolved?: boolean
          resolved_at?: string | null
          response_text?: string | null
          vkyc_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "kyc_queries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_queries_kyc_request_id_fkey"
            columns: ["kyc_request_id"]
            isOneToOne: false
            referencedRelation: "kyc_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_number: string | null
          created_at: string
          description: string | null
          estimated_order_value: number | null
          id: string
          name: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_number?: string | null
          created_at?: string
          description?: string | null
          estimated_order_value?: number | null
          id?: string
          name: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_number?: string | null
          created_at?: string
          description?: string | null
          estimated_order_value?: number | null
          id?: string
          name?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      lien_cases: {
        Row: {
          acknowledgment_number: string | null
          amount: number
          bank_account_id: string | null
          city: string | null
          created_at: string
          date_imposed: string
          id: string
          lawyer: string | null
          lien_number: string
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledgment_number?: string | null
          amount: number
          bank_account_id?: string | null
          city?: string | null
          created_at?: string
          date_imposed: string
          id?: string
          lawyer?: string | null
          lien_number: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledgment_number?: string | null
          amount?: number
          bank_account_id?: string | null
          city?: string | null
          created_at?: string
          date_imposed?: string
          id?: string
          lawyer?: string | null
          lien_number?: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lien_cases_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lien_updates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lien_case_id: string
          update_text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lien_case_id: string
          update_text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lien_case_id?: string
          update_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lien_updates_lien_case_id_fkey"
            columns: ["lien_case_id"]
            isOneToOne: false
            referencedRelation: "lien_cases"
            referencedColumns: ["id"]
          },
        ]
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
      password_reset_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payer_payment_methods: {
        Row: {
          created_at: string
          id: string
          payer_id: string
          purchase_payment_method_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payer_id: string
          purchase_payment_method_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payer_id?: string
          purchase_payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payer_payment_methods_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payer_payment_methods_purchase_payment_method_id_fkey"
            columns: ["purchase_payment_method_id"]
            isOneToOne: false
            referencedRelation: "purchase_payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payers: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          payer_type: string
          safe_funds: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          payer_type: string
          safe_funds?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          payer_type?: string
          safe_funds?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      payslips: {
        Row: {
          basic_salary: number
          conveyance_allowance: number
          created_at: string
          employee_id: string
          epf: number
          esi: number
          gross_wages: number
          hra: number
          id: string
          leaves_taken: number
          lop_days: number
          medical_allowance: number
          month_year: string
          net_salary: number
          other_allowances: number
          paid_days: number
          professional_tax: number
          status: string
          total_deductions: number
          total_earnings: number
          total_working_days: number
          updated_at: string
        }
        Insert: {
          basic_salary?: number
          conveyance_allowance?: number
          created_at?: string
          employee_id: string
          epf?: number
          esi?: number
          gross_wages?: number
          hra?: number
          id?: string
          leaves_taken?: number
          lop_days?: number
          medical_allowance?: number
          month_year: string
          net_salary?: number
          other_allowances?: number
          paid_days?: number
          professional_tax?: number
          status?: string
          total_deductions?: number
          total_earnings?: number
          total_working_days?: number
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          conveyance_allowance?: number
          created_at?: string
          employee_id?: string
          epf?: number
          esi?: number
          gross_wages?: number
          hra?: number
          id?: string
          leaves_taken?: number
          lop_days?: number
          medical_allowance?: number
          month_year?: string
          net_salary?: number
          other_allowances?: number
          paid_days?: number
          professional_tax?: number
          status?: string
          total_deductions?: number
          total_earnings?: number
          total_working_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_registrations: {
        Row: {
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          password_hash: string
          phone: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          username: string
        }
        Insert: {
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          password_hash: string
          phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          username: string
        }
        Update: {
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          password_hash?: string
          phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          username?: string
        }
        Relationships: []
      }
      performance_review_criteria: {
        Row: {
          category: string
          created_at: string
          criteria: string
          id: string
          review_id: string
          score: number | null
        }
        Insert: {
          category: string
          created_at?: string
          criteria: string
          id?: string
          review_id: string
          score?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          criteria?: string
          id?: string
          review_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_review_criteria_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          created_at: string
          employee_comments: string | null
          employee_id: string
          final_score: number | null
          hrd_comments: string | null
          hrd_name: string | null
          hrd_signature: string | null
          id: string
          review_date: string
          review_period: string
          status: string
          supervisor_comments: string | null
          supervisor_name: string | null
          supervisor_signature: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_comments?: string | null
          employee_id: string
          final_score?: number | null
          hrd_comments?: string | null
          hrd_name?: string | null
          hrd_signature?: string | null
          id?: string
          review_date?: string
          review_period: string
          status?: string
          supervisor_comments?: string | null
          supervisor_name?: string | null
          supervisor_signature?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_comments?: string | null
          employee_id?: string
          final_score?: number | null
          hrd_comments?: string | null
          hrd_name?: string | null
          hrd_signature?: string | null
          id?: string
          review_date?: string
          review_period?: string
          status?: string
          supervisor_comments?: string | null
          supervisor_name?: string | null
          supervisor_signature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
      positions: {
        Row: {
          created_at: string | null
          department_id: string | null
          description: string | null
          hierarchy_level: number | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
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
          assigned_to: string | null
          bank_account_id: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          failure_proof_url: string | null
          failure_reason: string | null
          id: string
          ifsc_code: string | null
          net_payable_amount: number | null
          order_date: string
          order_number: string
          pan_number: string | null
          payment_method_type: string | null
          payment_method_used: string | null
          payment_proof_url: string | null
          purchase_payment_method_id: string | null
          status: string
          supplier_name: string
          tax_amount: number | null
          tds_amount: number | null
          tds_applied: boolean | null
          total_amount: number
          updated_at: string
          upi_id: string | null
          warehouse_name: string | null
        }
        Insert: {
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failure_proof_url?: string | null
          failure_reason?: string | null
          id?: string
          ifsc_code?: string | null
          net_payable_amount?: number | null
          order_date: string
          order_number: string
          pan_number?: string | null
          payment_method_type?: string | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          purchase_payment_method_id?: string | null
          status?: string
          supplier_name: string
          tax_amount?: number | null
          tds_amount?: number | null
          tds_applied?: boolean | null
          total_amount: number
          updated_at?: string
          upi_id?: string | null
          warehouse_name?: string | null
        }
        Update: {
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failure_proof_url?: string | null
          failure_reason?: string | null
          id?: string
          ifsc_code?: string | null
          net_payable_amount?: number | null
          order_date?: string
          order_number?: string
          pan_number?: string | null
          payment_method_type?: string | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          purchase_payment_method_id?: string | null
          status?: string
          supplier_name?: string
          tax_amount?: number | null
          tds_amount?: number | null
          tds_applied?: boolean | null
          total_amount?: number
          updated_at?: string
          upi_id?: string | null
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
          safe_funds: boolean
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
          safe_funds?: boolean
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
          safe_funds?: boolean
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
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission: Database["public"]["Enums"]["app_permission"]
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system_role: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sales_order_id: string
          total_price: number
          unit_price: number
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sales_order_id: string
          total_price: number
          unit_price: number
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          total_price?: number
          unit_price?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          client_name: string
          client_phone: string | null
          cosmos_alert: boolean | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          order_date: string
          order_number: string
          payment_status: string
          platform: string | null
          price_per_unit: number
          product_id: string | null
          quantity: number
          risk_level: string | null
          sales_payment_method_id: string | null
          status: string
          total_amount: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          client_name: string
          client_phone?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_date: string
          order_number: string
          payment_status?: string
          platform?: string | null
          price_per_unit: number
          product_id?: string | null
          quantity: number
          risk_level?: string | null
          sales_payment_method_id?: string | null
          status?: string
          total_amount: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          client_name?: string
          client_phone?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_date?: string
          order_number?: string
          payment_status?: string
          platform?: string | null
          price_per_unit?: number
          product_id?: string | null
          quantity?: number
          risk_level?: string | null
          sales_payment_method_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_sales_payment_method_id_fkey"
            columns: ["sales_payment_method_id"]
            isOneToOne: false
            referencedRelation: "sales_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      tds_records: {
        Row: {
          created_at: string
          deduction_date: string
          financial_year: string
          id: string
          net_payable_amount: number
          pan_number: string
          purchase_order_id: string | null
          tds_amount: number
          tds_certificate_number: string | null
          tds_rate: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deduction_date?: string
          financial_year: string
          id?: string
          net_payable_amount: number
          pan_number: string
          purchase_order_id?: string | null
          tds_amount: number
          tds_certificate_number?: string | null
          tds_rate?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deduction_date?: string
          financial_year?: string
          id?: string
          net_payable_amount?: number
          pan_number?: string
          purchase_order_id?: string | null
          tds_amount?: number
          tds_certificate_number?: string | null
          tds_rate?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tds_records_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          ip_address: unknown | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string | null
          email_notifications: boolean | null
          id: string
          language: string | null
          notifications_enabled: boolean | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_locked_until: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          email_verified: boolean | null
          failed_login_attempts: number | null
          first_name: string | null
          id: string
          last_activity: string | null
          last_login: string | null
          last_name: string | null
          password_hash: string
          phone: string | null
          role_id: string | null
          status: string
          updated_at: string | null
          username: string
        }
        Insert: {
          account_locked_until?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          email_verified?: boolean | null
          failed_login_attempts?: number | null
          first_name?: string | null
          id?: string
          last_activity?: string | null
          last_login?: string | null
          last_name?: string | null
          password_hash: string
          phone?: string | null
          role_id?: string | null
          status?: string
          updated_at?: string | null
          username: string
        }
        Update: {
          account_locked_until?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          email_verified?: boolean | null
          failed_login_attempts?: number | null
          first_name?: string | null
          id?: string
          last_activity?: string | null
          last_login?: string | null
          last_name?: string | null
          password_hash?: string
          phone?: string | null
          role_id?: string | null
          status?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
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
      approve_registration: {
        Args: { registration_id: string }
        Returns: boolean
      }
      create_role_with_permissions: {
        Args: {
          role_name: string
          role_description: string
          permissions: string[]
        }
        Returns: string
      }
      create_user_with_password: {
        Args: {
          _username: string
          _email: string
          _password: string
          _first_name?: string
          _last_name?: string
          _phone?: string
        }
        Returns: string
      }
      generate_employee_id: {
        Args: { dept: string; designation: string }
        Returns: string
      }
      get_active_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          username: string
          email: string
          first_name: string
          last_name: string
          last_activity: string
          status: string
        }[]
      }
      get_default_risk_level: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_permissions: {
        Args: { user_uuid: string } | { username: string }
        Returns: {
          permission: Database["public"]["Enums"]["app_permission"]
        }[]
      }
      get_user_with_roles: {
        Args: { user_uuid: string }
        Returns: {
          user_id: string
          username: string
          email: string
          first_name: string
          last_name: string
          phone: string
          status: string
          created_at: string
          roles: Json
        }[]
      }
      reject_registration: {
        Args: { registration_id: string; reason?: string }
        Returns: boolean
      }
      update_role_permissions: {
        Args: {
          p_role_id: string
          p_role_name: string
          p_role_description: string
          p_permissions: string[]
        }
        Returns: boolean
      }
      update_user_activity: {
        Args: { user_uuid: string }
        Returns: undefined
      }
      user_has_permission: {
        Args:
          | {
              user_uuid: string
              check_permission: Database["public"]["Enums"]["app_permission"]
            }
          | {
              username: string
              check_permission: Database["public"]["Enums"]["app_permission"]
            }
        Returns: boolean
      }
      validate_user_credentials: {
        Args: { input_username: string; input_password: string }
        Returns: {
          user_id: string
          username: string
          email: string
          first_name: string
          last_name: string
          status: string
          is_valid: boolean
        }[]
      }
    }
    Enums: {
      app_permission:
        | "view_dashboard"
        | "view_sales"
        | "view_purchase"
        | "view_bams"
        | "view_clients"
        | "view_leads"
        | "view_user_management"
        | "view_hrms"
        | "view_payroll"
        | "view_compliance"
        | "view_stock_management"
        | "view_accounting"
        | "manage_users"
        | "manage_roles"
        | "manage_sales"
        | "manage_purchase"
        | "manage_stock"
        | "view_stock"
        | "manage_inventory"
        | "view_inventory"
        | "manage_clients"
        | "manage_leads"
        | "manage_hrms"
        | "manage_payroll"
        | "manage_accounting"
        | "manage_banking"
        | "view_banking"
        | "manage_compliance"
        | "admin_access"
        | "super_admin_access"
        | "CREATE_USERS"
        | "READ_USERS"
        | "UPDATE_USERS"
        | "DELETE_USERS"
        | "MANAGE_ROLES"
        | "MANAGE_SYSTEM"
        | "VIEW_REPORTS"
        | "MANAGE_CLIENTS"
        | "MANAGE_LEADS"
        | "MANAGE_SALES"
        | "MANAGE_PURCHASE"
        | "MANAGE_STOCK"
        | "MANAGE_ACCOUNTING"
        | "MANAGE_HRMS"
        | "MANAGE_PAYROLL"
        | "MANAGE_COMPLIANCE"
        | "dashboard_view"
        | "sales_view"
        | "sales_manage"
        | "purchase_view"
        | "purchase_manage"
        | "bams_view"
        | "bams_manage"
        | "clients_view"
        | "clients_manage"
        | "leads_view"
        | "leads_manage"
        | "user_management_view"
        | "user_management_manage"
        | "hrms_view"
        | "hrms_manage"
        | "payroll_view"
        | "payroll_manage"
        | "compliance_view"
        | "compliance_manage"
        | "stock_view"
        | "stock_manage"
        | "accounting_view"
        | "accounting_manage"
        | "video_kyc_view"
        | "video_kyc_manage"
        | "kyc_approvals_view"
        | "kyc_approvals_manage"
        | "statistics_view"
        | "statistics_manage"
      kyc_approval_status: "PENDING" | "APPROVED" | "REJECTED" | "QUERY"
      query_type: "VKYC_REQUIRED" | "MANUAL_QUERY"
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
      app_permission: [
        "view_dashboard",
        "view_sales",
        "view_purchase",
        "view_bams",
        "view_clients",
        "view_leads",
        "view_user_management",
        "view_hrms",
        "view_payroll",
        "view_compliance",
        "view_stock_management",
        "view_accounting",
        "manage_users",
        "manage_roles",
        "manage_sales",
        "manage_purchase",
        "manage_stock",
        "view_stock",
        "manage_inventory",
        "view_inventory",
        "manage_clients",
        "manage_leads",
        "manage_hrms",
        "manage_payroll",
        "manage_accounting",
        "manage_banking",
        "view_banking",
        "manage_compliance",
        "admin_access",
        "super_admin_access",
        "CREATE_USERS",
        "READ_USERS",
        "UPDATE_USERS",
        "DELETE_USERS",
        "MANAGE_ROLES",
        "MANAGE_SYSTEM",
        "VIEW_REPORTS",
        "MANAGE_CLIENTS",
        "MANAGE_LEADS",
        "MANAGE_SALES",
        "MANAGE_PURCHASE",
        "MANAGE_STOCK",
        "MANAGE_ACCOUNTING",
        "MANAGE_HRMS",
        "MANAGE_PAYROLL",
        "MANAGE_COMPLIANCE",
        "dashboard_view",
        "sales_view",
        "sales_manage",
        "purchase_view",
        "purchase_manage",
        "bams_view",
        "bams_manage",
        "clients_view",
        "clients_manage",
        "leads_view",
        "leads_manage",
        "user_management_view",
        "user_management_manage",
        "hrms_view",
        "hrms_manage",
        "payroll_view",
        "payroll_manage",
        "compliance_view",
        "compliance_manage",
        "stock_view",
        "stock_manage",
        "accounting_view",
        "accounting_manage",
        "video_kyc_view",
        "video_kyc_manage",
        "kyc_approvals_view",
        "kyc_approvals_manage",
        "statistics_view",
        "statistics_manage",
      ],
      kyc_approval_status: ["PENDING", "APPROVED", "REJECTED", "QUERY"],
      query_type: ["VKYC_REQUIRED", "MANUAL_QUERY"],
    },
  },
} as const
