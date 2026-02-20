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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      account_investigations: {
        Row: {
          assigned_to: string | null
          bank_account_id: string
          created_at: string
          id: string
          investigation_type: string
          notes: string | null
          priority: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          bank_account_id: string
          created_at?: string
          id?: string
          investigation_type: string
          notes?: string | null
          priority?: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          bank_account_id?: string
          created_at?: string
          id?: string
          investigation_type?: string
          notes?: string | null
          priority?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_investigations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_investigations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_action_logs: {
        Row: {
          action_type: string
          ad_details: Json | null
          adv_no: string | null
          created_at: string
          id: string
          metadata: Json | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action_type: string
          ad_details?: Json | null
          adv_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action_type?: string
          ad_details?: Json | null
          adv_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      ad_payment_methods: {
        Row: {
          binance_ad_id: string
          binance_pay_id: number | null
          created_at: string
          created_by_user_id: string | null
          id: string
          payment_method_id: string
        }
        Insert: {
          binance_ad_id: string
          binance_pay_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payment_method_id: string
        }
        Update: {
          binance_ad_id?: string
          binance_pay_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_payment_methods_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods_master"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_rest_timer: {
        Row: {
          created_at: string
          deactivated_ad_nos: string[] | null
          duration_minutes: number
          id: string
          is_active: boolean
          started_at: string
          started_by: string | null
        }
        Insert: {
          created_at?: string
          deactivated_ad_nos?: string[] | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          started_at?: string
          started_by?: string | null
        }
        Update: {
          created_at?: string
          deactivated_ad_nos?: string[] | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          started_at?: string
          started_by?: string | null
        }
        Relationships: []
      }
      asset_movement_history: {
        Row: {
          address: string | null
          amount: number
          asset: string
          fee: number | null
          id: string
          movement_time: number
          movement_type: string
          network: string | null
          raw_data: Json | null
          status: string | null
          synced_at: string
          transfer_direction: string | null
          tx_id: string | null
        }
        Insert: {
          address?: string | null
          amount?: number
          asset: string
          fee?: number | null
          id: string
          movement_time?: number
          movement_type: string
          network?: string | null
          raw_data?: Json | null
          status?: string | null
          synced_at?: string
          transfer_direction?: string | null
          tx_id?: string | null
        }
        Update: {
          address?: string | null
          amount?: number
          asset?: string
          fee?: number | null
          id?: string
          movement_time?: number
          movement_type?: string
          network?: string | null
          raw_data?: Json | null
          status?: string | null
          synced_at?: string
          transfer_direction?: string | null
          tx_id?: string | null
        }
        Relationships: []
      }
      asset_movement_sync_metadata: {
        Row: {
          id: string
          last_deposit_time: number | null
          last_sync_at: string | null
          last_transfer_time: number | null
          last_withdraw_time: number | null
        }
        Insert: {
          id?: string
          last_deposit_time?: number | null
          last_sync_at?: string | null
          last_transfer_time?: number | null
          last_withdraw_time?: number | null
        }
        Update: {
          id?: string
          last_deposit_time?: number | null
          last_sync_at?: string | null
          last_transfer_time?: number | null
          last_withdraw_time?: number | null
        }
        Relationships: []
      }
      asset_value_history: {
        Row: {
          created_at: string
          id: string
          snapshot_date: string
          total_asset_value: number
        }
        Insert: {
          created_at?: string
          id?: string
          snapshot_date: string
          total_asset_value?: number
        }
        Update: {
          created_at?: string
          id?: string
          snapshot_date?: string
          total_asset_value?: number
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_status: string
          account_type: string
          balance: number
          balance_locked: boolean | null
          bank_account_holder_name: string | null
          bank_name: string
          branch: string | null
          created_at: string
          dormant_at: string | null
          dormant_by: string | null
          id: string
          IFSC: string | null
          lien_amount: number
          status: string
          subsidiary_id: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          account_status?: string
          account_type?: string
          balance?: number
          balance_locked?: boolean | null
          bank_account_holder_name?: string | null
          bank_name: string
          branch?: string | null
          created_at?: string
          dormant_at?: string | null
          dormant_by?: string | null
          id?: string
          IFSC?: string | null
          lien_amount?: number
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_status?: string
          account_type?: string
          balance?: number
          balance_locked?: boolean | null
          bank_account_holder_name?: string | null
          bank_name?: string
          branch?: string | null
          created_at?: string
          dormant_at?: string | null
          dormant_by?: string | null
          id?: string
          IFSC?: string | null
          lien_amount?: number
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_cases: {
        Row: {
          amount_involved: number | null
          amount_lien_marked: number | null
          amount_transferred: number | null
          assigned_to: string | null
          bank_account_id: string | null
          bank_ifsc_code: string | null
          bank_reason: string | null
          beneficiary_account_number: string | null
          beneficiary_details: string | null
          beneficiary_name: string | null
          case_number: string
          case_type: string
          contact_details: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          date_lien_marked: string | null
          date_of_discrepancy: string | null
          description: string | null
          difference_amount: number | null
          documents_attached: string[] | null
          due_date: string | null
          error_message: string | null
          expected_balance: number | null
          expected_settlement_amount: number | null
          id: string
          investigation_assigned_to: string | null
          investigation_started_at: string | null
          investigation_status: string | null
          pending_since: string | null
          priority: string
          proof_of_debit: string | null
          remarks: string | null
          reported_balance: number | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshots: string[] | null
          settlement_date: string | null
          settlement_reference_id: string | null
          statement_proof: string | null
          status: string
          supporting_document: string | null
          supporting_proof: string | null
          title: string
          transaction_datetime: string | null
          transaction_reference: string | null
          updated_at: string
          wrong_beneficiary_account: string | null
          wrong_beneficiary_name: string | null
        }
        Insert: {
          amount_involved?: number | null
          amount_lien_marked?: number | null
          amount_transferred?: number | null
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_ifsc_code?: string | null
          bank_reason?: string | null
          beneficiary_account_number?: string | null
          beneficiary_details?: string | null
          beneficiary_name?: string | null
          case_number: string
          case_type: string
          contact_details?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          date_lien_marked?: string | null
          date_of_discrepancy?: string | null
          description?: string | null
          difference_amount?: number | null
          documents_attached?: string[] | null
          due_date?: string | null
          error_message?: string | null
          expected_balance?: number | null
          expected_settlement_amount?: number | null
          id?: string
          investigation_assigned_to?: string | null
          investigation_started_at?: string | null
          investigation_status?: string | null
          pending_since?: string | null
          priority?: string
          proof_of_debit?: string | null
          remarks?: string | null
          reported_balance?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshots?: string[] | null
          settlement_date?: string | null
          settlement_reference_id?: string | null
          statement_proof?: string | null
          status?: string
          supporting_document?: string | null
          supporting_proof?: string | null
          title: string
          transaction_datetime?: string | null
          transaction_reference?: string | null
          updated_at?: string
          wrong_beneficiary_account?: string | null
          wrong_beneficiary_name?: string | null
        }
        Update: {
          amount_involved?: number | null
          amount_lien_marked?: number | null
          amount_transferred?: number | null
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_ifsc_code?: string | null
          bank_reason?: string | null
          beneficiary_account_number?: string | null
          beneficiary_details?: string | null
          beneficiary_name?: string | null
          case_number?: string
          case_type?: string
          contact_details?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          date_lien_marked?: string | null
          date_of_discrepancy?: string | null
          description?: string | null
          difference_amount?: number | null
          documents_attached?: string[] | null
          due_date?: string | null
          error_message?: string | null
          expected_balance?: number | null
          expected_settlement_amount?: number | null
          id?: string
          investigation_assigned_to?: string | null
          investigation_started_at?: string | null
          investigation_status?: string | null
          pending_since?: string | null
          priority?: string
          proof_of_debit?: string | null
          remarks?: string | null
          reported_balance?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshots?: string[] | null
          settlement_date?: string | null
          settlement_reference_id?: string | null
          statement_proof?: string | null
          status?: string
          supporting_document?: string | null
          supporting_proof?: string | null
          title?: string
          transaction_datetime?: string | null
          transaction_reference?: string | null
          updated_at?: string
          wrong_beneficiary_account?: string | null
          wrong_beneficiary_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_cases_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_cases_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
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
          client_id: string | null
          created_at: string
          created_by: string | null
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
          client_id?: string | null
          created_at?: string
          created_by?: string | null
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
          client_id?: string | null
          created_at?: string
          created_by?: string | null
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
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          {
            foreignKeyName: "banking_credentials_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      binance_order_history: {
        Row: {
          adv_no: string | null
          amount: string | null
          asset: string | null
          commission: string | null
          counter_part_nick_name: string | null
          create_time: number
          fiat_unit: string | null
          order_number: string
          order_status: string | null
          pay_method_name: string | null
          raw_data: Json | null
          synced_at: string
          total_price: string | null
          trade_type: string | null
          unit_price: string | null
          verified_name: string | null
        }
        Insert: {
          adv_no?: string | null
          amount?: string | null
          asset?: string | null
          commission?: string | null
          counter_part_nick_name?: string | null
          create_time: number
          fiat_unit?: string | null
          order_number: string
          order_status?: string | null
          pay_method_name?: string | null
          raw_data?: Json | null
          synced_at?: string
          total_price?: string | null
          trade_type?: string | null
          unit_price?: string | null
          verified_name?: string | null
        }
        Update: {
          adv_no?: string | null
          amount?: string | null
          asset?: string | null
          commission?: string | null
          counter_part_nick_name?: string | null
          create_time?: number
          fiat_unit?: string | null
          order_number?: string
          order_status?: string | null
          pay_method_name?: string | null
          raw_data?: Json | null
          synced_at?: string
          total_price?: string | null
          trade_type?: string | null
          unit_price?: string | null
          verified_name?: string | null
        }
        Relationships: []
      }
      binance_sync_metadata: {
        Row: {
          id: string
          last_sync_at: string | null
          last_sync_duration_ms: number | null
          last_sync_order_count: number | null
        }
        Insert: {
          id?: string
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          last_sync_order_count?: number | null
        }
        Update: {
          id?: string
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          last_sync_order_count?: number | null
        }
        Relationships: []
      }
      chat_message_senders: {
        Row: {
          created_at: string
          id: string
          message_content: string
          order_number: string
          sent_at_ms: number
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_content: string
          order_number: string
          sent_at_ms: number
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          message_content?: string
          order_number?: string
          sent_at_ms?: number
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      client_onboarding_approvals: {
        Row: {
          aadhar_back_url: string | null
          aadhar_front_url: string | null
          aadhar_number: string | null
          additional_documents_url: string[] | null
          address: string | null
          approval_status: string
          binance_id_screenshot_url: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_state: string | null
          compliance_notes: string | null
          created_at: string
          id: string
          order_amount: number
          order_date: string
          proposed_monthly_limit: number | null
          purpose_of_buying: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_assessment: string | null
          sales_order_id: string | null
          updated_at: string
          vkyc_notes: string | null
          vkyc_recording_url: string | null
        }
        Insert: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          aadhar_number?: string | null
          additional_documents_url?: string[] | null
          address?: string | null
          approval_status?: string
          binance_id_screenshot_url?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_state?: string | null
          compliance_notes?: string | null
          created_at?: string
          id?: string
          order_amount: number
          order_date: string
          proposed_monthly_limit?: number | null
          purpose_of_buying?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_assessment?: string | null
          sales_order_id?: string | null
          updated_at?: string
          vkyc_notes?: string | null
          vkyc_recording_url?: string | null
        }
        Update: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          aadhar_number?: string | null
          additional_documents_url?: string[] | null
          address?: string | null
          approval_status?: string
          binance_id_screenshot_url?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_state?: string | null
          compliance_notes?: string | null
          created_at?: string
          id?: string
          order_amount?: number
          order_date?: string
          proposed_monthly_limit?: number | null
          purpose_of_buying?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_assessment?: string | null
          sales_order_id?: string | null
          updated_at?: string
          vkyc_notes?: string | null
          vkyc_recording_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_approvals_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          aadhar_back_url: string | null
          aadhar_front_url: string | null
          assigned_operator: string | null
          buyer_approval_status: string | null
          buyer_approved_at: string | null
          buying_purpose: string | null
          client_id: string
          client_type: string
          client_value_score: number | null
          created_at: string
          current_month_used: number | null
          date_of_onboarding: string
          default_risk_level: string | null
          deleted_at: string | null
          email: string | null
          first_order_value: number | null
          id: string
          is_buyer: boolean | null
          is_deleted: boolean
          is_seller: boolean | null
          kyc_status: string
          linked_bank_accounts: Json | null
          monthly_limit: number | null
          name: string
          operator_notes: string | null
          other_documents_urls: string[] | null
          pan_card_number: string | null
          pan_card_url: string | null
          phone: string | null
          risk_appetite: string
          seller_approval_status: string | null
          seller_approved_at: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          assigned_operator?: string | null
          buyer_approval_status?: string | null
          buyer_approved_at?: string | null
          buying_purpose?: string | null
          client_id: string
          client_type: string
          client_value_score?: number | null
          created_at?: string
          current_month_used?: number | null
          date_of_onboarding: string
          default_risk_level?: string | null
          deleted_at?: string | null
          email?: string | null
          first_order_value?: number | null
          id?: string
          is_buyer?: boolean | null
          is_deleted?: boolean
          is_seller?: boolean | null
          kyc_status?: string
          linked_bank_accounts?: Json | null
          monthly_limit?: number | null
          name: string
          operator_notes?: string | null
          other_documents_urls?: string[] | null
          pan_card_number?: string | null
          pan_card_url?: string | null
          phone?: string | null
          risk_appetite?: string
          seller_approval_status?: string | null
          seller_approved_at?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          assigned_operator?: string | null
          buyer_approval_status?: string | null
          buyer_approved_at?: string | null
          buying_purpose?: string | null
          client_id?: string
          client_type?: string
          client_value_score?: number | null
          created_at?: string
          current_month_used?: number | null
          date_of_onboarding?: string
          default_risk_level?: string | null
          deleted_at?: string | null
          email?: string | null
          first_order_value?: number | null
          id?: string
          is_buyer?: boolean | null
          is_deleted?: boolean
          is_seller?: boolean | null
          kyc_status?: string
          linked_bank_accounts?: Json | null
          monthly_limit?: number | null
          name?: string
          operator_notes?: string | null
          other_documents_urls?: string[] | null
          pan_card_number?: string | null
          pan_card_url?: string | null
          phone?: string | null
          risk_appetite?: string
          seller_approval_status?: string | null
          seller_approved_at?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      closed_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_account_holder_name: string | null
          bank_name: string
          branch: string | null
          closed_by: string | null
          closure_date: string
          closure_documents: string[] | null
          closure_reason: string
          created_at: string
          final_balance: number
          id: string
          ifsc: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_holder_name?: string | null
          bank_name: string
          branch?: string | null
          closed_by?: string | null
          closure_date?: string
          closure_documents?: string[] | null
          closure_reason: string
          created_at?: string
          final_balance?: number
          id?: string
          ifsc?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_holder_name?: string | null
          bank_name?: string
          branch?: string | null
          closed_by?: string | null
          closure_date?: string
          closure_documents?: string[] | null
          closure_reason?: string
          created_at?: string
          final_balance?: number
          id?: string
          ifsc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      compliance_documents: {
        Row: {
          category: string
          created_at: string
          expiry_date: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          expiry_date?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          expiry_date?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      conversion_journal_entries: {
        Row: {
          asset_code: string
          conversion_id: string
          created_at: string
          id: string
          line_type: string
          notes: string | null
          qty_delta: number | null
          usdt_delta: number | null
        }
        Insert: {
          asset_code: string
          conversion_id: string
          created_at?: string
          id?: string
          line_type: string
          notes?: string | null
          qty_delta?: number | null
          usdt_delta?: number | null
        }
        Update: {
          asset_code?: string
          conversion_id?: string
          created_at?: string
          id?: string
          line_type?: string
          notes?: string | null
          qty_delta?: number | null
          usdt_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_journal_entries_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "erp_product_conversions"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparty_contact_records: {
        Row: {
          collected_by: string | null
          contact_number: string | null
          counterparty_nickname: string
          created_at: string
          id: string
          state: string | null
          updated_at: string
        }
        Insert: {
          collected_by?: string | null
          contact_number?: string | null
          counterparty_nickname: string
          created_at?: string
          id?: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          collected_by?: string | null
          contact_number?: string | null
          counterparty_nickname?: string
          created_at?: string
          id?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      counterparty_pan_records: {
        Row: {
          collected_by: string | null
          counterparty_nickname: string
          created_at: string
          id: string
          pan_number: string
          updated_at: string
        }
        Insert: {
          collected_by?: string | null
          counterparty_nickname: string
          created_at?: string
          id?: string
          pan_number: string
          updated_at?: string
        }
        Update: {
          collected_by?: string | null
          counterparty_nickname?: string
          created_at?: string
          id?: string
          pan_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_gross_profit_history: {
        Row: {
          avg_sales_rate: number
          created_at: string
          effective_purchase_rate: number
          gross_profit: number
          id: string
          snapshot_date: string
          total_sales_qty: number
        }
        Insert: {
          avg_sales_rate?: number
          created_at?: string
          effective_purchase_rate?: number
          gross_profit?: number
          id?: string
          snapshot_date: string
          total_sales_qty?: number
        }
        Update: {
          avg_sales_rate?: number
          created_at?: string
          effective_purchase_rate?: number
          gross_profit?: number
          id?: string
          snapshot_date?: string
          total_sales_qty?: number
        }
        Relationships: []
      }
      debug_po_log: {
        Row: {
          created_at: string | null
          id: number
          operation: string | null
          payload: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          operation?: string | null
          payload?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          operation?: string | null
          payload?: string | null
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
      documents: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          is_public: boolean | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string
          id?: string
          is_public?: boolean | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          is_public?: boolean | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
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
          aadhaar_card_url: string | null
          aadhaar_number: string | null
          account_number: string | null
          allowances: number | null
          alternate_phone: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account_holder_name: string | null
          bank_name: string | null
          basic_salary: number | null
          blood_group: string | null
          created_at: string
          ctc: number | null
          current_address: string | null
          date_of_birth: string | null
          date_of_joining: string | null
          deductions: number | null
          department: string
          department_code: string | null
          department_id: string | null
          designation: string
          email: string
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          emergency_contact_relation: string | null
          employee_id: string
          employee_type: string | null
          gender: string | null
          handbook_acknowledged: boolean | null
          handbook_acknowledged_at: string | null
          has_payment_rights: boolean | null
          hierarchy_level: number | null
          id: string
          ifsc_code: string | null
          incentives: number | null
          job_contract_signed: boolean | null
          kyc_status: string | null
          marital_status: string | null
          middle_name: string | null
          name: string
          nda_acknowledged: boolean | null
          nda_acknowledged_at: string | null
          offer_letter_url: string | null
          onboarding_completed: boolean | null
          other_certificates_urls: string[] | null
          pan_card_url: string | null
          pan_number: string | null
          permanent_address: string | null
          phone: string | null
          photo_url: string | null
          position_id: string | null
          probation_duration_months: number | null
          probation_period: boolean | null
          rejection_reason: string | null
          reporting_manager_id: string | null
          reports_to: string | null
          resume_url: string | null
          salary: number | null
          shift: string | null
          status: string
          updated_at: string
          upi_id: string | null
          user_id: string | null
          work_location: string | null
        }
        Insert: {
          aadhaar_card_url?: string | null
          aadhaar_number?: string | null
          account_number?: string | null
          allowances?: number | null
          alternate_phone?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_holder_name?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          blood_group?: string | null
          created_at?: string
          ctc?: number | null
          current_address?: string | null
          date_of_birth?: string | null
          date_of_joining?: string | null
          deductions?: number | null
          department: string
          department_code?: string | null
          department_id?: string | null
          designation: string
          email: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          employee_type?: string | null
          gender?: string | null
          handbook_acknowledged?: boolean | null
          handbook_acknowledged_at?: string | null
          has_payment_rights?: boolean | null
          hierarchy_level?: number | null
          id?: string
          ifsc_code?: string | null
          incentives?: number | null
          job_contract_signed?: boolean | null
          kyc_status?: string | null
          marital_status?: string | null
          middle_name?: string | null
          name: string
          nda_acknowledged?: boolean | null
          nda_acknowledged_at?: string | null
          offer_letter_url?: string | null
          onboarding_completed?: boolean | null
          other_certificates_urls?: string[] | null
          pan_card_url?: string | null
          pan_number?: string | null
          permanent_address?: string | null
          phone?: string | null
          photo_url?: string | null
          position_id?: string | null
          probation_duration_months?: number | null
          probation_period?: boolean | null
          rejection_reason?: string | null
          reporting_manager_id?: string | null
          reports_to?: string | null
          resume_url?: string | null
          salary?: number | null
          shift?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          user_id?: string | null
          work_location?: string | null
        }
        Update: {
          aadhaar_card_url?: string | null
          aadhaar_number?: string | null
          account_number?: string | null
          allowances?: number | null
          alternate_phone?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_holder_name?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          blood_group?: string | null
          created_at?: string
          ctc?: number | null
          current_address?: string | null
          date_of_birth?: string | null
          date_of_joining?: string | null
          deductions?: number | null
          department?: string
          department_code?: string | null
          department_id?: string | null
          designation?: string
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          employee_type?: string | null
          gender?: string | null
          handbook_acknowledged?: boolean | null
          handbook_acknowledged_at?: string | null
          has_payment_rights?: boolean | null
          hierarchy_level?: number | null
          id?: string
          ifsc_code?: string | null
          incentives?: number | null
          job_contract_signed?: boolean | null
          kyc_status?: string | null
          marital_status?: string | null
          middle_name?: string | null
          name?: string
          nda_acknowledged?: boolean | null
          nda_acknowledged_at?: string | null
          offer_letter_url?: string | null
          onboarding_completed?: boolean | null
          other_certificates_urls?: string[] | null
          pan_card_url?: string | null
          pan_number?: string | null
          permanent_address?: string | null
          phone?: string | null
          photo_url?: string | null
          position_id?: string | null
          probation_duration_months?: number | null
          probation_period?: boolean | null
          rejection_reason?: string | null
          reporting_manager_id?: string | null
          reports_to?: string | null
          resume_url?: string | null
          salary?: number | null
          shift?: string | null
          status?: string
          updated_at?: string
          upi_id?: string | null
          user_id?: string | null
          work_location?: string | null
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
            foreignKeyName: "employees_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
      erp_action_queue: {
        Row: {
          action_type: string | null
          amount: number
          asset: string
          created_at: string
          erp_reference_id: string | null
          id: string
          movement_id: string
          movement_time: number
          movement_type: string
          network: string | null
          processed_at: string | null
          processed_by: string | null
          raw_data: Json | null
          reject_reason: string | null
          status: string
          tx_id: string | null
          wallet_id: string | null
        }
        Insert: {
          action_type?: string | null
          amount?: number
          asset: string
          created_at?: string
          erp_reference_id?: string | null
          id?: string
          movement_id: string
          movement_time?: number
          movement_type: string
          network?: string | null
          processed_at?: string | null
          processed_by?: string | null
          raw_data?: Json | null
          reject_reason?: string | null
          status?: string
          tx_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          action_type?: string | null
          amount?: number
          asset?: string
          created_at?: string
          erp_reference_id?: string | null
          id?: string
          movement_id?: string
          movement_time?: number
          movement_type?: string
          network?: string | null
          processed_at?: string | null
          processed_by?: string | null
          raw_data?: Json | null
          reject_reason?: string | null
          status?: string
          tx_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_action_queue_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_product_conversions: {
        Row: {
          actual_execution_rate: number | null
          actual_usdt_received: number | null
          approved_at: string | null
          approved_by: string | null
          asset_code: string
          binance_transfer_id: string | null
          cost_out_usdt: number | null
          created_at: string
          created_by: string
          execution_rate_usdt: number | null
          fee_amount: number | null
          fee_asset: string | null
          fee_percentage: number | null
          fx_rate_to_usdt: number | null
          gross_usd_value: number
          id: string
          local_currency: string | null
          local_price: number | null
          market_rate_snapshot: number | null
          metadata: Json | null
          net_asset_change: number
          net_usdt_change: number
          price_usd: number
          quantity: number
          quantity_gross: number | null
          quantity_net: number | null
          rate_reconciled_at: string | null
          rate_reconciled_by: string | null
          rate_variance_usdt: number | null
          realized_pnl_usdt: number | null
          reference_no: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          side: string
          source: string | null
          spot_trade_id: string | null
          status: string
          wallet_id: string
        }
        Insert: {
          actual_execution_rate?: number | null
          actual_usdt_received?: number | null
          approved_at?: string | null
          approved_by?: string | null
          asset_code: string
          binance_transfer_id?: string | null
          cost_out_usdt?: number | null
          created_at?: string
          created_by: string
          execution_rate_usdt?: number | null
          fee_amount?: number | null
          fee_asset?: string | null
          fee_percentage?: number | null
          fx_rate_to_usdt?: number | null
          gross_usd_value: number
          id?: string
          local_currency?: string | null
          local_price?: number | null
          market_rate_snapshot?: number | null
          metadata?: Json | null
          net_asset_change: number
          net_usdt_change: number
          price_usd: number
          quantity: number
          quantity_gross?: number | null
          quantity_net?: number | null
          rate_reconciled_at?: string | null
          rate_reconciled_by?: string | null
          rate_variance_usdt?: number | null
          realized_pnl_usdt?: number | null
          reference_no?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          side: string
          source?: string | null
          spot_trade_id?: string | null
          status?: string
          wallet_id: string
        }
        Update: {
          actual_execution_rate?: number | null
          actual_usdt_received?: number | null
          approved_at?: string | null
          approved_by?: string | null
          asset_code?: string
          binance_transfer_id?: string | null
          cost_out_usdt?: number | null
          created_at?: string
          created_by?: string
          execution_rate_usdt?: number | null
          fee_amount?: number | null
          fee_asset?: string | null
          fee_percentage?: number | null
          fx_rate_to_usdt?: number | null
          gross_usd_value?: number
          id?: string
          local_currency?: string | null
          local_price?: number | null
          market_rate_snapshot?: number | null
          metadata?: Json | null
          net_asset_change?: number
          net_usdt_change?: number
          price_usd?: number
          quantity?: number
          quantity_gross?: number | null
          quantity_net?: number | null
          rate_reconciled_at?: string | null
          rate_reconciled_by?: string | null
          rate_variance_usdt?: number | null
          realized_pnl_usdt?: number | null
          reference_no?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          side?: string
          source?: string | null
          spot_trade_id?: string | null
          status?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_product_conversions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_conversions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_conversions_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_conversions_spot_trade_id_fkey"
            columns: ["spot_trade_id"]
            isOneToOne: true
            referencedRelation: "spot_trade_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_product_conversions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_announcements: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean | null
          published: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          published?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          published?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_asset_assignments: {
        Row: {
          asset_id: string
          assigned_by: string | null
          assigned_date: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          return_date: string | null
          return_reason: string | null
          status: string
        }
        Insert: {
          asset_id: string
          assigned_by?: string | null
          assigned_date?: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          return_date?: string | null
          return_reason?: string | null
          status?: string
        }
        Update: {
          asset_id?: string
          assigned_by?: string | null
          assigned_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          return_date?: string | null
          return_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "hr_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_asset_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_assets: {
        Row: {
          asset_type: string
          assigned_date: string | null
          assigned_to: string | null
          condition: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          purchase_cost: number | null
          purchase_date: string | null
          return_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_type?: string
          assigned_date?: string | null
          assigned_to?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          return_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          assigned_date?: string | null
          assigned_to?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          return_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance: {
        Row: {
          attendance_date: string
          attendance_status: string | null
          check_in: string | null
          check_out: string | null
          created_at: string
          early_leave_minutes: number | null
          employee_id: string
          id: string
          late_minutes: number | null
          notes: string | null
          overtime_hours: number | null
          shift_id: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          attendance_date?: string
          attendance_status?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          early_leave_minutes?: number | null
          employee_id: string
          id?: string
          late_minutes?: number | null
          notes?: string | null
          overtime_hours?: number | null
          shift_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          attendance_date?: string
          attendance_status?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          early_leave_minutes?: number | null
          employee_id?: string
          id?: string
          late_minutes?: number | null
          notes?: string | null
          overtime_hours?: number | null
          shift_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_activity: {
        Row: {
          activity_date: string
          clock_in: string | null
          clock_in_note: string | null
          clock_out: string | null
          clock_out_note: string | null
          created_at: string
          employee_id: string
          id: string
        }
        Insert: {
          activity_date?: string
          clock_in?: string | null
          clock_in_note?: string | null
          clock_out?: string | null
          clock_out_note?: string | null
          created_at?: string
          employee_id: string
          id?: string
        }
        Update: {
          activity_date?: string
          clock_in?: string | null
          clock_in_note?: string | null
          clock_out?: string | null
          clock_out_note?: string | null
          created_at?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_activity_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_biometric_devices: {
        Row: {
          company: string | null
          created_at: string
          device_direction: string
          device_type: string
          employees_count: number | null
          id: string
          is_connected: boolean
          is_live_capture: boolean
          is_scheduled: boolean
          last_sync_at: string | null
          machine_ip: string | null
          name: string
          password: string | null
          port_no: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          device_direction?: string
          device_type?: string
          employees_count?: number | null
          id?: string
          is_connected?: boolean
          is_live_capture?: boolean
          is_scheduled?: boolean
          last_sync_at?: string | null
          machine_ip?: string | null
          name: string
          password?: string | null
          port_no?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          device_direction?: string
          device_type?: string
          employees_count?: number | null
          id?: string
          is_connected?: boolean
          is_live_capture?: boolean
          is_scheduled?: boolean
          last_sync_at?: string | null
          machine_ip?: string | null
          name?: string
          password?: string | null
          port_no?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hr_bonus_points: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          points: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          points?: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          points?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_bonus_points_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_notes: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          note: string
          note_by: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          note: string
          note_by?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          note?: string
          note_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidate_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_ratings: {
        Row: {
          candidate_id: string
          created_at: string
          employee_id: string
          id: string
          rating: number
        }
        Insert: {
          candidate_id: string
          created_at?: string
          employee_id: string
          id?: string
          rating?: number
        }
        Update: {
          candidate_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidate_ratings_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_ratings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_stages: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          onboarding_stage_id: string
          stage_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          onboarding_stage_id: string
          stage_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          onboarding_stage_id?: string
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidate_stages_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_stages_onboarding_stage_id_fkey"
            columns: ["onboarding_stage_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_tasks: {
        Row: {
          candidate_stage_id: string
          candidate_task_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_stage_id: string
          candidate_task_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_stage_id?: string
          candidate_task_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidate_tasks_candidate_stage_id_fkey"
            columns: ["candidate_stage_id"]
            isOneToOne: false
            referencedRelation: "hr_candidate_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_tasks_candidate_task_id_fkey"
            columns: ["candidate_task_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidates: {
        Row: {
          address: string | null
          canceled: boolean | null
          city: string | null
          converted: boolean | null
          country: string | null
          created_at: string
          dob: string | null
          email: string | null
          gender: string | null
          hired: boolean | null
          hired_date: string | null
          id: string
          job_position_id: string | null
          joining_date: string | null
          mobile: string | null
          name: string
          offer_letter_status: string | null
          portfolio_url: string | null
          profile_image_url: string | null
          rating: number | null
          recruitment_id: string | null
          referral_id: string | null
          reject_reason: string | null
          resume_url: string | null
          schedule_date: string | null
          sequence: number | null
          source: string | null
          stage_id: string | null
          start_onboard: boolean | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          canceled?: boolean | null
          city?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          gender?: string | null
          hired?: boolean | null
          hired_date?: string | null
          id?: string
          job_position_id?: string | null
          joining_date?: string | null
          mobile?: string | null
          name: string
          offer_letter_status?: string | null
          portfolio_url?: string | null
          profile_image_url?: string | null
          rating?: number | null
          recruitment_id?: string | null
          referral_id?: string | null
          reject_reason?: string | null
          resume_url?: string | null
          schedule_date?: string | null
          sequence?: number | null
          source?: string | null
          stage_id?: string | null
          start_onboard?: boolean | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          canceled?: boolean | null
          city?: string | null
          converted?: boolean | null
          country?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          gender?: string | null
          hired?: boolean | null
          hired_date?: string | null
          id?: string
          job_position_id?: string | null
          joining_date?: string | null
          mobile?: string | null
          name?: string
          offer_letter_status?: string | null
          portfolio_url?: string | null
          profile_image_url?: string | null
          rating?: number | null
          recruitment_id?: string | null
          referral_id?: string | null
          reject_reason?: string | null
          resume_url?: string | null
          schedule_date?: string | null
          sequence?: number | null
          source?: string | null
          stage_id?: string | null
          start_onboard?: boolean | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidates_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_disciplinary_actions: {
        Row: {
          action_type: string
          attachment_url: string | null
          created_at: string
          description: string | null
          duration: number | null
          employee_ids: string[]
          id: string
          start_date: string | null
          unit_in: string | null
        }
        Insert: {
          action_type: string
          attachment_url?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          employee_ids?: string[]
          id?: string
          start_date?: string | null
          unit_in?: string | null
        }
        Update: {
          action_type?: string
          attachment_url?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          employee_ids?: string[]
          id?: string
          start_date?: string | null
          unit_in?: string | null
        }
        Relationships: []
      }
      hr_employee_bank_details: {
        Row: {
          account_number: string | null
          additional_info: Json | null
          address: string | null
          bank_code_1: string | null
          bank_code_2: string | null
          bank_name: string | null
          branch: string | null
          city: string | null
          country: string | null
          created_at: string
          employee_id: string
          id: string
          state: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          additional_info?: Json | null
          address?: string | null
          bank_code_1?: string | null
          bank_code_2?: string | null
          bank_name?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_id: string
          id?: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          additional_info?: Json | null
          address?: string | null
          bank_code_1?: string | null
          bank_code_2?: string | null
          bank_name?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_bank_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_notes: {
        Row: {
          created_at: string
          description: string
          employee_id: string
          id: string
          note_files: string[] | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description: string
          employee_id: string
          id?: string
          note_files?: string[] | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          employee_id?: string
          id?: string
          note_files?: string[] | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_salary: {
        Row: {
          amount: number
          component_id: string
          created_at: string
          effective_from: string | null
          employee_id: string
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          amount?: number
          component_id: string
          created_at?: string
          effective_from?: string | null
          employee_id: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          effective_from?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_salary_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_salary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_salary_structures: {
        Row: {
          amount: number
          component_id: string
          created_at: string
          employee_id: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          amount?: number
          component_id: string
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_salary_structures_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      hr_employee_work_info: {
        Row: {
          additional_info: Json | null
          basic_salary: number | null
          company_name: string | null
          contract_end_date: string | null
          created_at: string
          department_id: string | null
          employee_id: string
          employee_type: string | null
          experience_years: number | null
          id: string
          job_position_id: string | null
          job_role: string | null
          joining_date: string | null
          location: string | null
          reporting_manager_id: string | null
          salary_per_hour: number | null
          shift_id: string | null
          tags: string[] | null
          updated_at: string
          work_email: string | null
          work_phone: string | null
          work_type: string | null
        }
        Insert: {
          additional_info?: Json | null
          basic_salary?: number | null
          company_name?: string | null
          contract_end_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_id: string
          employee_type?: string | null
          experience_years?: number | null
          id?: string
          job_position_id?: string | null
          job_role?: string | null
          joining_date?: string | null
          location?: string | null
          reporting_manager_id?: string | null
          salary_per_hour?: number | null
          shift_id?: string | null
          tags?: string[] | null
          updated_at?: string
          work_email?: string | null
          work_phone?: string | null
          work_type?: string | null
        }
        Update: {
          additional_info?: Json | null
          basic_salary?: number | null
          company_name?: string | null
          contract_end_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_id?: string
          employee_type?: string | null
          experience_years?: number | null
          id?: string
          job_position_id?: string | null
          job_role?: string | null
          joining_date?: string | null
          location?: string | null
          reporting_manager_id?: string | null
          salary_per_hour?: number | null
          shift_id?: string | null
          tags?: string[] | null
          updated_at?: string
          work_email?: string | null
          work_phone?: string | null
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_work_info_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_work_info_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_work_info_job_position_id_fkey"
            columns: ["job_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_work_info_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          additional_info: Json | null
          address: string | null
          badge_id: string
          basic_salary: number | null
          children: number | null
          city: string | null
          country: string | null
          created_at: string
          dob: string | null
          email: string | null
          emergency_contact: string | null
          emergency_contact_name: string | null
          emergency_contact_relation: string | null
          experience: string | null
          first_name: string
          gender: string | null
          id: string
          is_active: boolean
          last_name: string
          marital_status: string | null
          phone: string | null
          profile_image_url: string | null
          qualification: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          additional_info?: Json | null
          address?: string | null
          badge_id: string
          basic_salary?: number | null
          children?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relation?: string | null
          experience?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_name: string
          marital_status?: string | null
          phone?: string | null
          profile_image_url?: string | null
          qualification?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          additional_info?: Json | null
          address?: string | null
          badge_id?: string
          basic_salary?: number | null
          children?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relation?: string | null
          experience?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          marital_status?: string | null
          phone?: string | null
          profile_image_url?: string | null
          qualification?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      hr_feedback_360: {
        Row: {
          comments: string | null
          created_at: string
          employee_id: string
          feedback_type: string
          id: string
          improvements: string | null
          rating: number | null
          review_cycle: string
          reviewer_id: string | null
          status: string
          strengths: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          employee_id: string
          feedback_type?: string
          id?: string
          improvements?: string | null
          rating?: number | null
          review_cycle: string
          reviewer_id?: string | null
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          employee_id?: string
          feedback_type?: string
          id?: string
          improvements?: string | null
          rating?: number | null
          review_cycle?: string
          reviewer_id?: string | null
          status?: string
          strengths?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_feedback_360_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_feedback_360_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_helpdesk_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          priority: string | null
          raised_by: string | null
          resolution: string | null
          resolved_at: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string | null
          raised_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_helpdesk_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_helpdesk_tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_active: boolean | null
          name: string
          recurring: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_active?: boolean | null
          name: string
          recurring?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          recurring?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      hr_interviews: {
        Row: {
          candidate_id: string
          created_at: string
          duration_minutes: number | null
          feedback: string | null
          id: string
          interview_date: string
          interview_time: string | null
          interview_type: string | null
          interviewer_name: string
          location: string | null
          meeting_link: string | null
          notes: string | null
          rating: number | null
          recommendation: string | null
          recruitment_id: string
          stage_id: string | null
          status: string | null
          strengths: string | null
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          duration_minutes?: number | null
          feedback?: string | null
          id?: string
          interview_date: string
          interview_time?: string | null
          interview_type?: string | null
          interviewer_name: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          rating?: number | null
          recommendation?: string | null
          recruitment_id: string
          stage_id?: string | null
          status?: string | null
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          duration_minutes?: number | null
          feedback?: string | null
          id?: string
          interview_date?: string
          interview_time?: string | null
          interview_type?: string | null
          interviewer_name?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          rating?: number | null
          recommendation?: string | null
          recruitment_id?: string
          stage_id?: string | null
          status?: string | null
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_allocation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          leave_type_id: string
          requested_days: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          leave_type_id: string
          requested_days?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          leave_type_id?: string
          requested_days?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_allocation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_allocation_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_allocations: {
        Row: {
          allocated_days: number
          carry_forward_days: number | null
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          allocated_days?: number
          carry_forward_days?: number | null
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Update: {
          allocated_days?: number
          carry_forward_days?: number | null
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_allocations_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          employee_id: string
          end_date: string
          half_day_period: string | null
          id: string
          is_half_day: boolean | null
          leave_type_id: string
          reason: string | null
          rejection_reason: string | null
          start_date: string
          status: string
          total_days: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id: string
          reason?: string | null
          rejection_reason?: string | null
          start_date: string
          status?: string
          total_days?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean | null
          leave_type_id?: string
          reason?: string | null
          rejection_reason?: string | null
          start_date?: string
          status?: string
          total_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          carry_forward: boolean | null
          code: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean | null
          is_paid: boolean | null
          max_carry_forward_days: number | null
          max_days_per_year: number | null
          name: string
          requires_approval: boolean | null
          updated_at: string
        }
        Insert: {
          carry_forward?: boolean | null
          code: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_paid?: boolean | null
          max_carry_forward_days?: number | null
          max_days_per_year?: number | null
          name: string
          requires_approval?: boolean | null
          updated_at?: string
        }
        Update: {
          carry_forward?: boolean | null
          code?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_paid?: boolean | null
          max_carry_forward_days?: number | null
          max_days_per_year?: number | null
          name?: string
          requires_approval?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      hr_notifications: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_objectives: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string | null
          id: string
          key_results: Json | null
          objective_type: string
          priority: string
          progress: number
          review_cycle: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          key_results?: Json | null
          objective_type?: string
          priority?: string
          progress?: number
          review_cycle?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string | null
          id?: string
          key_results?: Json | null
          objective_type?: string
          priority?: string
          progress?: number
          review_cycle?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_objectives_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_objectives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_offer_letters: {
        Row: {
          accepted_at: string | null
          candidate_id: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          joining_date: string | null
          negotiation_notes: string | null
          offer_date: string
          offered_department: string | null
          offered_position: string | null
          offered_salary: number
          recruitment_id: string
          rejected_at: string | null
          rejection_reason: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          candidate_id: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          joining_date?: string | null
          negotiation_notes?: string | null
          offer_date?: string
          offered_department?: string | null
          offered_position?: string | null
          offered_salary: number
          recruitment_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          joining_date?: string | null
          negotiation_notes?: string | null
          offer_date?: string
          offered_department?: string | null
          offered_position?: string | null
          offered_salary?: number
          recruitment_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_offer_letters_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offer_letters_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_stage_managers: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          stage_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_stage_managers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_stage_managers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_stages: {
        Row: {
          created_at: string
          id: string
          is_final_stage: boolean | null
          recruitment_id: string | null
          sequence: number
          stage_title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_final_stage?: boolean | null
          recruitment_id?: string | null
          sequence?: number
          stage_title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_final_stage?: boolean | null
          recruitment_id?: string | null
          sequence?: number
          stage_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_stages_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_task_employees: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_task_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_task_employees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_tasks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          stage_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          stage_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          stage_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          created_at: string
          employee_count: number | null
          id: string
          notes: string | null
          pay_period_end: string
          pay_period_start: string
          processed_by: string | null
          run_date: string
          status: string
          title: string
          total_deductions: number | null
          total_gross: number | null
          total_net: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_count?: number | null
          id?: string
          notes?: string | null
          pay_period_end: string
          pay_period_start: string
          processed_by?: string | null
          run_date?: string
          status?: string
          title: string
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_count?: number | null
          id?: string
          notes?: string | null
          pay_period_end?: string
          pay_period_start?: string
          processed_by?: string | null
          run_date?: string
          status?: string
          title?: string
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payslips: {
        Row: {
          created_at: string
          deductions_breakdown: Json | null
          earnings_breakdown: Json | null
          employee_id: string
          gross_salary: number
          id: string
          leave_days: number | null
          net_salary: number
          overtime_hours: number | null
          payment_date: string | null
          payment_reference: string | null
          payroll_run_id: string
          present_days: number | null
          status: string | null
          total_deductions: number
          total_earnings: number
          updated_at: string
          working_days: number | null
        }
        Insert: {
          created_at?: string
          deductions_breakdown?: Json | null
          earnings_breakdown?: Json | null
          employee_id: string
          gross_salary?: number
          id?: string
          leave_days?: number | null
          net_salary?: number
          overtime_hours?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          payroll_run_id: string
          present_days?: number | null
          status?: string | null
          total_deductions?: number
          total_earnings?: number
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          created_at?: string
          deductions_breakdown?: Json | null
          earnings_breakdown?: Json | null
          employee_id?: string
          gross_salary?: number
          id?: string
          leave_days?: number | null
          net_salary?: number
          overtime_hours?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          payroll_run_id?: string
          present_days?: number | null
          status?: string | null
          total_deductions?: number
          total_earnings?: number
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_policies: {
        Row: {
          attachments: string[] | null
          body: string | null
          created_at: string
          id: string
          is_visible_to_all: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: string[] | null
          body?: string | null
          created_at?: string
          id?: string
          is_visible_to_all?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: string[] | null
          body?: string | null
          created_at?: string
          id?: string
          is_visible_to_all?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_recruitment_managers: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          recruitment_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          recruitment_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          recruitment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_recruitment_managers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_recruitment_managers_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_recruitments: {
        Row: {
          closed: boolean | null
          created_at: string
          department_id: string | null
          description: string | null
          end_date: string | null
          experience_level: string | null
          id: string
          is_event_based: boolean | null
          is_published: boolean | null
          job_type: string | null
          location: string | null
          position_id: string | null
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          skill_ids: string[] | null
          start_date: string | null
          title: string
          updated_at: string
          vacancy: number | null
        }
        Insert: {
          closed?: boolean | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          experience_level?: string | null
          id?: string
          is_event_based?: boolean | null
          is_published?: boolean | null
          job_type?: string | null
          location?: string | null
          position_id?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skill_ids?: string[] | null
          start_date?: string | null
          title: string
          updated_at?: string
          vacancy?: number | null
        }
        Update: {
          closed?: boolean | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          experience_level?: string | null
          id?: string
          is_event_based?: boolean | null
          is_published?: boolean | null
          job_type?: string | null
          location?: string | null
          position_id?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skill_ids?: string[] | null
          start_date?: string | null
          title?: string
          updated_at?: string
          vacancy?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_recruitments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_recruitments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rejected_candidates: {
        Row: {
          candidate_id: string
          created_at: string
          description: string | null
          id: string
          reject_reason: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          description?: string | null
          id?: string
          reject_reason?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          description?: string | null
          id?: string
          reject_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_rejected_candidates_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_components: {
        Row: {
          calculation_type: string | null
          code: string
          component_type: string
          created_at: string
          default_amount: number | null
          id: string
          is_active: boolean | null
          is_fixed: boolean | null
          is_taxable: boolean | null
          name: string
          percentage_of: string | null
          updated_at: string
        }
        Insert: {
          calculation_type?: string | null
          code: string
          component_type?: string
          created_at?: string
          default_amount?: number | null
          id?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          is_taxable?: boolean | null
          name: string
          percentage_of?: string | null
          updated_at?: string
        }
        Update: {
          calculation_type?: string | null
          code?: string
          component_type?: string
          created_at?: string
          default_amount?: number | null
          id?: string
          is_active?: boolean | null
          is_fixed?: boolean | null
          is_taxable?: boolean | null
          name?: string
          percentage_of?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hr_shifts: {
        Row: {
          break_duration_minutes: number | null
          created_at: string
          end_time: string
          grace_period_minutes: number | null
          id: string
          is_active: boolean | null
          is_night_shift: boolean | null
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          break_duration_minutes?: number | null
          created_at?: string
          end_time?: string
          grace_period_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_night_shift?: boolean | null
          name: string
          start_time?: string
          updated_at?: string
        }
        Update: {
          break_duration_minutes?: number | null
          created_at?: string
          end_time?: string
          grace_period_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_night_shift?: boolean | null
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_skill_zone_candidates: {
        Row: {
          added_at: string
          candidate_id: string
          id: string
          reason: string | null
          skill_zone_id: string
        }
        Insert: {
          added_at?: string
          candidate_id: string
          id?: string
          reason?: string | null
          skill_zone_id: string
        }
        Update: {
          added_at?: string
          candidate_id?: string
          id?: string
          reason?: string | null
          skill_zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_skill_zone_candidates_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_skill_zone_candidates_skill_zone_id_fkey"
            columns: ["skill_zone_id"]
            isOneToOne: false
            referencedRelation: "hr_skill_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_skill_zones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          updated_at: string
          zone_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          zone_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          zone_name?: string
        }
        Relationships: []
      }
      hr_skills: {
        Row: {
          created_at: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      hr_stage_managers: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          stage_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_stage_managers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_stage_managers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_stage_notes: {
        Row: {
          candidate_id: string
          created_at: string
          description: string
          id: string
          stage_id: string
          updated_by: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          description: string
          id?: string
          stage_id: string
          updated_by?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          description?: string
          id?: string
          stage_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_stage_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_stage_notes_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "hr_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_stage_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_stages: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          recruitment_id: string
          sequence: number
          stage_name: string
          stage_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          recruitment_id: string
          sequence?: number
          stage_name: string
          stage_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          recruitment_id?: string
          sequence?: number
          stage_name?: string
          stage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_stages_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_stages_recruitment_id_fkey"
            columns: ["recruitment_id"]
            isOneToOne: false
            referencedRelation: "hr_recruitments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_survey_questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean | null
          options: Json | null
          question: string
          question_type: string
          sequence: number | null
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question: string
          question_type?: string
          sequence?: number | null
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question?: string
          question_type?: string
          sequence?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_survey_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_survey_responses: {
        Row: {
          answers: Json
          candidate_id: string | null
          id: string
          respondent_email: string | null
          respondent_name: string | null
          submitted_at: string
          template_id: string
        }
        Insert: {
          answers?: Json
          candidate_id?: string | null
          id?: string
          respondent_email?: string | null
          respondent_name?: string | null
          submitted_at?: string
          template_id: string
        }
        Update: {
          answers?: Json
          candidate_id?: string | null
          id?: string
          respondent_email?: string | null
          respondent_name?: string | null
          submitted_at?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_survey_responses_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_survey_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_survey_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_general_template: boolean | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_general_template?: boolean | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_general_template?: boolean | null
          title?: string
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
      investigation_approvals: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          final_resolution: string
          id: string
          investigation_id: string
          rejection_reason: string | null
          submitted_at: string
          submitted_by: string | null
          supporting_documents_urls: string[] | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          final_resolution: string
          id?: string
          investigation_id: string
          rejection_reason?: string | null
          submitted_at?: string
          submitted_by?: string | null
          supporting_documents_urls?: string[] | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          final_resolution?: string
          id?: string
          investigation_id?: string
          rejection_reason?: string | null
          submitted_at?: string
          submitted_by?: string | null
          supporting_documents_urls?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_investigation_approvals_bank_cases"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "bank_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_approvals_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "account_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_steps: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_report_url: string | null
          created_at: string
          id: string
          investigation_id: string
          notes: string | null
          status: string
          step_description: string | null
          step_number: number
          step_title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_report_url?: string | null
          created_at?: string
          id?: string
          investigation_id: string
          notes?: string | null
          status?: string
          step_description?: string | null
          step_number: number
          step_title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_report_url?: string | null
          created_at?: string
          id?: string
          investigation_id?: string
          notes?: string | null
          status?: string
          step_description?: string | null
          step_number?: number
          step_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_steps_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "account_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_updates: {
        Row: {
          attachment_urls: string[] | null
          created_at: string
          created_by: string | null
          id: string
          investigation_id: string
          update_text: string
          update_type: string
        }
        Insert: {
          attachment_urls?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          investigation_id: string
          update_text: string
          update_type?: string
        }
        Update: {
          attachment_urls?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          investigation_id?: string
          update_text?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_updates_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "account_investigations"
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
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          reference_number: string
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          id?: string
          reference_number: string
          status?: string
          total_amount: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          reference_number?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
          payment_method_id: string | null
          payment_status: string | null
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
          payment_method_id?: string | null
          payment_status?: string | null
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
          payment_method_id?: string | null
          payment_status?: string | null
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
          {
            foreignKeyName: "kyc_approval_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "sales_payment_methods"
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
          contact_channel: string | null
          contact_channel_value: string | null
          contact_number: string | null
          created_at: string
          description: string | null
          estimated_order_value: number | null
          follow_up_date: string | null
          follow_up_notes: string | null
          follow_up_time: string | null
          id: string
          lead_type: string | null
          name: string
          price_quoted: number | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_channel?: string | null
          contact_channel_value?: string | null
          contact_number?: string | null
          created_at?: string
          description?: string | null
          estimated_order_value?: number | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_time?: string | null
          id?: string
          lead_type?: string | null
          name: string
          price_quoted?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_channel?: string | null
          contact_channel_value?: string | null
          contact_number?: string | null
          created_at?: string
          description?: string | null
          estimated_order_value?: number | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_time?: string | null
          id?: string
          lead_type?: string | null
          name?: string
          price_quoted?: number | null
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
      legal_actions: {
        Row: {
          action_type: string
          actual_cost: number | null
          case_documents: string[] | null
          case_number: string | null
          court_name: string | null
          created_at: string
          date_filed: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          next_hearing_date: string | null
          notes: string | null
          opposing_lawyer: string | null
          opposing_party: string | null
          our_lawyer: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_type: string
          actual_cost?: number | null
          case_documents?: string[] | null
          case_number?: string | null
          court_name?: string | null
          created_at?: string
          date_filed?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          next_hearing_date?: string | null
          notes?: string | null
          opposing_lawyer?: string | null
          opposing_party?: string | null
          our_lawyer?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          actual_cost?: number | null
          case_documents?: string[] | null
          case_number?: string | null
          court_name?: string | null
          created_at?: string
          date_filed?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          next_hearing_date?: string | null
          notes?: string | null
          opposing_lawyer?: string | null
          opposing_party?: string | null
          our_lawyer?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_communications: {
        Row: {
          attachments: string[] | null
          communication_date: string
          communication_type: string
          contact_person: string | null
          content: string | null
          created_at: string
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string
          legal_action_id: string | null
          party_name: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          attachments?: string[] | null
          communication_date?: string
          communication_type: string
          contact_person?: string | null
          content?: string | null
          created_at?: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          legal_action_id?: string | null
          party_name: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          attachments?: string[] | null
          communication_date?: string
          communication_type?: string
          contact_person?: string | null
          content?: string | null
          created_at?: string
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          legal_action_id?: string | null
          party_name?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_legal_communications_legal_action"
            columns: ["legal_action_id"]
            isOneToOne: false
            referencedRelation: "legal_actions"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "lien_cases_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      lien_updates: {
        Row: {
          attachment_urls: string[] | null
          created_at: string
          created_by: string | null
          id: string
          lien_case_id: string
          update_text: string
        }
        Insert: {
          attachment_urls?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          lien_case_id: string
          update_text: string
        }
        Update: {
          attachment_urls?: string[] | null
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
      p2p_auto_pay_log: {
        Row: {
          action: string
          error_message: string | null
          executed_at: string
          id: string
          minutes_remaining: number | null
          order_number: string
          status: string
        }
        Insert: {
          action?: string
          error_message?: string | null
          executed_at?: string
          id?: string
          minutes_remaining?: number | null
          order_number: string
          status?: string
        }
        Update: {
          action?: string
          error_message?: string | null
          executed_at?: string
          id?: string
          minutes_remaining?: number | null
          order_number?: string
          status?: string
        }
        Relationships: []
      }
      p2p_auto_pay_settings: {
        Row: {
          id: string
          is_active: boolean
          minutes_before_expiry: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          minutes_before_expiry?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          minutes_before_expiry?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      p2p_auto_reply_log: {
        Row: {
          error_message: string | null
          executed_at: string
          id: string
          message_sent: string
          order_number: string
          rule_id: string | null
          status: string
          trigger_event: string
        }
        Insert: {
          error_message?: string | null
          executed_at?: string
          id?: string
          message_sent: string
          order_number: string
          rule_id?: string | null
          status?: string
          trigger_event: string
        }
        Update: {
          error_message?: string | null
          executed_at?: string
          id?: string
          message_sent?: string
          order_number?: string
          rule_id?: string | null
          status?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_auto_reply_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "p2p_auto_reply_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_auto_reply_processed: {
        Row: {
          id: string
          order_number: string
          processed_at: string
          rule_id: string | null
          trigger_event: string
        }
        Insert: {
          id?: string
          order_number: string
          processed_at?: string
          rule_id?: string | null
          trigger_event: string
        }
        Update: {
          id?: string
          order_number?: string
          processed_at?: string
          rule_id?: string | null
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_auto_reply_processed_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "p2p_auto_reply_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_auto_reply_rules: {
        Row: {
          conditions: Json | null
          created_at: string
          created_by: string | null
          delay_seconds: number
          id: string
          is_active: boolean
          message_template: string
          name: string
          priority: number
          trade_type: string | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          priority?: number
          trade_type?: string | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          priority?: number
          trade_type?: string | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      p2p_chat_media: {
        Row: {
          chat_message_id: string
          created_at: string
          expires_at: string | null
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          order_id: string
        }
        Insert: {
          chat_message_id: string
          created_at?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          file_type?: string
          file_url: string
          id?: string
          order_id: string
        }
        Update: {
          chat_message_id?: string
          created_at?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_chat_media_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "p2p_order_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p2p_chat_media_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "p2p_order_records"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_counterparties: {
        Row: {
          binance_nickname: string
          created_at: string
          first_seen_at: string
          flag_reason: string | null
          id: string
          is_flagged: boolean
          last_seen_at: string
          notes: string | null
          payment_identifiers: Json | null
          total_buy_orders: number
          total_sell_orders: number
          total_volume_inr: number
          updated_at: string
        }
        Insert: {
          binance_nickname: string
          created_at?: string
          first_seen_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean
          last_seen_at?: string
          notes?: string | null
          payment_identifiers?: Json | null
          total_buy_orders?: number
          total_sell_orders?: number
          total_volume_inr?: number
          updated_at?: string
        }
        Update: {
          binance_nickname?: string
          created_at?: string
          first_seen_at?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean
          last_seen_at?: string
          notes?: string | null
          payment_identifiers?: Json | null
          total_buy_orders?: number
          total_sell_orders?: number
          total_volume_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      p2p_merchant_schedules: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          name?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      p2p_order_chats: {
        Row: {
          counterparty_id: string | null
          created_at: string
          id: string
          is_quick_reply: boolean
          message_text: string | null
          order_id: string
          quick_reply_template_id: string | null
          sender_type: string
          sent_by_user_id: string | null
        }
        Insert: {
          counterparty_id?: string | null
          created_at?: string
          id?: string
          is_quick_reply?: boolean
          message_text?: string | null
          order_id: string
          quick_reply_template_id?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
        }
        Update: {
          counterparty_id?: string | null
          created_at?: string
          id?: string
          is_quick_reply?: boolean
          message_text?: string | null
          order_id?: string
          quick_reply_template_id?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "p2p_order_chats_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "p2p_counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p2p_order_chats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "p2p_order_records"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_order_records: {
        Row: {
          amount: number
          asset: string
          assigned_operator_id: string | null
          binance_adv_no: string | null
          binance_create_time: number | null
          binance_order_number: string
          cancelled_at: string | null
          commission: number
          completed_at: string | null
          counterparty_id: string | null
          counterparty_nickname: string
          created_at: string
          fiat_unit: string
          id: string
          is_repeat_client: boolean
          order_status: string
          order_type: string | null
          pay_method_name: string | null
          repeat_order_count: number
          synced_at: string
          total_price: number
          trade_type: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount?: number
          asset?: string
          assigned_operator_id?: string | null
          binance_adv_no?: string | null
          binance_create_time?: number | null
          binance_order_number: string
          cancelled_at?: string | null
          commission?: number
          completed_at?: string | null
          counterparty_id?: string | null
          counterparty_nickname: string
          created_at?: string
          fiat_unit?: string
          id?: string
          is_repeat_client?: boolean
          order_status?: string
          order_type?: string | null
          pay_method_name?: string | null
          repeat_order_count?: number
          synced_at?: string
          total_price?: number
          trade_type: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          asset?: string
          assigned_operator_id?: string | null
          binance_adv_no?: string | null
          binance_create_time?: number | null
          binance_order_number?: string
          cancelled_at?: string | null
          commission?: number
          completed_at?: string | null
          counterparty_id?: string | null
          counterparty_nickname?: string
          created_at?: string
          fiat_unit?: string
          id?: string
          is_repeat_client?: boolean
          order_status?: string
          order_type?: string | null
          pay_method_name?: string | null
          repeat_order_count?: number
          synced_at?: string
          total_price?: number
          trade_type?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_order_records_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "p2p_counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_order_types: {
        Row: {
          auto_assign_rules: Json | null
          color: string
          created_at: string
          icon_name: string | null
          id: string
          is_active: boolean
          label: string
          name: string
          notification_escalation: boolean
        }
        Insert: {
          auto_assign_rules?: Json | null
          color?: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label: string
          name: string
          notification_escalation?: boolean
        }
        Update: {
          auto_assign_rules?: Json | null
          color?: string
          created_at?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          notification_escalation?: boolean
        }
        Relationships: []
      }
      p2p_quick_replies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          message_text: string
          order_type: string | null
          sort_order: number
          trade_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          message_text: string
          order_type?: string | null
          sort_order?: number
          trade_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          message_text?: string
          order_type?: string | null
          sort_order?: number
          trade_type?: string | null
        }
        Relationships: []
      }
      p2p_terminal_role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["terminal_permission"]
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["terminal_permission"]
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["terminal_permission"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_terminal_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "p2p_terminal_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      p2p_terminal_roles: {
        Row: {
          created_at: string
          description: string | null
          hierarchy_level: number | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      p2p_terminal_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "p2p_terminal_user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p2p_terminal_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "p2p_terminal_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p2p_terminal_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      payment_gateway_settlement_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          sales_order_id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          sales_order_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          sales_order_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_settlement_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateway_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "payment_gateway_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_settlements: {
        Row: {
          bank_account_id: string
          created_at: string
          id: string
          mdr_amount: number
          mdr_rate: number
          net_amount: number
          settlement_batch_id: string
          settlement_date: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          id?: string
          mdr_amount?: number
          mdr_rate?: number
          net_amount?: number
          settlement_batch_id: string
          settlement_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          id?: string
          mdr_amount?: number
          mdr_rate?: number
          net_amount?: number
          settlement_batch_id?: string
          settlement_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_settlements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateway_settlements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
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
      payment_methods_master: {
        Row: {
          binance_identifier: string
          binance_pay_type: string
          color_accent: string | null
          created_at: string
          icon_label: string | null
          id: string
          is_active: boolean
          method_name: string
          sort_order: number | null
        }
        Insert: {
          binance_identifier: string
          binance_pay_type: string
          color_accent?: string | null
          created_at?: string
          icon_label?: string | null
          id?: string
          is_active?: boolean
          method_name: string
          sort_order?: number | null
        }
        Update: {
          binance_identifier?: string
          binance_pay_type?: string
          color_accent?: string | null
          created_at?: string
          icon_label?: string | null
          id?: string
          is_active?: boolean
          method_name?: string
          sort_order?: number | null
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
      pending_settlements: {
        Row: {
          actual_settlement_date: string | null
          bank_account_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          expected_settlement_date: string | null
          id: string
          mdr_amount: number | null
          mdr_rate: number | null
          notes: string | null
          order_date: string
          order_number: string
          payment_gateway_id: string | null
          payment_method_id: string | null
          sales_order_id: string
          settled_at: string | null
          settled_by: string | null
          settlement_amount: number
          settlement_batch_id: string | null
          settlement_cycle: string | null
          settlement_days: number | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          actual_settlement_date?: string | null
          bank_account_id?: string | null
          client_name: string
          created_at?: string
          created_by?: string | null
          expected_settlement_date?: string | null
          id?: string
          mdr_amount?: number | null
          mdr_rate?: number | null
          notes?: string | null
          order_date: string
          order_number: string
          payment_gateway_id?: string | null
          payment_method_id?: string | null
          sales_order_id: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_amount?: number
          settlement_batch_id?: string | null
          settlement_cycle?: string | null
          settlement_days?: number | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          actual_settlement_date?: string | null
          bank_account_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          expected_settlement_date?: string | null
          id?: string
          mdr_amount?: number | null
          mdr_rate?: number | null
          notes?: string | null
          order_date?: string
          order_number?: string
          payment_gateway_id?: string | null
          payment_method_id?: string | null
          sales_order_id?: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_amount?: number
          settlement_batch_id?: string | null
          settlement_cycle?: string | null
          settlement_days?: number | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pending_settlements_bank_account"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pending_settlements_bank_account"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pending_settlements_payment_method"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "sales_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pending_settlements_sales_order"
            columns: ["sales_order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
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
        }
        Relationships: []
      }
      purchase_action_timings: {
        Row: {
          action_type: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          id: string
          order_id: string
          recorded_at: string
        }
        Insert: {
          action_type: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          order_id: string
          recorded_at?: string
        }
        Update: {
          action_type?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          order_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_action_timings_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_action_timings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string | null
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
        ]
      }
      purchase_order_payment_splits: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          created_by: string | null
          id: string
          purchase_order_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_order_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_payment_splits_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payment_splits_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payment_splits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payment_splits_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_payments: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string
          screenshot_url: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          screenshot_url?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          screenshot_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          message: string
          purchase_order_id: string
          read_at: string | null
          read_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message: string
          purchase_order_id: string
          read_at?: string | null
          read_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string
          purchase_order_id?: string
          read_at?: string | null
          read_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_reviews_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_reviews_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          client_state: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          description: string | null
          failure_proof_url: string | null
          failure_reason: string | null
          fee_amount: number | null
          fee_percentage: number | null
          id: string
          ifsc_code: string | null
          is_off_market: boolean | null
          is_safe_fund: boolean | null
          market_rate_usdt: number | null
          net_amount: number | null
          net_payable_amount: number | null
          notes: string | null
          order_date: string
          order_expires_at: string | null
          order_number: string
          order_status: string | null
          pan_number: string | null
          payment_method_type: string | null
          payment_method_used: string | null
          payment_proof_url: string | null
          price_per_unit: number | null
          product_category: string | null
          product_name: string | null
          purchase_payment_method_id: string | null
          quantity: number | null
          source: string
          status: string
          supplier_name: string
          tax_amount: number | null
          tds_amount: number | null
          tds_applied: boolean | null
          terminal_sync_id: string | null
          timer_end_at: string | null
          total_amount: number
          total_paid: number | null
          updated_at: string
          upi_id: string | null
          wallet_id: string | null
          warehouse_name: string | null
        }
        Insert: {
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          client_state?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failure_proof_url?: string | null
          failure_reason?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          ifsc_code?: string | null
          is_off_market?: boolean | null
          is_safe_fund?: boolean | null
          market_rate_usdt?: number | null
          net_amount?: number | null
          net_payable_amount?: number | null
          notes?: string | null
          order_date: string
          order_expires_at?: string | null
          order_number: string
          order_status?: string | null
          pan_number?: string | null
          payment_method_type?: string | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          price_per_unit?: number | null
          product_category?: string | null
          product_name?: string | null
          purchase_payment_method_id?: string | null
          quantity?: number | null
          source?: string
          status?: string
          supplier_name: string
          tax_amount?: number | null
          tds_amount?: number | null
          tds_applied?: boolean | null
          terminal_sync_id?: string | null
          timer_end_at?: string | null
          total_amount: number
          total_paid?: number | null
          updated_at?: string
          upi_id?: string | null
          wallet_id?: string | null
          warehouse_name?: string | null
        }
        Update: {
          assigned_to?: string | null
          bank_account_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          client_state?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failure_proof_url?: string | null
          failure_reason?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          ifsc_code?: string | null
          is_off_market?: boolean | null
          is_safe_fund?: boolean | null
          market_rate_usdt?: number | null
          net_amount?: number | null
          net_payable_amount?: number | null
          notes?: string | null
          order_date?: string
          order_expires_at?: string | null
          order_number?: string
          order_status?: string | null
          pan_number?: string | null
          payment_method_type?: string | null
          payment_method_used?: string | null
          payment_proof_url?: string | null
          price_per_unit?: number | null
          product_category?: string | null
          product_name?: string | null
          purchase_payment_method_id?: string | null
          quantity?: number | null
          source?: string
          status?: string
          supplier_name?: string
          tax_amount?: number | null
          tds_amount?: number | null
          tds_applied?: boolean | null
          terminal_sync_id?: string | null
          timer_end_at?: string | null
          total_amount?: number
          total_paid?: number | null
          updated_at?: string
          upi_id?: string | null
          wallet_id?: string | null
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
            foreignKeyName: "purchase_orders_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_purchase_payment_method_id_fkey"
            columns: ["purchase_payment_method_id"]
            isOneToOne: false
            referencedRelation: "purchase_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_terminal_sync_id_fkey"
            columns: ["terminal_sync_id"]
            isOneToOne: false
            referencedRelation: "terminal_purchase_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payment_methods: {
        Row: {
          bank_account_name: string | null
          beneficiaries_per_24h: number | null
          created_at: string
          current_usage: number | null
          custom_frequency: string | null
          frequency: string
          id: string
          is_active: boolean
          last_reset: string | null
          max_limit: number
          min_limit: number
          payment_limit: number
          safe_fund: boolean
          safe_funds: boolean
          type: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          bank_account_name?: string | null
          beneficiaries_per_24h?: number | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          max_limit?: number
          min_limit?: number
          payment_limit?: number
          safe_fund?: boolean
          safe_funds?: boolean
          type?: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          bank_account_name?: string | null
          beneficiaries_per_24h?: number | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          max_limit?: number
          min_limit?: number
          payment_limit?: number
          safe_fund?: boolean
          safe_funds?: boolean
          type?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payment_methods_bank_account_name_fkey"
            columns: ["bank_account_name"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["account_name"]
          },
          {
            foreignKeyName: "purchase_payment_methods_bank_account_name_fkey"
            columns: ["bank_account_name"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["account_name"]
          },
        ]
      }
      realized_pnl_events: {
        Row: {
          asset_code: string
          avg_cost_at_sale: number
          conversion_id: string
          cost_out_usdt: number
          created_at: string
          id: string
          proceeds_usdt_gross: number
          proceeds_usdt_net: number
          realized_pnl_usdt: number
          sell_qty: number
          wallet_id: string
        }
        Insert: {
          asset_code: string
          avg_cost_at_sale: number
          conversion_id: string
          cost_out_usdt: number
          created_at?: string
          id?: string
          proceeds_usdt_gross: number
          proceeds_usdt_net: number
          realized_pnl_usdt: number
          sell_qty: number
          wallet_id: string
        }
        Update: {
          asset_code?: string
          avg_cost_at_sale?: number
          conversion_id?: string
          cost_out_usdt?: number
          created_at?: string
          id?: string
          proceeds_usdt_gross?: number
          proceeds_usdt_net?: number
          realized_pnl_usdt?: number
          sell_qty?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "realized_pnl_events_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "erp_product_conversions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realized_pnl_events_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_findings: {
        Row: {
          ai_reasoning: string | null
          asset: string | null
          category: string
          confidence: number | null
          created_at: string
          details: Json | null
          erp_amount: number | null
          erp_ref: string | null
          feedback_at: string | null
          feedback_by: string | null
          feedback_note: string | null
          finding_type: string
          id: string
          scan_id: string
          severity: string
          status: string
          suggested_action: string | null
          terminal_amount: number | null
          terminal_ref: string | null
          variance: number | null
        }
        Insert: {
          ai_reasoning?: string | null
          asset?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          details?: Json | null
          erp_amount?: number | null
          erp_ref?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          feedback_note?: string | null
          finding_type: string
          id?: string
          scan_id: string
          severity?: string
          status?: string
          suggested_action?: string | null
          terminal_amount?: number | null
          terminal_ref?: string | null
          variance?: number | null
        }
        Update: {
          ai_reasoning?: string | null
          asset?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          details?: Json | null
          erp_amount?: number | null
          erp_ref?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          feedback_note?: string | null
          finding_type?: string
          id?: string
          scan_id?: string
          severity?: string
          status?: string
          suggested_action?: string | null
          terminal_amount?: number | null
          terminal_ref?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_scan_log"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_scan_log: {
        Row: {
          ai_summary: string | null
          completed_at: string | null
          critical_count: number | null
          duration_ms: number | null
          error_message: string | null
          findings_count: number | null
          id: string
          info_count: number | null
          review_count: number | null
          scan_scope: string[] | null
          started_at: string
          status: string
          triggered_by: string | null
          warning_count: number | null
        }
        Insert: {
          ai_summary?: string | null
          completed_at?: string | null
          critical_count?: number | null
          duration_ms?: number | null
          error_message?: string | null
          findings_count?: number | null
          id?: string
          info_count?: number | null
          review_count?: number | null
          scan_scope?: string[] | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          warning_count?: number | null
        }
        Update: {
          ai_summary?: string | null
          completed_at?: string | null
          critical_count?: number | null
          duration_ms?: number | null
          error_message?: string | null
          findings_count?: number | null
          id?: string
          info_count?: number | null
          review_count?: number | null
          scan_scope?: string[] | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          warning_count?: number | null
        }
        Relationships: []
      }
      rekyc_requests: {
        Row: {
          aadhar_back_url: string | null
          aadhar_front_url: string | null
          bank_statement_url: string | null
          created_at: string | null
          id: string
          pan_card_url: string | null
          review_decision: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_flag_id: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string | null
          user_notes: string | null
          vkyc_completed: boolean | null
          vkyc_completed_at: string | null
          vkyc_video_url: string | null
        }
        Insert: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          bank_statement_url?: string | null
          created_at?: string | null
          id?: string
          pan_card_url?: string | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flag_id?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_notes?: string | null
          vkyc_completed?: boolean | null
          vkyc_completed_at?: string | null
          vkyc_video_url?: string | null
        }
        Update: {
          aadhar_back_url?: string | null
          aadhar_front_url?: string | null
          bank_statement_url?: string | null
          created_at?: string | null
          id?: string
          pan_card_url?: string | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flag_id?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_notes?: string | null
          vkyc_completed?: boolean | null
          vkyc_completed_at?: string | null
          vkyc_video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rekyc_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rekyc_requests_risk_flag_id_fkey"
            columns: ["risk_flag_id"]
            isOneToOne: false
            referencedRelation: "risk_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rekyc_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reversal_guards: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
        }
        Relationships: []
      }
      risk_detection_logs: {
        Row: {
          details: Json | null
          detected_at: string | null
          detection_type: string
          flagged: boolean | null
          id: string
          risk_score: number | null
          user_id: string | null
        }
        Insert: {
          details?: Json | null
          detected_at?: string | null
          detection_type: string
          flagged?: boolean | null
          id?: string
          risk_score?: number | null
          user_id?: string | null
        }
        Update: {
          details?: Json | null
          detected_at?: string | null
          detection_type?: string
          flagged?: boolean | null
          id?: string
          risk_score?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_detection_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_flags: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          flag_reason: string
          flag_type: string
          flagged_on: string | null
          id: string
          resolved_by: string | null
          resolved_on: string | null
          risk_score: number | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          flag_reason: string
          flag_type: string
          flagged_on?: string | null
          id?: string
          resolved_by?: string | null
          resolved_on?: string | null
          risk_score?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          flag_reason?: string
          flag_type?: string
          flagged_on?: string | null
          id?: string
          resolved_by?: string | null
          resolved_on?: string | null
          risk_score?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_functions: {
        Row: {
          created_at: string
          function_id: string
          id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          function_id: string
          id?: string
          role_id: string
        }
        Update: {
          created_at?: string
          function_id?: string
          id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_functions_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "system_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_functions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
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
        ]
      }
      sales_orders: {
        Row: {
          client_name: string
          client_phone: string | null
          client_state: string | null
          cosmos_alert: boolean | null
          created_at: string
          created_by: string | null
          description: string | null
          fee_amount: number | null
          fee_percentage: number | null
          id: string
          is_off_market: boolean | null
          market_rate_usdt: number | null
          net_amount: number | null
          order_date: string
          order_number: string
          payment_status: string
          platform: string | null
          price_per_unit: number
          product_id: string | null
          quantity: number
          risk_level: string | null
          sale_type: string
          sales_payment_method_id: string | null
          settled_at: string | null
          settlement_batch_id: string | null
          settlement_status: string | null
          source: string | null
          status: string
          terminal_sync_id: string | null
          total_amount: number
          updated_at: string
          usdt_amount: number | null
          wallet_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          client_name: string
          client_phone?: string | null
          client_state?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          is_off_market?: boolean | null
          market_rate_usdt?: number | null
          net_amount?: number | null
          order_date: string
          order_number: string
          payment_status?: string
          platform?: string | null
          price_per_unit: number
          product_id?: string | null
          quantity: number
          risk_level?: string | null
          sale_type?: string
          sales_payment_method_id?: string | null
          settled_at?: string | null
          settlement_batch_id?: string | null
          settlement_status?: string | null
          source?: string | null
          status?: string
          terminal_sync_id?: string | null
          total_amount: number
          updated_at?: string
          usdt_amount?: number | null
          wallet_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          client_name?: string
          client_phone?: string | null
          client_state?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          is_off_market?: boolean | null
          market_rate_usdt?: number | null
          net_amount?: number | null
          order_date?: string
          order_number?: string
          payment_status?: string
          platform?: string | null
          price_per_unit?: number
          product_id?: string | null
          quantity?: number
          risk_level?: string | null
          sale_type?: string
          sales_payment_method_id?: string | null
          settled_at?: string | null
          settlement_batch_id?: string | null
          settlement_status?: string | null
          source?: string | null
          status?: string
          terminal_sync_id?: string | null
          total_amount?: number
          updated_at?: string
          usdt_amount?: number | null
          wallet_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "sales_orders_terminal_sync_id_fkey"
            columns: ["terminal_sync_id"]
            isOneToOne: false
            referencedRelation: "terminal_sales_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_payment_methods: {
        Row: {
          bank_account_id: string | null
          beneficiaries_per_24h: number | null
          created_at: string
          current_usage: number | null
          custom_frequency: string | null
          frequency: string
          id: string
          is_active: boolean
          last_reset: string | null
          max_limit: number
          min_limit: number
          nickname: string | null
          payment_gateway: boolean | null
          payment_limit: number
          risk_category: string
          settlement_cycle: string | null
          settlement_days: number | null
          type: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          bank_account_id?: string | null
          beneficiaries_per_24h?: number | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          max_limit?: number
          min_limit?: number
          nickname?: string | null
          payment_gateway?: boolean | null
          payment_limit?: number
          risk_category: string
          settlement_cycle?: string | null
          settlement_days?: number | null
          type: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          bank_account_id?: string | null
          beneficiaries_per_24h?: number | null
          created_at?: string
          current_usage?: number | null
          custom_frequency?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_reset?: string | null
          max_limit?: number
          min_limit?: number
          nickname?: string | null
          payment_gateway?: boolean | null
          payment_limit?: number
          risk_category?: string
          settlement_cycle?: string | null
          settlement_days?: number | null
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
          {
            foreignKeyName: "sales_payment_methods_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      small_sales_config: {
        Row: {
          currency: string
          id: string
          is_enabled: boolean
          max_amount: number
          min_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency?: string
          id?: string
          is_enabled?: boolean
          max_amount?: number
          min_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: string
          id?: string
          is_enabled?: boolean
          max_amount?: number
          min_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      small_sales_order_map: {
        Row: {
          binance_order_number: string
          created_at: string
          id: string
          order_data: Json | null
          small_sales_sync_id: string
        }
        Insert: {
          binance_order_number: string
          created_at?: string
          id?: string
          order_data?: Json | null
          small_sales_sync_id: string
        }
        Update: {
          binance_order_number?: string
          created_at?: string
          id?: string
          order_data?: Json | null
          small_sales_sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "small_sales_order_map_small_sales_sync_id_fkey"
            columns: ["small_sales_sync_id"]
            isOneToOne: false
            referencedRelation: "small_sales_sync"
            referencedColumns: ["id"]
          },
        ]
      }
      small_sales_sync: {
        Row: {
          asset_code: string
          avg_price: number
          id: string
          order_count: number
          order_numbers: string[]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_order_id: string | null
          sync_batch_id: string
          sync_status: string
          synced_at: string
          synced_by: string | null
          time_window_end: string | null
          time_window_start: string | null
          total_amount: number
          total_fee: number
          total_quantity: number
          wallet_id: string | null
          wallet_name: string | null
        }
        Insert: {
          asset_code: string
          avg_price?: number
          id?: string
          order_count?: number
          order_numbers?: string[]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_id?: string | null
          sync_batch_id: string
          sync_status?: string
          synced_at?: string
          synced_by?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          total_amount?: number
          total_fee?: number
          total_quantity?: number
          wallet_id?: string | null
          wallet_name?: string | null
        }
        Update: {
          asset_code?: string
          avg_price?: number
          id?: string
          order_count?: number
          order_numbers?: string[]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_id?: string | null
          sync_batch_id?: string
          sync_status?: string
          synced_at?: string
          synced_by?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          total_amount?: number
          total_fee?: number
          total_quantity?: number
          wallet_id?: string | null
          wallet_name?: string | null
        }
        Relationships: []
      }
      small_sales_sync_log: {
        Row: {
          entries_created: number
          id: string
          sync_batch_id: string
          sync_completed_at: string | null
          sync_started_at: string
          synced_by: string | null
          time_window_end: string
          time_window_start: string
          total_orders_processed: number
        }
        Insert: {
          entries_created?: number
          id?: string
          sync_batch_id: string
          sync_completed_at?: string | null
          sync_started_at?: string
          synced_by?: string | null
          time_window_end: string
          time_window_start: string
          total_orders_processed?: number
        }
        Update: {
          entries_created?: number
          id?: string
          sync_batch_id?: string
          sync_completed_at?: string | null
          sync_started_at?: string
          synced_by?: string | null
          time_window_end?: string
          time_window_start?: string
          total_orders_processed?: number
        }
        Relationships: []
      }
      spot_trade_history: {
        Row: {
          binance_order_id: string | null
          binance_trade_id: string
          commission: number | null
          commission_asset: string | null
          created_at: string
          error_message: string | null
          executed_by: string | null
          executed_price: number | null
          execution_method: string
          funding_transfer_done: boolean | null
          id: string
          is_buyer: boolean | null
          is_maker: boolean | null
          quantity: number
          quote_quantity: number | null
          side: string
          source: string
          status: string
          symbol: string
          trade_time: number | null
          updated_at: string
        }
        Insert: {
          binance_order_id?: string | null
          binance_trade_id?: string
          commission?: number | null
          commission_asset?: string | null
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          executed_price?: number | null
          execution_method?: string
          funding_transfer_done?: boolean | null
          id?: string
          is_buyer?: boolean | null
          is_maker?: boolean | null
          quantity: number
          quote_quantity?: number | null
          side: string
          source?: string
          status?: string
          symbol: string
          trade_time?: number | null
          updated_at?: string
        }
        Update: {
          binance_order_id?: string | null
          binance_trade_id?: string
          commission?: number | null
          commission_asset?: string | null
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          executed_price?: number | null
          execution_method?: string
          funding_transfer_done?: boolean | null
          id?: string
          is_buyer?: boolean | null
          is_maker?: boolean | null
          quantity?: number
          quote_quantity?: number | null
          side?: string
          source?: string
          status?: string
          symbol?: string
          trade_time?: number | null
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          created_at: string
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
            foreignKeyName: "stock_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subsidiaries: {
        Row: {
          city: string | null
          compliance_notes: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          date_of_incorporation: string | null
          documents: Json | null
          firm_composition: string
          firm_name: string
          gst_number: string | null
          id: string
          pan_number: string | null
          pincode: string | null
          registered_address: string | null
          registration_number: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          compliance_notes?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_incorporation?: string | null
          documents?: Json | null
          firm_composition: string
          firm_name: string
          gst_number?: string | null
          id?: string
          pan_number?: string | null
          pincode?: string | null
          registered_address?: string | null
          registration_number?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          compliance_notes?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_incorporation?: string | null
          documents?: Json | null
          firm_composition?: string
          firm_name?: string
          gst_number?: string | null
          id?: string
          pan_number?: string | null
          pincode?: string | null
          registered_address?: string | null
          registration_number?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_action_logs: {
        Row: {
          action_type: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          module: string
          recorded_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          module: string
          recorded_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          module?: string
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_functions: {
        Row: {
          created_at: string
          description: string | null
          function_key: string
          function_name: string
          id: string
          module: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          function_key: string
          function_name: string
          id?: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string | null
          function_key?: string
          function_name?: string
          id?: string
          module?: string
        }
        Relationships: []
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
          paid_at: string | null
          paid_by: string | null
          pan_number: string
          payment_bank_account_id: string | null
          payment_batch_id: string | null
          payment_reference: string | null
          payment_status: string | null
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
          paid_at?: string | null
          paid_by?: string | null
          pan_number: string
          payment_bank_account_id?: string | null
          payment_batch_id?: string | null
          payment_reference?: string | null
          payment_status?: string | null
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
          paid_at?: string | null
          paid_by?: string | null
          pan_number?: string
          payment_bank_account_id?: string | null
          payment_batch_id?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          purchase_order_id?: string | null
          tds_amount?: number
          tds_certificate_number?: string | null
          tds_rate?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tds_records_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tds_records_payment_bank_account_id_fkey"
            columns: ["payment_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tds_records_payment_bank_account_id_fkey"
            columns: ["payment_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tds_records_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_assignment_audit_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          jurisdiction_layer: string | null
          new_value: Json | null
          notes: string | null
          order_reference: string | null
          performed_by: string
          previous_value: Json | null
          target_user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          jurisdiction_layer?: string | null
          new_value?: Json | null
          notes?: string | null
          order_reference?: string | null
          performed_by: string
          previous_value?: Json | null
          target_user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          jurisdiction_layer?: string | null
          new_value?: Json | null
          notes?: string | null
          order_reference?: string | null
          performed_by?: string
          previous_value?: Json | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_assignment_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_assignment_audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_auto_assignment_config: {
        Row: {
          assignment_strategy: string
          consider_exchange_mapping: boolean
          consider_shift: boolean
          consider_size_range: boolean
          consider_specialization: boolean
          cooldown_minutes: number
          created_at: string
          id: string
          is_enabled: boolean
          max_orders_per_operator: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignment_strategy?: string
          consider_exchange_mapping?: boolean
          consider_shift?: boolean
          consider_size_range?: boolean
          consider_specialization?: boolean
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          max_orders_per_operator?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignment_strategy?: string
          consider_exchange_mapping?: boolean
          consider_shift?: boolean
          consider_size_range?: boolean
          consider_specialization?: boolean
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          max_orders_per_operator?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      terminal_auto_assignment_log: {
        Row: {
          assigned_to: string
          created_at: string
          eligible_count: number
          id: string
          order_number: string
          reason: string | null
          strategy_used: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          eligible_count?: number
          id?: string
          order_number: string
          reason?: string | null
          strategy_used: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          eligible_count?: number
          id?: string
          order_number?: string
          reason?: string | null
          strategy_used?: string
        }
        Relationships: []
      }
      terminal_exchange_accounts: {
        Row: {
          account_identifier: string
          account_name: string
          created_at: string
          exchange_platform: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_identifier: string
          account_name: string
          created_at?: string
          exchange_platform?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_identifier?: string
          account_name?: string
          created_at?: string
          exchange_platform?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      terminal_mpi_snapshots: {
        Row: {
          avg_completion_time_minutes: number | null
          buy_count: number
          created_at: string
          id: string
          idle_time_minutes: number | null
          orders_cancelled: number
          orders_completed: number
          orders_handled: number
          sell_count: number
          snapshot_date: string
          total_volume: number
          user_id: string
        }
        Insert: {
          avg_completion_time_minutes?: number | null
          buy_count?: number
          created_at?: string
          id?: string
          idle_time_minutes?: number | null
          orders_cancelled?: number
          orders_completed?: number
          orders_handled?: number
          sell_count?: number
          snapshot_date?: string
          total_volume?: number
          user_id: string
        }
        Update: {
          avg_completion_time_minutes?: number | null
          buy_count?: number
          created_at?: string
          id?: string
          idle_time_minutes?: number | null
          orders_cancelled?: number
          orders_completed?: number
          orders_handled?: number
          sell_count?: number
          snapshot_date?: string
          total_volume?: number
          user_id?: string
        }
        Relationships: []
      }
      terminal_order_assignments: {
        Row: {
          asset: string | null
          assigned_by: string | null
          assigned_to: string
          assignment_type: string
          created_at: string
          exchange_account_id: string | null
          id: string
          is_active: boolean
          order_number: string
          size_range_id: string | null
          total_price: number | null
          trade_type: string | null
          updated_at: string
        }
        Insert: {
          asset?: string | null
          assigned_by?: string | null
          assigned_to: string
          assignment_type?: string
          created_at?: string
          exchange_account_id?: string | null
          id?: string
          is_active?: boolean
          order_number: string
          size_range_id?: string | null
          total_price?: number | null
          trade_type?: string | null
          updated_at?: string
        }
        Update: {
          asset?: string | null
          assigned_by?: string | null
          assigned_to?: string
          assignment_type?: string
          created_at?: string
          exchange_account_id?: string | null
          id?: string
          is_active?: boolean
          order_number?: string
          size_range_id?: string | null
          total_price?: number | null
          trade_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_order_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_order_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_order_assignments_exchange_account_id_fkey"
            columns: ["exchange_account_id"]
            isOneToOne: false
            referencedRelation: "terminal_exchange_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_order_assignments_size_range_id_fkey"
            columns: ["size_range_id"]
            isOneToOne: false
            referencedRelation: "terminal_order_size_ranges"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_order_size_ranges: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      terminal_purchase_sync: {
        Row: {
          binance_order_number: string
          client_id: string | null
          counterparty_name: string
          created_at: string
          id: string
          order_data: Json
          pan_number: string | null
          purchase_order_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sync_status: string
          synced_at: string
          synced_by: string | null
        }
        Insert: {
          binance_order_number: string
          client_id?: string | null
          counterparty_name: string
          created_at?: string
          id?: string
          order_data?: Json
          pan_number?: string | null
          purchase_order_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sync_status?: string
          synced_at?: string
          synced_by?: string | null
        }
        Update: {
          binance_order_number?: string
          client_id?: string | null
          counterparty_name?: string
          created_at?: string
          id?: string
          order_data?: Json
          pan_number?: string | null
          purchase_order_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sync_status?: string
          synced_at?: string
          synced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminal_purchase_sync_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_purchase_sync_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_sales_sync: {
        Row: {
          binance_order_number: string
          client_id: string | null
          contact_number: string | null
          counterparty_name: string | null
          id: string
          order_data: Json | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_order_id: string | null
          state: string | null
          sync_status: string
          synced_at: string | null
          synced_by: string | null
        }
        Insert: {
          binance_order_number: string
          client_id?: string | null
          contact_number?: string | null
          counterparty_name?: string | null
          id?: string
          order_data?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_id?: string | null
          state?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_by?: string | null
        }
        Update: {
          binance_order_number?: string
          client_id?: string | null
          contact_number?: string | null
          counterparty_name?: string | null
          id?: string
          order_data?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_id?: string | null
          state?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminal_sales_sync_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_sales_sync_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_user_exchange_mappings: {
        Row: {
          created_at: string
          exchange_account_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exchange_account_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exchange_account_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_user_exchange_mappings_exchange_account_id_fkey"
            columns: ["exchange_account_id"]
            isOneToOne: false
            referencedRelation: "terminal_exchange_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_user_exchange_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_user_profiles: {
        Row: {
          automation_included: boolean
          created_at: string
          id: string
          is_active: boolean
          reports_to: string | null
          shift: string | null
          specialization: string
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_included?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          reports_to?: string | null
          shift?: string | null
          specialization?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_included?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          reports_to?: string | null
          shift?: string | null
          specialization?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_user_profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_user_size_range_mappings: {
        Row: {
          created_at: string
          id: string
          size_range_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          size_range_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          size_range_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_user_size_range_mappings_size_range_id_fkey"
            columns: ["size_range_id"]
            isOneToOne: false
            referencedRelation: "terminal_order_size_ranges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_user_size_range_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_user_supervisor_mappings: {
        Row: {
          created_at: string
          id: string
          supervisor_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          supervisor_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          supervisor_id?: string
          user_id?: string
        }
        Relationships: []
      }
      terminal_wallet_links: {
        Row: {
          api_identifier: string
          created_at: string
          fee_treatment: string
          id: string
          platform_source: string
          status: string
          supported_assets: string[]
          updated_at: string
          wallet_id: string
        }
        Insert: {
          api_identifier?: string
          created_at?: string
          fee_treatment?: string
          id?: string
          platform_source?: string
          status?: string
          supported_assets?: string[]
          updated_at?: string
          wallet_id: string
        }
        Update: {
          api_identifier?: string
          created_at?: string
          fee_treatment?: string
          id?: string
          platform_source?: string
          status?: string
          supported_assets?: string[]
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_wallet_links_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
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
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
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
      user_sidebar_preferences: {
        Row: {
          created_at: string
          id: string
          sidebar_order: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sidebar_order?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sidebar_order?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          force_logout_at: string | null
          id: string
          is_payer: boolean
          is_purchase_creator: boolean
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
          force_logout_at?: string | null
          id?: string
          is_payer?: boolean
          is_purchase_creator?: boolean
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
          force_logout_at?: string | null
          id?: string
          is_payer?: boolean
          is_purchase_creator?: boolean
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
      wallet_asset_balances: {
        Row: {
          asset_code: string
          balance: number
          id: string
          total_received: number
          total_sent: number
          updated_at: string
          wallet_id: string
        }
        Insert: {
          asset_code?: string
          balance?: number
          id?: string
          total_received?: number
          total_sent?: number
          updated_at?: string
          wallet_id: string
        }
        Update: {
          asset_code?: string
          balance?: number
          id?: string
          total_received?: number
          total_sent?: number
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_asset_balances_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_asset_positions: {
        Row: {
          asset_code: string
          avg_cost_usdt: number
          cost_pool_usdt: number
          id: string
          qty_on_hand: number
          updated_at: string
          wallet_id: string
        }
        Insert: {
          asset_code: string
          avg_cost_usdt?: number
          cost_pool_usdt?: number
          id?: string
          qty_on_hand?: number
          updated_at?: string
          wallet_id: string
        }
        Update: {
          asset_code?: string
          avg_cost_usdt?: number
          cost_pool_usdt?: number
          id?: string
          qty_on_hand?: number
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_asset_positions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_fee_deductions: {
        Row: {
          average_buying_price: number | null
          created_at: string
          fee_amount: number
          fee_inr_value_at_buying_price: number | null
          fee_percentage: number
          fee_usdt_amount: number | null
          gross_amount: number
          id: string
          net_amount: number
          order_id: string
          order_number: string
          order_type: string
          usdt_rate_used: number | null
          wallet_id: string | null
        }
        Insert: {
          average_buying_price?: number | null
          created_at?: string
          fee_amount?: number
          fee_inr_value_at_buying_price?: number | null
          fee_percentage?: number
          fee_usdt_amount?: number | null
          gross_amount: number
          id?: string
          net_amount: number
          order_id: string
          order_number: string
          order_type: string
          usdt_rate_used?: number | null
          wallet_id?: string | null
        }
        Update: {
          average_buying_price?: number | null
          created_at?: string
          fee_amount?: number
          fee_inr_value_at_buying_price?: number | null
          fee_percentage?: number
          fee_usdt_amount?: number | null
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: string
          order_number?: string
          order_type?: string
          usdt_rate_used?: number | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_fee_deductions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          asset_code: string
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          asset_code?: string
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          asset_code?: string
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          chain_name: string | null
          created_at: string
          current_balance: number
          fee_percentage: number | null
          id: string
          is_active: boolean
          is_fee_enabled: boolean | null
          total_received: number
          total_sent: number
          updated_at: string
          wallet_address: string
          wallet_name: string
          wallet_type: string | null
        }
        Insert: {
          chain_name?: string | null
          created_at?: string
          current_balance?: number
          fee_percentage?: number | null
          id?: string
          is_active?: boolean
          is_fee_enabled?: boolean | null
          total_received?: number
          total_sent?: number
          updated_at?: string
          wallet_address: string
          wallet_name: string
          wallet_type?: string | null
        }
        Update: {
          chain_name?: string | null
          created_at?: string
          current_balance?: number
          fee_percentage?: number | null
          id?: string
          is_active?: boolean
          is_fee_enabled?: boolean | null
          total_received?: number
          total_sent?: number
          updated_at?: string
          wallet_address?: string
          wallet_name?: string
          wallet_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bank_accounts_with_balance: {
        Row: {
          account_name: string | null
          account_number: string | null
          account_status: string | null
          account_type: string | null
          balance: number | null
          bank_account_holder_name: string | null
          bank_name: string | null
          branch: string | null
          computed_balance: number | null
          created_at: string | null
          id: string | null
          IFSC: string | null
          lien_amount: number | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_reset_user_password:
        | {
            Args: { p_new_password: string; p_user_id: string }
            Returns: boolean
          }
        | {
            Args: { new_password: string; user_email: string }
            Returns: boolean
          }
      approve_product_conversion: {
        Args: { p_approved_by: string; p_conversion_id: string }
        Returns: Json
      }
      approve_registration: {
        Args: {
          p_approved_by?: string
          p_registration_id: string
          p_role_id: string
        }
        Returns: string
      }
      assign_terminal_order: {
        Args: {
          p_asset?: string
          p_assigned_by: string
          p_assigned_to: string
          p_assignment_type?: string
          p_order_number: string
          p_total_price?: number
          p_trade_type?: string
        }
        Returns: string
      }
      assign_terminal_role: {
        Args: { p_assigned_by?: string; p_role_id: string; p_user_id: string }
        Returns: undefined
      }
      bank_account_has_transactions: {
        Args: { account_id_param: string }
        Returns: boolean
      }
      calculate_user_risk_score: {
        Args: { user_uuid: string }
        Returns: number
      }
      complete_sales_order_with_banking: {
        Args: {
          p_bank_account_id: string
          p_client_name: string
          p_description?: string
          p_order_date?: string
          p_order_number: string
          p_phone?: string
          p_platform?: string
          p_price_per_unit: number
          p_product_id?: string
          p_quantity: number
          p_total_amount: number
        }
        Returns: string
      }
      create_manual_purchase_bypass: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_status: string
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_bypass_locks: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_complete: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_complete_v2: {
        Args: {
          p_bank_account_id: string
          p_contact_number?: string
          p_created_by?: string
          p_credit_wallet_id?: string
          p_description?: string
          p_fee_percentage?: number
          p_is_off_market?: boolean
          p_order_date: string
          p_order_number: string
          p_pan_number?: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_tds_option?: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: Json
      }
      create_manual_purchase_order: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_status: string
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_secure: {
        Args: {
          p_bank_account_id: string
          p_contact_number?: string
          p_credit_wallet_id?: string
          p_description?: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_simple: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_status: string
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_stock_only: {
        Args: {
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_with_fees: {
        Args: {
          p_bank_account_id: string
          p_contact_number?: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_platform_fees?: number
          p_platform_fees_wallet_id?: string
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_manual_purchase_with_split_payments: {
        Args: {
          p_contact_number?: string
          p_created_by?: string
          p_credit_wallet_id?: string
          p_description?: string
          p_fee_percentage?: number
          p_is_off_market?: boolean
          p_order_date: string
          p_order_number: string
          p_pan_number?: string
          p_payment_splits?: Json
          p_product_id: string
          p_quantity: number
          p_supplier_name: string
          p_tds_option?: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: Json
      }
      create_manual_purchase_working: {
        Args: {
          p_bank_account_id: string
          p_contact_number: string
          p_credit_wallet_id?: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_product_id: string
          p_quantity: number
          p_status: string
          p_supplier_name: string
          p_total_amount: number
          p_unit_price: number
        }
        Returns: string
      }
      create_role_with_permissions: {
        Args: {
          permissions: string[]
          role_description: string
          role_name: string
        }
        Returns: string
      }
      create_user_with_password: {
        Args: {
          _email: string
          _first_name?: string
          _last_name?: string
          _password: string
          _phone?: string
          _username: string
        }
        Returns: string
      }
      delete_contra_entry: {
        Args: { p_transfer_out_id: string }
        Returns: undefined
      }
      delete_purchase_order_with_reversal: {
        Args: { order_id: string }
        Returns: Json
      }
      delete_sales_order_with_reversal: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      delete_user_with_cleanup: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      delete_wallet_transaction_with_reversal: {
        Args: { p_deleted_by?: string; p_transaction_id: string }
        Returns: Json
      }
      generate_employee_id: {
        Args: { dept: string; designation: string }
        Returns: string
      }
      generate_off_market_purchase_order_number: {
        Args: never
        Returns: string
      }
      generate_off_market_sales_order_number: { Args: never; Returns: string }
      get_active_users: {
        Args: never
        Returns: {
          email: string
          first_name: string
          id: string
          last_activity: string
          last_name: string
          status: string
          username: string
        }[]
      }
      get_default_risk_level: { Args: never; Returns: string }
      get_terminal_operator_workloads: {
        Args: never
        Returns: {
          active_order_count: number
          user_id: string
        }[]
      }
      get_terminal_permissions: {
        Args: { p_user_id: string }
        Returns: {
          permission: string
        }[]
      }
      get_terminal_subordinates: {
        Args: { p_user_id: string }
        Returns: {
          depth: number
          user_id: string
        }[]
      }
      get_terminal_user_roles: {
        Args: { p_user_id: string }
        Returns: {
          role_description: string
          role_id: string
          role_name: string
        }[]
      }
      get_terminal_visible_user_ids: {
        Args: { p_user_id: string }
        Returns: {
          visible_user_id: string
        }[]
      }
      get_transactions_with_closing_balance: {
        Args: {
          p_bank_account_id?: string
          p_limit?: number
          p_offset?: number
          p_transaction_type?: string
        }
        Returns: {
          account_name: string
          amount: number
          bank_account_id: string
          bank_name: string
          category: string
          closing_balance: number
          created_at: string
          description: string
          id: string
          reference_number: string
          related_account_name: string
          total_count: number
          transaction_date: string
          transaction_type: string
        }[]
      }
      get_user_permissions:
        | {
            Args: { user_uuid: string }
            Returns: {
              permission: Database["public"]["Enums"]["app_permission"]
            }[]
          }
        | {
            Args: { username: string }
            Returns: {
              permission: Database["public"]["Enums"]["app_permission"]
            }[]
          }
      get_user_role_functions: {
        Args: { p_user_id: string }
        Returns: {
          function_key: string
          function_name: string
          module: string
        }[]
      }
      get_user_with_roles: {
        Args: { user_uuid: string }
        Returns: {
          created_at: string
          email: string
          first_name: string
          last_name: string
          phone: string
          roles: Json
          status: string
          user_id: string
          username: string
        }[]
      }
      handle_sales_order_payment_method_change: {
        Args: {
          p_new_payment_method_id: string
          p_old_payment_method_id: string
          p_order_id: string
          p_total_amount: number
        }
        Returns: Json
      }
      handle_sales_order_quantity_change: {
        Args: {
          p_new_quantity: number
          p_old_quantity: number
          p_order_id: string
          p_wallet_id: string
        }
        Returns: boolean
      }
      handle_sales_order_wallet_change: {
        Args: {
          p_new_wallet_id: string
          p_old_wallet_id: string
          p_order_id: string
          p_quantity: number
        }
        Returns: boolean
      }
      list_terminal_roles: {
        Args: never
        Returns: {
          description: string
          id: string
          is_default: boolean
          name: string
          permissions: string[]
        }[]
      }
      maybe_delete_orphan_client: {
        Args: { client_name_param: string }
        Returns: undefined
      }
      preview_off_market_purchase_order_number: { Args: never; Returns: string }
      preview_off_market_sales_order_number: { Args: never; Returns: string }
      process_payment_gateway_settlement: {
        Args: {
          p_bank_account_id: string
          p_created_by?: string
          p_mdr_amount?: number
          p_pending_settlement_ids: string[]
        }
        Returns: Json
      }
      process_platform_fee_deduction: {
        Args: {
          p_fee_amount: number
          p_order_id: string
          p_order_number?: string
          p_order_type: string
          p_wallet_id: string
        }
        Returns: Json
      }
      process_sales_order_wallet_deduction: {
        Args: {
          p_asset_code?: string
          sales_order_id: string
          usdt_amount: number
          wallet_id: string
        }
        Returns: boolean
      }
      recalculate_wallet_balance: {
        Args: { wallet_id_param: string }
        Returns: undefined
      }
      reconcile_purchase_order_edit:
        | {
            Args: {
              p_fee_percentage?: number
              p_is_off_market?: boolean
              p_new_bank_account_id: string
              p_new_net_payable: number
              p_new_quantity: number
              p_new_total_amount: number
              p_new_wallet_id: string
              p_old_bank_account_id: string
              p_old_net_payable: number
              p_old_quantity: number
              p_old_total_amount: number
              p_old_wallet_id: string
              p_order_date: string
              p_order_id: string
              p_order_number: string
              p_supplier_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_fee_percentage?: number
              p_is_off_market?: boolean
              p_new_bank_account_id: string
              p_new_net_payable: number
              p_new_quantity: number
              p_new_wallet_id: string
              p_old_bank_account_id: string
              p_old_net_payable: number
              p_old_quantity: number
              p_old_wallet_id: string
              p_order_date: string
              p_order_id: string
              p_order_number: string
              p_product_code?: string
              p_supplier_name: string
            }
            Returns: Json
          }
      reconcile_sales_order_edit:
        | {
            Args: {
              p_client_name: string
              p_fee_percentage?: number
              p_is_off_market?: boolean
              p_new_quantity: number
              p_new_total_amount: number
              p_new_wallet_id: string
              p_old_quantity: number
              p_old_total_amount: number
              p_old_wallet_id: string
              p_order_date: string
              p_order_id: string
              p_order_number: string
              p_payment_method_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_client_name: string
              p_fee_percentage?: number
              p_is_off_market?: boolean
              p_new_quantity: number
              p_new_total_amount: number
              p_new_wallet_id: string
              p_old_quantity: number
              p_old_total_amount: number
              p_old_wallet_id: string
              p_order_date: string
              p_order_id: string
              p_order_number: string
              p_payment_method_id: string
              p_product_code?: string
            }
            Returns: Json
          }
      register_user_request: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_password: string
          p_phone: string
          p_username: string
        }
        Returns: string
      }
      reject_product_conversion: {
        Args: {
          p_conversion_id: string
          p_reason?: string
          p_rejected_by: string
        }
        Returns: Json
      }
      reject_registration: {
        Args: {
          p_reason?: string
          p_registration_id: string
          p_rejected_by?: string
        }
        Returns: boolean
      }
      remove_terminal_role: {
        Args: { p_role_id: string; p_user_id: string }
        Returns: undefined
      }
      reverse_payment_gateway_settlement: {
        Args: { p_settlement_id: string }
        Returns: Json
      }
      save_terminal_role: {
        Args: {
          p_description?: string
          p_name?: string
          p_permissions?: string[]
          p_role_id?: string
        }
        Returns: string
      }
      sync_existing_payment_methods_with_bank_status: {
        Args: never
        Returns: undefined
      }
      sync_p2p_order: {
        Args: {
          p_adv_no: string
          p_amount: number
          p_asset: string
          p_commission: number
          p_create_time: number
          p_fiat: string
          p_nickname: string
          p_order_number: string
          p_pay_method: string
          p_status: string
          p_total_price: number
          p_trade_type: string
          p_unit_price: number
        }
        Returns: Json
      }
      sync_usdt_stock: { Args: never; Returns: undefined }
      unassign_terminal_order: {
        Args: { p_order_number: string; p_performed_by: string }
        Returns: undefined
      }
      update_risk_flag_status: {
        Args: {
          admin_id?: string
          flag_id: string
          new_status: string
          notes?: string
        }
        Returns: boolean
      }
      update_role_permissions: {
        Args: {
          p_permissions: string[]
          p_role_description: string
          p_role_id: string
          p_role_name: string
        }
        Returns: boolean
      }
      update_settlement_bypass_all_triggers: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_settlement_raw: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: Json
      }
      update_settlement_status_bypass_triggers: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_settlement_status_direct: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_settlement_status_only: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_settlement_status_safe: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_settlement_status_simple: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: {
          error_message: string
          success: boolean
          updated_id: string
        }[]
      }
      update_user_activity: { Args: { user_uuid: string }; Returns: undefined }
      update_user_password: {
        Args: { new_password: string; user_id: string }
        Returns: undefined
      }
      update_user_profile: {
        Args: {
          p_avatar_url?: string
          p_first_name?: string
          p_last_name?: string
          p_user_id: string
          p_username?: string
        }
        Returns: Json
      }
      upsert_p2p_counterparty: {
        Args: { p_nickname: string; p_trade_type: string; p_volume: number }
        Returns: string
      }
      user_has_function: {
        Args: { _function_key: string; _user_id: string }
        Returns: boolean
      }
      user_has_permission:
        | {
            Args: {
              check_permission: Database["public"]["Enums"]["app_permission"]
              user_uuid: string
            }
            Returns: boolean
          }
        | {
            Args: {
              check_permission: Database["public"]["Enums"]["app_permission"]
              username: string
            }
            Returns: boolean
          }
      validate_role_purchase_functions: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      validate_user_credentials: {
        Args: { input_password: string; input_username: string }
        Returns: {
          email: string
          first_name: string
          is_valid: boolean
          last_name: string
          status: string
          user_id: string
          username: string
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
        | "ems_view"
        | "ems_manage"
        | "stock_conversion_create"
        | "stock_conversion_approve"
      kyc_approval_status: "PENDING" | "APPROVED" | "REJECTED" | "QUERY"
      query_type: "VKYC_REQUIRED" | "MANUAL_QUERY"
      terminal_permission:
        | "terminal_dashboard_view"
        | "terminal_ads_view"
        | "terminal_ads_manage"
        | "terminal_orders_view"
        | "terminal_orders_manage"
        | "terminal_orders_actions"
        | "terminal_automation_view"
        | "terminal_automation_manage"
        | "terminal_analytics_view"
        | "terminal_settings_view"
        | "terminal_settings_manage"
        | "terminal_users_view"
        | "terminal_users_manage"
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
        "ems_view",
        "ems_manage",
        "stock_conversion_create",
        "stock_conversion_approve",
      ],
      kyc_approval_status: ["PENDING", "APPROVED", "REJECTED", "QUERY"],
      query_type: ["VKYC_REQUIRED", "MANUAL_QUERY"],
      terminal_permission: [
        "terminal_dashboard_view",
        "terminal_ads_view",
        "terminal_ads_manage",
        "terminal_orders_view",
        "terminal_orders_manage",
        "terminal_orders_actions",
        "terminal_automation_view",
        "terminal_automation_manage",
        "terminal_analytics_view",
        "terminal_settings_view",
        "terminal_settings_manage",
        "terminal_users_view",
        "terminal_users_manage",
      ],
    },
  },
} as const
