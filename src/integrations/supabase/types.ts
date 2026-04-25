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
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_type: string
          ad_details?: Json | null
          adv_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_type?: string
          ad_details?: Json | null
          adv_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      ad_automation_exclusions: {
        Row: {
          adv_no: string
          excluded_at: string | null
          id: string
          reason: string | null
        }
        Insert: {
          adv_no: string
          excluded_at?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          adv_no?: string
          excluded_at?: string | null
          id?: string
          reason?: string | null
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
      ad_pricing_effectiveness_snapshots: {
        Row: {
          avg_applied_price: number | null
          avg_competitor_price: number | null
          avg_spread: number | null
          created_at: string | null
          id: string
          orders_completed: number
          orders_received: number
          rule_id: string
          snapshot_date: string
          total_price_updates: number
          total_volume: number
        }
        Insert: {
          avg_applied_price?: number | null
          avg_competitor_price?: number | null
          avg_spread?: number | null
          created_at?: string | null
          id?: string
          orders_completed?: number
          orders_received?: number
          rule_id: string
          snapshot_date: string
          total_price_updates?: number
          total_volume?: number
        }
        Update: {
          avg_applied_price?: number | null
          avg_competitor_price?: number | null
          avg_spread?: number | null
          created_at?: string | null
          id?: string
          orders_completed?: number
          orders_received?: number
          rule_id?: string
          snapshot_date?: string
          total_price_updates?: number
          total_volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_pricing_effectiveness_snapshots_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ad_pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_pricing_engine_state: {
        Row: {
          circuit_status: string
          consecutive_failures: number
          cooldown_minutes: number
          failure_threshold: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          updated_at: string | null
        }
        Insert: {
          circuit_status?: string
          consecutive_failures?: number
          cooldown_minutes?: number
          failure_threshold?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          updated_at?: string | null
        }
        Update: {
          circuit_status?: string
          consecutive_failures?: number
          cooldown_minutes?: number
          failure_threshold?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ad_pricing_logs: {
        Row: {
          ad_number: string | null
          applied_price: number | null
          applied_ratio: number | null
          asset: string | null
          calculated_price: number | null
          calculated_ratio: number | null
          competitor_merchant: string | null
          competitor_price: number | null
          created_at: string | null
          deviation_from_market_pct: number | null
          error_message: string | null
          id: string
          market_reference_price: number | null
          rule_id: string | null
          skipped_reason: string | null
          status: string
          was_capped: boolean | null
          was_rate_limited: boolean | null
        }
        Insert: {
          ad_number?: string | null
          applied_price?: number | null
          applied_ratio?: number | null
          asset?: string | null
          calculated_price?: number | null
          calculated_ratio?: number | null
          competitor_merchant?: string | null
          competitor_price?: number | null
          created_at?: string | null
          deviation_from_market_pct?: number | null
          error_message?: string | null
          id?: string
          market_reference_price?: number | null
          rule_id?: string | null
          skipped_reason?: string | null
          status?: string
          was_capped?: boolean | null
          was_rate_limited?: boolean | null
        }
        Update: {
          ad_number?: string | null
          applied_price?: number | null
          applied_ratio?: number | null
          asset?: string | null
          calculated_price?: number | null
          calculated_ratio?: number | null
          competitor_merchant?: string | null
          competitor_price?: number | null
          created_at?: string | null
          deviation_from_market_pct?: number | null
          error_message?: string | null
          id?: string
          market_reference_price?: number | null
          rule_id?: string | null
          skipped_reason?: string | null
          status?: string
          was_capped?: boolean | null
          was_rate_limited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_pricing_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ad_pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_pricing_rules: {
        Row: {
          active_hours_end: string | null
          active_hours_start: string | null
          ad_numbers: string[]
          asset: string
          asset_config: Json | null
          assets: string[] | null
          auto_pause_after_deviations: number | null
          check_interval_seconds: number | null
          consecutive_deviations: number | null
          consecutive_errors: number | null
          created_at: string | null
          fallback_merchants: string[] | null
          fiat: string
          id: string
          is_active: boolean
          is_dry_run: boolean
          last_applied_price: number | null
          last_applied_ratio: number | null
          last_checked_at: string | null
          last_competitor_price: number | null
          last_error: string | null
          last_manual_edit_at: string | null
          last_matched_merchant: string | null
          manual_override_cooldown_minutes: number | null
          max_ceiling: number | null
          max_deviation_from_market_pct: number | null
          max_price_change_per_cycle: number | null
          max_ratio_ceiling: number | null
          max_ratio_change_per_cycle: number | null
          min_floor: number | null
          min_ratio_floor: number | null
          name: string
          offset_amount: number | null
          offset_direction: string
          offset_pct: number | null
          only_counter_when_online: boolean | null
          pause_if_no_merchant_found: boolean | null
          price_type: string
          resting_price: number | null
          resting_ratio: number | null
          target_merchant: string
          trade_type: string
          updated_at: string | null
        }
        Insert: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          ad_numbers?: string[]
          asset?: string
          asset_config?: Json | null
          assets?: string[] | null
          auto_pause_after_deviations?: number | null
          check_interval_seconds?: number | null
          consecutive_deviations?: number | null
          consecutive_errors?: number | null
          created_at?: string | null
          fallback_merchants?: string[] | null
          fiat?: string
          id?: string
          is_active?: boolean
          is_dry_run?: boolean
          last_applied_price?: number | null
          last_applied_ratio?: number | null
          last_checked_at?: string | null
          last_competitor_price?: number | null
          last_error?: string | null
          last_manual_edit_at?: string | null
          last_matched_merchant?: string | null
          manual_override_cooldown_minutes?: number | null
          max_ceiling?: number | null
          max_deviation_from_market_pct?: number | null
          max_price_change_per_cycle?: number | null
          max_ratio_ceiling?: number | null
          max_ratio_change_per_cycle?: number | null
          min_floor?: number | null
          min_ratio_floor?: number | null
          name: string
          offset_amount?: number | null
          offset_direction?: string
          offset_pct?: number | null
          only_counter_when_online?: boolean | null
          pause_if_no_merchant_found?: boolean | null
          price_type: string
          resting_price?: number | null
          resting_ratio?: number | null
          target_merchant: string
          trade_type: string
          updated_at?: string | null
        }
        Update: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          ad_numbers?: string[]
          asset?: string
          asset_config?: Json | null
          assets?: string[] | null
          auto_pause_after_deviations?: number | null
          check_interval_seconds?: number | null
          consecutive_deviations?: number | null
          consecutive_errors?: number | null
          created_at?: string | null
          fallback_merchants?: string[] | null
          fiat?: string
          id?: string
          is_active?: boolean
          is_dry_run?: boolean
          last_applied_price?: number | null
          last_applied_ratio?: number | null
          last_checked_at?: string | null
          last_competitor_price?: number | null
          last_error?: string | null
          last_manual_edit_at?: string | null
          last_matched_merchant?: string | null
          manual_override_cooldown_minutes?: number | null
          max_ceiling?: number | null
          max_deviation_from_market_pct?: number | null
          max_price_change_per_cycle?: number | null
          max_ratio_ceiling?: number | null
          max_ratio_change_per_cycle?: number | null
          min_floor?: number | null
          min_ratio_floor?: number | null
          name?: string
          offset_amount?: number | null
          offset_direction?: string
          offset_pct?: number | null
          only_counter_when_online?: boolean | null
          pause_if_no_merchant_found?: boolean | null
          price_type?: string
          resting_price?: number | null
          resting_ratio?: number | null
          target_merchant?: string
          trade_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ad_rest_timer: {
        Row: {
          created_at: string
          deactivated_ad_nos: string[] | null
          deactivated_ad_statuses: Json | null
          duration_minutes: number
          id: string
          is_active: boolean
          started_at: string
          started_by: string | null
        }
        Insert: {
          created_at?: string
          deactivated_ad_nos?: string[] | null
          deactivated_ad_statuses?: Json | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          started_at?: string
          started_by?: string | null
        }
        Update: {
          created_at?: string
          deactivated_ad_nos?: string[] | null
          deactivated_ad_statuses?: Json | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          started_at?: string
          started_by?: string | null
        }
        Relationships: []
      }
      adjustment_posting_audit: {
        Row: {
          amount: number
          asset_code: string | null
          description: string | null
          id: string
          notes: string | null
          posted_at: string
          posted_by: string | null
          reference_type: string
          transaction_type: string
          wallet_id: string
          wallet_name: string | null
          wallet_transaction_id: string | null
        }
        Insert: {
          amount: number
          asset_code?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          posted_at?: string
          posted_by?: string | null
          reference_type: string
          transaction_type: string
          wallet_id: string
          wallet_name?: string | null
          wallet_transaction_id?: string | null
        }
        Update: {
          amount?: number
          asset_code?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          posted_at?: string
          posted_by?: string | null
          reference_type?: string
          transaction_type?: string
          wallet_id?: string
          wallet_name?: string | null
          wallet_transaction_id?: string | null
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
      bank_bulk_formats: {
        Row: {
          bank_display_name: string
          bank_key: string
          columns: Json
          created_at: string
          default_values: Json | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          bank_display_name: string
          bank_key: string
          columns: Json
          created_at?: string
          default_values?: Json | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          bank_display_name?: string
          bank_key?: string
          columns?: Json
          created_at?: string
          default_values?: Json | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
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
      bank_ledger_tamper_log: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          attempted_role: string | null
          blocked: boolean
          id: string
          new_payload: Json | null
          old_payload: Json | null
          operation: string
          reason: string | null
          target_tx_id: string | null
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          attempted_role?: string | null
          blocked?: boolean
          id?: string
          new_payload?: Json | null
          old_payload?: Json | null
          operation: string
          reason?: string | null
          target_tx_id?: string | null
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          attempted_role?: string | null
          blocked?: boolean
          id?: string
          new_payload?: Json | null
          old_payload?: Json | null
          operation?: string
          reason?: string | null
          target_tx_id?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          bank_account_id: string
          bill_url: string | null
          category: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_reversed: boolean
          prev_hash: string | null
          reference_number: string | null
          related_account_name: string | null
          related_transaction_id: string | null
          reversal_reason: string | null
          reverses_transaction_id: string | null
          row_hash: string | null
          sequence_no: number | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          bank_account_id: string
          bill_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_reversed?: boolean
          prev_hash?: string | null
          reference_number?: string | null
          related_account_name?: string | null
          related_transaction_id?: string | null
          reversal_reason?: string | null
          reverses_transaction_id?: string | null
          row_hash?: string | null
          sequence_no?: number | null
          transaction_date: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          bank_account_id?: string
          bill_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_reversed?: boolean
          prev_hash?: string | null
          reference_number?: string | null
          related_account_name?: string | null
          related_transaction_id?: string | null
          reversal_reason?: string | null
          reverses_transaction_id?: string | null
          row_hash?: string | null
          sequence_no?: number | null
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
          {
            foreignKeyName: "bank_transactions_reverses_transaction_id_fkey"
            columns: ["reverses_transaction_id"]
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
      batch_usdt_valuations: {
        Row: {
          aggregated_usdt_qty: number
          asset_code: string
          batch_id: string
          batch_type: string
          created_at: string | null
          created_by: string | null
          effective_usdt_rate: number | null
          id: string
          market_rate_usdt: number
          order_id: string | null
          price_snapshot_id: string | null
          strategy: string
          total_asset_qty: number
          total_inr_value: number
        }
        Insert: {
          aggregated_usdt_qty?: number
          asset_code: string
          batch_id: string
          batch_type: string
          created_at?: string | null
          created_by?: string | null
          effective_usdt_rate?: number | null
          id?: string
          market_rate_usdt: number
          order_id?: string | null
          price_snapshot_id?: string | null
          strategy?: string
          total_asset_qty?: number
          total_inr_value?: number
        }
        Update: {
          aggregated_usdt_qty?: number
          asset_code?: string
          batch_id?: string
          batch_type?: string
          created_at?: string | null
          created_by?: string | null
          effective_usdt_rate?: number | null
          id?: string
          market_rate_usdt?: number
          order_id?: string | null
          price_snapshot_id?: string | null
          strategy?: string
          total_asset_qty?: number
          total_inr_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "batch_usdt_valuations_price_snapshot_id_fkey"
            columns: ["price_snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_bank_additions: {
        Row: {
          added_at: string
          added_by: string | null
          bank_account_id: string
          beneficiary_id: string
          id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          bank_account_id: string
          beneficiary_id: string
          id?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          bank_account_id?: string
          beneficiary_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_bank_additions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_bank_additions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_bank_additions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiary_records"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiary_records: {
        Row: {
          account_holder_name: string | null
          account_number: string
          account_opening_branch: string | null
          account_type: string | null
          bank_name: string | null
          client_name: string | null
          created_at: string
          exported_at: string | null
          first_seen_at: string
          id: string
          ifsc_code: string | null
          last_seen_at: string
          occurrence_count: number
          source_order_number: string | null
          updated_at: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number: string
          account_opening_branch?: string | null
          account_type?: string | null
          bank_name?: string | null
          client_name?: string | null
          created_at?: string
          exported_at?: string | null
          first_seen_at?: string
          id?: string
          ifsc_code?: string | null
          last_seen_at?: string
          occurrence_count?: number
          source_order_number?: string | null
          updated_at?: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string
          account_opening_branch?: string | null
          account_type?: string | null
          bank_name?: string | null
          client_name?: string | null
          created_at?: string
          exported_at?: string | null
          first_seen_at?: string
          id?: string
          ifsc_code?: string | null
          last_seen_at?: string
          occurrence_count?: number
          source_order_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      binance_order_history: {
        Row: {
          adv_no: string | null
          amount: string | null
          asset: string | null
          commission: string | null
          counter_part_nick_name: string | null
          counterparty_risk_captured_at: string | null
          counterparty_risk_snapshot: Json | null
          create_time: number
          fiat_unit: string | null
          order_detail_raw: Json | null
          order_number: string
          order_status: string | null
          pay_method_name: string | null
          raw_data: Json | null
          seller_payment_details: Json | null
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
          counterparty_risk_captured_at?: string | null
          counterparty_risk_snapshot?: Json | null
          create_time: number
          fiat_unit?: string | null
          order_detail_raw?: Json | null
          order_number: string
          order_status?: string | null
          pay_method_name?: string | null
          raw_data?: Json | null
          seller_payment_details?: Json | null
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
          counterparty_risk_captured_at?: string | null
          counterparty_risk_snapshot?: Json | null
          create_time?: number
          fiat_unit?: string | null
          order_detail_raw?: Json | null
          order_number?: string
          order_status?: string | null
          pay_method_name?: string | null
          raw_data?: Json | null
          seller_payment_details?: Json | null
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
      blocked_phone_numbers: {
        Row: {
          blocked_at: string
          phone: string
          reason: string
        }
        Insert: {
          blocked_at?: string
          phone: string
          reason?: string
        }
        Update: {
          blocked_at?: string
          phone?: string
          reason?: string
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
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_content: string
          order_number: string
          sent_at_ms: number
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          message_content?: string
          order_number?: string
          sent_at_ms?: number
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      client_bank_details: {
        Row: {
          bank_name: string
          client_id: string
          created_at: string
          id: string
          last_four_digits: string
          statement_period_from: string | null
          statement_period_to: string | null
          statement_url: string | null
        }
        Insert: {
          bank_name: string
          client_id: string
          created_at?: string
          id?: string
          last_four_digits: string
          statement_period_from?: string | null
          statement_period_to?: string | null
          statement_url?: string | null
        }
        Update: {
          bank_name?: string
          client_id?: string
          created_at?: string
          id?: string
          last_four_digits?: string
          statement_period_from?: string | null
          statement_period_to?: string | null
          statement_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_bank_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_binance_nicknames: {
        Row: {
          client_id: string
          created_at: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          nickname: string
          source: string
        }
        Insert: {
          client_id: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          nickname: string
          source?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          nickname?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_binance_nicknames_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_communication_logs: {
        Row: {
          client_id: string
          communication_type: string
          content: string
          created_at: string
          id: string
          logged_by: string | null
          subject: string | null
        }
        Insert: {
          client_id: string
          communication_type?: string
          content: string
          created_at?: string
          id?: string
          logged_by?: string | null
          subject?: string | null
        }
        Update: {
          client_id?: string
          communication_type?: string
          content?: string
          created_at?: string
          id?: string
          logged_by?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_communication_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_income_details: {
        Row: {
          client_id: string
          created_at: string
          id: string
          monthly_income_range: number | null
          occupation_business_type: string | null
          primary_source_of_income: string | null
          source_of_fund_url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          monthly_income_range?: number | null
          occupation_business_type?: string | null
          primary_source_of_income?: string | null
          source_of_fund_url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          monthly_income_range?: number | null
          occupation_business_type?: string | null
          primary_source_of_income?: string | null
          source_of_fund_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_income_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_kyc_documents: {
        Row: {
          client_id: string
          created_at: string
          document_type: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          document_type: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_kyc_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_limit_requests: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string | null
          expected_usage: string | null
          id: string
          increase_percentage: number | null
          justification: string | null
          previous_limit: number | null
          requested_at: string | null
          requested_by: string | null
          requested_limit: number
          risk_assessment: string | null
          status: string | null
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string | null
          expected_usage?: string | null
          id?: string
          increase_percentage?: number | null
          justification?: string | null
          previous_limit?: number | null
          requested_at?: string | null
          requested_by?: string | null
          requested_limit: number
          risk_assessment?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string | null
          expected_usage?: string | null
          id?: string
          increase_percentage?: number | null
          justification?: string | null
          previous_limit?: number | null
          requested_at?: string | null
          requested_by?: string | null
          requested_limit?: number
          risk_assessment?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_limit_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
          binance_nickname: string | null
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
          resolved_client_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_assessment: string | null
          sales_order_id: string | null
          updated_at: string
          verified_name: string | null
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
          binance_nickname?: string | null
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
          resolved_client_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_assessment?: string | null
          sales_order_id?: string | null
          updated_at?: string
          verified_name?: string | null
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
          binance_nickname?: string | null
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
          resolved_client_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_assessment?: string | null
          sales_order_id?: string | null
          updated_at?: string
          verified_name?: string | null
          vkyc_notes?: string | null
          vkyc_recording_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_approvals_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_approvals_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      client_verified_names: {
        Row: {
          client_id: string
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          source: string
          verified_name: string
        }
        Insert: {
          client_id: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          source?: string
          verified_name: string
        }
        Update: {
          client_id?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          source?: string
          verified_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_verified_names_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      customer_support_ticket_activities: {
        Row: {
          activity_type: string
          actor_id: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          ticket_id: string
        }
        Insert: {
          activity_type?: string
          actor_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          ticket_id: string
        }
        Update: {
          activity_type?: string
          actor_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_support_ticket_activities_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_support_ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          note: string | null
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note?: string | null
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note?: string | null
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_support_ticket_transfers: {
        Row: {
          created_at: string
          from_user_id: string | null
          id: string
          ticket_id: string
          to_user_id: string
          transfer_reason: string | null
          transferred_by: string
        }
        Insert: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          ticket_id: string
          to_user_id: string
          transfer_reason?: string | null
          transferred_by: string
        }
        Update: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          ticket_id?: string
          to_user_id?: string
          transfer_reason?: string | null
          transferred_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_support_ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          customer_issue: string
          escalated: boolean
          escalation_reason: string | null
          id: string
          order_number: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          customer_issue: string
          escalated?: boolean
          escalation_reason?: string | null
          id?: string
          order_number: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          customer_issue?: string
          escalated?: boolean
          escalation_reason?: string | null
          id?: string
          order_number?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
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
      email_notification_log: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          recipient_email: string | null
          recipient_user_id: string
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          recipient_email?: string | null
          recipient_user_id: string
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          recipient_email?: string | null
          recipient_user_id?: string
          status?: string
          task_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          recipient_email: string
          status?: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
      erp_balance_baseline: {
        Row: {
          asset_code: string | null
          bank_account_id: string | null
          baseline_at: string
          baseline_balance: number
          id: string
          notes: string | null
          scope: string
          set_by: string | null
          wallet_id: string | null
        }
        Insert: {
          asset_code?: string | null
          bank_account_id?: string | null
          baseline_at?: string
          baseline_balance: number
          id?: string
          notes?: string | null
          scope: string
          set_by?: string | null
          wallet_id?: string | null
        }
        Update: {
          asset_code?: string | null
          bank_account_id?: string | null
          baseline_at?: string
          baseline_balance?: number
          id?: string
          notes?: string | null
          scope?: string
          set_by?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_balance_baseline_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: true
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_balance_baseline_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: true
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_balance_baseline_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_balance_snapshot_lines: {
        Row: {
          asset_code: string | null
          calculated_balance: number | null
          drift: number | null
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          metadata: Json | null
          snapshot_id: string
          tracked_balance: number
        }
        Insert: {
          asset_code?: string | null
          calculated_balance?: number | null
          drift?: number | null
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          snapshot_id: string
          tracked_balance?: number
        }
        Update: {
          asset_code?: string | null
          calculated_balance?: number | null
          drift?: number | null
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          snapshot_id?: string
          tracked_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_balance_snapshot_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "erp_balance_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_balance_snapshots: {
        Row: {
          created_at: string
          id: string
          snapshot_at: string
          snapshot_type: string
          summary: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          snapshot_at?: string
          snapshot_type?: string
          summary?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          snapshot_at?: string
          snapshot_type?: string
          summary?: Json | null
        }
        Relationships: []
      }
      erp_drift_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          asset_code: string | null
          calculated_balance: number | null
          created_at: string | null
          drift: number
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          metadata: Json | null
          resolved_at: string | null
          severity: string
          snapshot_id: string | null
          source: string
          tracked_balance: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_code?: string | null
          calculated_balance?: number | null
          created_at?: string | null
          drift: number
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string
          snapshot_id?: string | null
          source?: string
          tracked_balance?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          asset_code?: string | null
          calculated_balance?: number | null
          created_at?: string | null
          drift?: number
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string
          snapshot_id?: string | null
          source?: string
          tracked_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_drift_alerts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "erp_balance_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_product_conversions: {
        Row: {
          actual_execution_rate: number | null
          actual_fee_amount: number | null
          actual_fee_asset: string | null
          actual_quantity_filled: number | null
          actual_usdt_received: number | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          asset_code: string
          binance_transfer_id: string | null
          cost_out_usdt: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          execution_rate_usdt: number | null
          expected_usdt_value: number | null
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
          rejected_by_name: string | null
          rejection_reason: string | null
          side: string
          source: string | null
          spot_trade_id: string | null
          status: string
          wallet_id: string
        }
        Insert: {
          actual_execution_rate?: number | null
          actual_fee_amount?: number | null
          actual_fee_asset?: string | null
          actual_quantity_filled?: number | null
          actual_usdt_received?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          asset_code: string
          binance_transfer_id?: string | null
          cost_out_usdt?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          execution_rate_usdt?: number | null
          expected_usdt_value?: number | null
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
          rejected_by_name?: string | null
          rejection_reason?: string | null
          side: string
          source?: string | null
          spot_trade_id?: string | null
          status?: string
          wallet_id: string
        }
        Update: {
          actual_execution_rate?: number | null
          actual_fee_amount?: number | null
          actual_fee_asset?: string | null
          actual_quantity_filled?: number | null
          actual_usdt_received?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          asset_code?: string
          binance_transfer_id?: string | null
          cost_out_usdt?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          execution_rate_usdt?: number | null
          expected_usdt_value?: number | null
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
          rejected_by_name?: string | null
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
      erp_task_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_task_assignments: {
        Row: {
          assigned_at: string
          from_user_id: string | null
          id: string
          task_id: string
          to_user_id: string | null
        }
        Insert: {
          assigned_at?: string
          from_user_id?: string | null
          id?: string
          task_id: string
          to_user_id?: string | null
        }
        Update: {
          assigned_at?: string
          from_user_id?: string | null
          id?: string
          task_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_assignments_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_assignments_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          mentions: string[] | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mentions?: string[] | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mentions?: string[] | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_task_spectators: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_spectators_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_spectators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_task_spectators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_task_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["erp_task_priority"] | null
          tags: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["erp_task_priority"] | null
          tags?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["erp_task_priority"] | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          escalation_hours: number | null
          escalation_user_id: string | null
          first_response_at: string | null
          id: string
          is_pinned: boolean | null
          is_recurring: boolean | null
          parent_task_id: string | null
          pinned_at: string | null
          priority: Database["public"]["Enums"]["erp_task_priority"]
          recurrence_days: number[] | null
          recurrence_time: string | null
          recurrence_type: string | null
          reminder_hours_before: number | null
          status: Database["public"]["Enums"]["erp_task_status"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          escalation_hours?: number | null
          escalation_user_id?: string | null
          first_response_at?: string | null
          id?: string
          is_pinned?: boolean | null
          is_recurring?: boolean | null
          parent_task_id?: string | null
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["erp_task_priority"]
          recurrence_days?: number[] | null
          recurrence_time?: string | null
          recurrence_type?: string | null
          reminder_hours_before?: number | null
          status?: Database["public"]["Enums"]["erp_task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          escalation_hours?: number | null
          escalation_user_id?: string | null
          first_response_at?: string | null
          id?: string
          is_pinned?: boolean | null
          is_recurring?: boolean | null
          parent_task_id?: string | null
          pinned_at?: string | null
          priority?: Database["public"]["Enums"]["erp_task_priority"]
          recurrence_days?: number[] | null
          recurrence_time?: string | null
          recurrence_type?: string | null
          reminder_hours_before?: number | null
          status?: Database["public"]["Enums"]["erp_task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tasks_escalation_user_id_fkey"
            columns: ["escalation_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "erp_tasks"
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
      hr_attendance_activity_archive: {
        Row: {
          activity_date: string
          archived_at: string | null
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
          archived_at?: string | null
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
          archived_at?: string | null
          clock_in?: string | null
          clock_in_note?: string | null
          clock_out?: string | null
          clock_out_note?: string | null
          created_at?: string
          employee_id?: string
          id?: string
        }
        Relationships: []
      }
      hr_attendance_daily: {
        Row: {
          attendance_date: string
          created_at: string | null
          early_by_minutes: number | null
          early_departure: boolean | null
          employee_id: string
          first_in: string | null
          id: string
          is_late: boolean | null
          last_out: string | null
          late_by_minutes: number | null
          punch_count: number | null
          status: string | null
          total_hours: number | null
          updated_at: string | null
        }
        Insert: {
          attendance_date: string
          created_at?: string | null
          early_by_minutes?: number | null
          early_departure?: boolean | null
          employee_id: string
          first_in?: string | null
          id?: string
          is_late?: boolean | null
          last_out?: string | null
          late_by_minutes?: number | null
          punch_count?: number | null
          status?: string | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          attendance_date?: string
          created_at?: string | null
          early_by_minutes?: number | null
          early_departure?: boolean | null
          employee_id?: string
          first_in?: string | null
          id?: string
          is_late?: boolean | null
          last_out?: string | null
          late_by_minutes?: number | null
          punch_count?: number | null
          status?: string | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_daily_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_policies: {
        Row: {
          absent_if_no_punch: boolean | null
          created_at: string | null
          early_leave_threshold_minutes: number | null
          grace_period_minutes: number | null
          half_day_count_for_lop: number | null
          half_day_threshold_minutes: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          late_count_for_lop: number | null
          late_threshold_minutes: number | null
          min_overtime_minutes: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          absent_if_no_punch?: boolean | null
          created_at?: string | null
          early_leave_threshold_minutes?: number | null
          grace_period_minutes?: number | null
          half_day_count_for_lop?: number | null
          half_day_threshold_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          late_count_for_lop?: number | null
          late_threshold_minutes?: number | null
          min_overtime_minutes?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          absent_if_no_punch?: boolean | null
          created_at?: string | null
          early_leave_threshold_minutes?: number | null
          grace_period_minutes?: number | null
          half_day_count_for_lop?: number | null
          half_day_threshold_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          late_count_for_lop?: number | null
          late_threshold_minutes?: number | null
          min_overtime_minutes?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hr_attendance_punches: {
        Row: {
          badge_id: string
          created_at: string | null
          device_name: string | null
          device_serial: string | null
          employee_id: string
          id: string
          punch_time: string
          punch_type: string | null
          raw_status: number | null
          verified: boolean | null
        }
        Insert: {
          badge_id: string
          created_at?: string | null
          device_name?: string | null
          device_serial?: string | null
          employee_id: string
          id?: string
          punch_time: string
          punch_type?: string | null
          raw_status?: number | null
          verified?: boolean | null
        }
        Update: {
          badge_id?: string
          created_at?: string | null
          device_name?: string | null
          device_serial?: string | null
          employee_id?: string
          id?: string
          punch_time?: string
          punch_type?: string | null
          raw_status?: number | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_punches_archive: {
        Row: {
          archived_at: string | null
          badge_id: string
          created_at: string | null
          device_name: string | null
          device_serial: string | null
          employee_id: string | null
          id: string
          punch_time: string
          punch_type: string | null
          raw_status: number | null
          verified: boolean | null
        }
        Insert: {
          archived_at?: string | null
          badge_id: string
          created_at?: string | null
          device_name?: string | null
          device_serial?: string | null
          employee_id?: string | null
          id?: string
          punch_time: string
          punch_type?: string | null
          raw_status?: number | null
          verified?: boolean | null
        }
        Update: {
          archived_at?: string | null
          badge_id?: string
          created_at?: string | null
          device_name?: string | null
          device_serial?: string | null
          employee_id?: string | null
          id?: string
          punch_time?: string
          punch_type?: string | null
          raw_status?: number | null
          verified?: boolean | null
        }
        Relationships: []
      }
      hr_biometric_devices: {
        Row: {
          company: string | null
          created_at: string
          device_direction: string
          device_serial: string | null
          device_type: string
          employees_count: number | null
          id: string
          is_connected: boolean
          is_live_capture: boolean
          is_scheduled: boolean
          last_push_count: number | null
          last_stamp: string | null
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
          device_serial?: string | null
          device_type?: string
          employees_count?: number | null
          id?: string
          is_connected?: boolean
          is_live_capture?: boolean
          is_scheduled?: boolean
          last_push_count?: number | null
          last_stamp?: string | null
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
          device_serial?: string | null
          device_type?: string
          employees_count?: number | null
          id?: string
          is_connected?: boolean
          is_live_capture?: boolean
          is_scheduled?: boolean
          last_push_count?: number | null
          last_stamp?: string | null
          last_sync_at?: string | null
          machine_ip?: string | null
          name?: string
          password?: string | null
          port_no?: string | null
          updated_at?: string
        }
        Relationships: []
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
          candidate_task_id: string | null
          created_at: string
          id: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          candidate_stage_id: string
          candidate_task_id?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          candidate_stage_id?: string
          candidate_task_id?: string | null
          created_at?: string
          id?: string
          status?: string
          title?: string | null
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
      hr_compoff_credits: {
        Row: {
          allocated_at: string | null
          created_at: string
          credit_date: string
          credit_days: number
          credit_type: string
          employee_id: string
          expires_at: string | null
          id: string
          is_allocated: boolean
          leave_allocation_id: string | null
          notes: string | null
        }
        Insert: {
          allocated_at?: string | null
          created_at?: string
          credit_date: string
          credit_days?: number
          credit_type?: string
          employee_id: string
          expires_at?: string | null
          id?: string
          is_allocated?: boolean
          leave_allocation_id?: string | null
          notes?: string | null
        }
        Update: {
          allocated_at?: string | null
          created_at?: string
          credit_date?: string
          credit_days?: number
          credit_type?: string
          employee_id?: string
          expires_at?: string | null
          id?: string
          is_allocated?: boolean
          leave_allocation_id?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_compoff_credits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_deposit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          deposit_id: string
          description: string | null
          employee_id: string
          id: string
          payroll_run_id: string | null
          reference_id: string | null
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount?: number
          balance_after?: number
          created_at?: string
          deposit_id: string
          description?: string | null
          employee_id: string
          id?: string
          payroll_run_id?: string | null
          reference_id?: string | null
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          deposit_id?: string
          description?: string | null
          employee_id?: string
          id?: string
          payroll_run_id?: string | null
          reference_id?: string | null
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_deposit_transactions_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_deposit_transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
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
      hr_email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          metadata: Json | null
          recipient_email: string
          status: string
          subject: string | null
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          metadata?: Json | null
          recipient_email: string
          status?: string
          subject?: string | null
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          metadata?: Json | null
          recipient_email?: string
          status?: string
          subject?: string | null
          template_name?: string
        }
        Relationships: []
      }
      hr_employee_bank_details: {
        Row: {
          account_number: string | null
          additional_info: Json | null
          address: string | null
          bank_code_2: string | null
          bank_name: string | null
          branch: string | null
          city: string | null
          country: string | null
          created_at: string
          employee_id: string
          id: string
          ifsc_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          additional_info?: Json | null
          address?: string | null
          bank_code_2?: string | null
          bank_name?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_id: string
          id?: string
          ifsc_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          additional_info?: Json | null
          address?: string | null
          bank_code_2?: string | null
          bank_name?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          ifsc_code?: string | null
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
      hr_employee_deposits: {
        Row: {
          collected_amount: number
          created_at: string
          current_balance: number
          deduction_mode: string
          deduction_start_month: string | null
          deduction_value: number
          employee_id: string
          id: string
          is_fully_collected: boolean
          is_paused: boolean | null
          is_settled: boolean
          paused_at: string | null
          paused_reason: string | null
          settled_at: string | null
          settlement_notes: string | null
          total_deposit_amount: number
          updated_at: string
        }
        Insert: {
          collected_amount?: number
          created_at?: string
          current_balance?: number
          deduction_mode?: string
          deduction_start_month?: string | null
          deduction_value?: number
          employee_id: string
          id?: string
          is_fully_collected?: boolean
          is_paused?: boolean | null
          is_settled?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          settled_at?: string | null
          settlement_notes?: string | null
          total_deposit_amount?: number
          updated_at?: string
        }
        Update: {
          collected_amount?: number
          created_at?: string
          current_balance?: number
          deduction_mode?: string
          deduction_start_month?: string | null
          deduction_value?: number
          employee_id?: string
          id?: string
          is_fully_collected?: boolean
          is_paused?: boolean | null
          is_settled?: boolean
          paused_at?: string | null
          paused_reason?: string | null
          settled_at?: string | null
          settlement_notes?: string | null
          total_deposit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_deposits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_documents: {
        Row: {
          document_name: string
          document_type: string
          employee_id: string
          file_url: string
          id: string
          is_verified: boolean
          notes: string | null
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          document_name: string
          document_type: string
          employee_id: string
          file_url: string
          id?: string
          is_verified?: boolean
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          document_name?: string
          document_type?: string
          employee_id?: string
          file_url?: string
          id?: string
          is_verified?: boolean
          notes?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_documents_employee_id_fkey"
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
      hr_employee_onboarding: {
        Row: {
          candidate_id: string | null
          create_erp_account: boolean | null
          created_at: string
          created_by: string | null
          ctc: number | null
          current_stage: number
          date_of_birth: string | null
          date_of_joining: string | null
          department_id: string | null
          deposit_config: Json | null
          document_collection_status: string | null
          document_email_sent_at: string | null
          document_mail_received_at: string | null
          documents: Json | null
          email: string | null
          employee_id: string | null
          employee_type: string | null
          erp_role_id: string | null
          essl_badge_id: string | null
          first_name: string | null
          gender: string | null
          id: string
          job_role: string | null
          last_name: string | null
          offer_policy_status: string | null
          phone: string | null
          position_id: string | null
          reporting_manager_id: string | null
          salary_template_id: string | null
          shift_id: string | null
          stage_completions: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          create_erp_account?: boolean | null
          created_at?: string
          created_by?: string | null
          ctc?: number | null
          current_stage?: number
          date_of_birth?: string | null
          date_of_joining?: string | null
          department_id?: string | null
          deposit_config?: Json | null
          document_collection_status?: string | null
          document_email_sent_at?: string | null
          document_mail_received_at?: string | null
          documents?: Json | null
          email?: string | null
          employee_id?: string | null
          employee_type?: string | null
          erp_role_id?: string | null
          essl_badge_id?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          job_role?: string | null
          last_name?: string | null
          offer_policy_status?: string | null
          phone?: string | null
          position_id?: string | null
          reporting_manager_id?: string | null
          salary_template_id?: string | null
          shift_id?: string | null
          stage_completions?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          create_erp_account?: boolean | null
          created_at?: string
          created_by?: string | null
          ctc?: number | null
          current_stage?: number
          date_of_birth?: string | null
          date_of_joining?: string | null
          department_id?: string | null
          deposit_config?: Json | null
          document_collection_status?: string | null
          document_email_sent_at?: string | null
          document_mail_received_at?: string | null
          documents?: Json | null
          email?: string | null
          employee_id?: string | null
          employee_type?: string | null
          erp_role_id?: string | null
          essl_badge_id?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          job_role?: string | null
          last_name?: string | null
          offer_policy_status?: string | null
          phone?: string | null
          position_id?: string | null
          reporting_manager_id?: string | null
          salary_template_id?: string | null
          shift_id?: string | null
          stage_completions?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_onboarding_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_onboarding_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_onboarding_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_onboarding_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
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
          is_percentage: boolean
          updated_at: string
        }
        Insert: {
          amount?: number
          component_id: string
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
          is_percentage?: boolean
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          is_percentage?: boolean
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
      hr_employee_shift_schedule: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          is_current: boolean | null
          shift_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          is_current?: boolean | null
          shift_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          is_current?: boolean | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_shift_schedule_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_shift_schedule_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
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
      hr_employee_weekly_off: {
        Row: {
          created_at: string | null
          effective_from: string
          employee_id: string
          id: string
          is_current: boolean | null
          pattern_id: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string
          employee_id: string
          id?: string
          is_current?: boolean | null
          pattern_id: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          employee_id?: string
          id?: string
          is_current?: boolean | null
          pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_weekly_off_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_weekly_off_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "hr_weekly_off_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_work_info: {
        Row: {
          additional_info: Json | null
          basic_salary: number | null
          company_name: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          contract_end_date: string | null
          created_at: string
          department_id: string | null
          employee_id: string
          employee_type: string | null
          experience_years: number | null
          id: string
          is_confirmed: boolean | null
          job_position_id: string | null
          job_role: string | null
          joining_date: string | null
          location: string | null
          probation_end_date: string | null
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
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_end_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_id: string
          employee_type?: string | null
          experience_years?: number | null
          id?: string
          is_confirmed?: boolean | null
          job_position_id?: string | null
          job_role?: string | null
          joining_date?: string | null
          location?: string | null
          probation_end_date?: string | null
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
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_end_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_id?: string
          employee_type?: string | null
          experience_years?: number | null
          id?: string
          is_confirmed?: boolean | null
          job_position_id?: string | null
          job_role?: string | null
          joining_date?: string | null
          location?: string | null
          probation_end_date?: string | null
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
          account_deletion_date: string | null
          additional_info: Json | null
          address: string | null
          badge_id: string
          basic_salary: number | null
          children: number | null
          city: string | null
          country: string | null
          created_at: string
          deletion_approved_by: string | null
          dob: string | null
          email: string | null
          emergency_contact: string | null
          emergency_contact_name: string | null
          emergency_contact_relation: string | null
          esi_number: string | null
          experience: string | null
          filing_status_id: string | null
          first_name: string
          gender: string | null
          id: string
          is_active: boolean
          last_name: string
          last_working_day: string | null
          marital_status: string | null
          notice_period_end_date: string | null
          pan_number: string | null
          pf_number: string | null
          phone: string | null
          profile_image_url: string | null
          qualification: string | null
          resignation_date: string | null
          resignation_status: string | null
          salary_structure_template_id: string | null
          salary_template_id: string | null
          separation_reason: string | null
          state: string | null
          termination_date: string | null
          total_salary: number | null
          uan_number: string | null
          updated_at: string
          user_id: string | null
          zip: string | null
        }
        Insert: {
          account_deletion_date?: string | null
          additional_info?: Json | null
          address?: string | null
          badge_id: string
          basic_salary?: number | null
          children?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          deletion_approved_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relation?: string | null
          esi_number?: string | null
          experience?: string | null
          filing_status_id?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_name: string
          last_working_day?: string | null
          marital_status?: string | null
          notice_period_end_date?: string | null
          pan_number?: string | null
          pf_number?: string | null
          phone?: string | null
          profile_image_url?: string | null
          qualification?: string | null
          resignation_date?: string | null
          resignation_status?: string | null
          salary_structure_template_id?: string | null
          salary_template_id?: string | null
          separation_reason?: string | null
          state?: string | null
          termination_date?: string | null
          total_salary?: number | null
          uan_number?: string | null
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Update: {
          account_deletion_date?: string | null
          additional_info?: Json | null
          address?: string | null
          badge_id?: string
          basic_salary?: number | null
          children?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          deletion_approved_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relation?: string | null
          esi_number?: string | null
          experience?: string | null
          filing_status_id?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          last_working_day?: string | null
          marital_status?: string | null
          notice_period_end_date?: string | null
          pan_number?: string | null
          pf_number?: string | null
          phone?: string | null
          profile_image_url?: string | null
          qualification?: string | null
          resignation_date?: string | null
          resignation_status?: string | null
          salary_structure_template_id?: string | null
          salary_template_id?: string | null
          separation_reason?: string | null
          state?: string | null
          termination_date?: string | null
          total_salary?: number | null
          uan_number?: string | null
          updated_at?: string
          user_id?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_filing_status_id_fkey"
            columns: ["filing_status_id"]
            isOneToOne: false
            referencedRelation: "hr_filing_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_salary_structure_template_id_fkey"
            columns: ["salary_structure_template_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_structure_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_salary_template_id_fkey"
            columns: ["salary_template_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_structure_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      hr_filing_statuses: {
        Row: {
          based_on: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          based_on?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          based_on?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hr_fnf_settlements: {
        Row: {
          approved_by: string | null
          bonus_amount: number
          created_at: string
          deposit_refund: number
          employee_id: string
          id: string
          last_working_day: string
          leave_encashment_amount: number
          leave_encashment_days: number
          loan_recovery: number
          net_payable: number
          notes: string | null
          other_deductions: number
          other_deductions_notes: string | null
          paid_at: string | null
          payment_reference: string | null
          penalty_deductions: number
          pending_salary: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          bonus_amount?: number
          created_at?: string
          deposit_refund?: number
          employee_id: string
          id?: string
          last_working_day: string
          leave_encashment_amount?: number
          leave_encashment_days?: number
          loan_recovery?: number
          net_payable?: number
          notes?: string | null
          other_deductions?: number
          other_deductions_notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          penalty_deductions?: number
          pending_salary?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          bonus_amount?: number
          created_at?: string
          deposit_refund?: number
          employee_id?: string
          id?: string
          last_working_day?: string
          leave_encashment_amount?: number
          leave_encashment_days?: number
          loan_recovery?: number
          net_payable?: number
          notes?: string | null
          other_deductions?: number
          other_deductions_notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          penalty_deductions?: number
          pending_salary?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_fnf_settlements_employee_id_fkey"
            columns: ["employee_id"]
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
      hr_hour_accounts: {
        Row: {
          created_at: string | null
          employee_id: string
          hour_account_second: number | null
          hour_pending_second: number | null
          id: string
          month: string
          month_sequence: number
          overtime: string | null
          overtime_second: number | null
          pending_hours: string | null
          updated_at: string | null
          worked_hours: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          hour_account_second?: number | null
          hour_pending_second?: number | null
          id?: string
          month: string
          month_sequence?: number
          overtime?: string | null
          overtime_second?: number | null
          pending_hours?: string | null
          updated_at?: string | null
          worked_hours?: string | null
          year?: number
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          hour_account_second?: number | null
          hour_pending_second?: number | null
          id?: string
          month?: string
          month_sequence?: number
          overtime?: string | null
          overtime_second?: number | null
          pending_hours?: string | null
          updated_at?: string | null
          worked_hours?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_hour_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
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
      hr_late_come_early_out: {
        Row: {
          attendance_date: string
          attendance_id: string
          created_at: string | null
          early_minutes: number | null
          employee_id: string
          id: string
          late_minutes: number | null
          penalty_count: number | null
          shift_id: string | null
          type: string
        }
        Insert: {
          attendance_date: string
          attendance_id: string
          created_at?: string | null
          early_minutes?: number | null
          employee_id: string
          id?: string
          late_minutes?: number | null
          penalty_count?: number | null
          shift_id?: string | null
          type: string
        }
        Update: {
          attendance_date?: string
          attendance_id?: string
          created_at?: string | null
          early_minutes?: number | null
          employee_id?: string
          id?: string
          late_minutes?: number | null
          penalty_count?: number | null
          shift_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_late_come_early_out_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "hr_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_late_come_early_out_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_late_come_early_out_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_accrual_log: {
        Row: {
          accrual_date: string
          accrual_plan_id: string
          accrued_days: number
          created_at: string | null
          employee_id: string
          id: string
          quarter: number | null
          year: number
        }
        Insert: {
          accrual_date: string
          accrual_plan_id: string
          accrued_days: number
          created_at?: string | null
          employee_id: string
          id?: string
          quarter?: number | null
          year: number
        }
        Update: {
          accrual_date?: string
          accrual_plan_id?: string
          accrued_days?: number
          created_at?: string | null
          employee_id?: string
          id?: string
          quarter?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_accrual_log_accrual_plan_id_fkey"
            columns: ["accrual_plan_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_accrual_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_accrual_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_accrual_plans: {
        Row: {
          accrual_amount: number
          accrual_period: string
          applicable_to: string
          created_at: string | null
          department_id: string | null
          effective_from: string
          id: string
          is_active: boolean | null
          is_based_on_attendance: boolean | null
          last_accrual_date: string | null
          leave_type_id: string
          max_accrual: number | null
          min_attendance_days: number | null
          name: string
          position_id: string | null
          updated_at: string | null
        }
        Insert: {
          accrual_amount?: number
          accrual_period?: string
          applicable_to?: string
          created_at?: string | null
          department_id?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean | null
          is_based_on_attendance?: boolean | null
          last_accrual_date?: string | null
          leave_type_id: string
          max_accrual?: number | null
          min_attendance_days?: number | null
          name: string
          position_id?: string | null
          updated_at?: string | null
        }
        Update: {
          accrual_amount?: number
          accrual_period?: string
          applicable_to?: string
          created_at?: string | null
          department_id?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean | null
          is_based_on_attendance?: boolean | null
          last_accrual_date?: string | null
          leave_type_id?: string
          max_accrual?: number | null
          min_attendance_days?: number | null
          name?: string
          position_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_accrual_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_accrual_plans_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
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
          available_days: number | null
          carry_forward_days: number | null
          created_at: string
          employee_id: string
          expired_date: string | null
          id: string
          leave_type_id: string
          quarter: number
          reset_date: string | null
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          allocated_days?: number
          available_days?: number | null
          carry_forward_days?: number | null
          created_at?: string
          employee_id: string
          expired_date?: string | null
          id?: string
          leave_type_id: string
          quarter?: number
          reset_date?: string | null
          updated_at?: string
          used_days?: number
          year?: number
        }
        Update: {
          allocated_days?: number
          available_days?: number | null
          carry_forward_days?: number | null
          created_at?: string
          employee_id?: string
          expired_date?: string | null
          id?: string
          leave_type_id?: string
          quarter?: number
          reset_date?: string | null
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
          leave_clashes_count: number | null
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
          leave_clashes_count?: number | null
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
          leave_clashes_count?: number | null
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
          carryforward_expire_in: number | null
          carryforward_expire_period: string | null
          carryforward_type: string | null
          code: string
          color: string | null
          created_at: string
          exclude_company_leave: boolean | null
          exclude_holiday: boolean | null
          id: string
          is_active: boolean | null
          is_compensatory_leave: boolean | null
          is_encashable: boolean | null
          is_paid: boolean | null
          max_carry_forward_days: number | null
          max_days_per_year: number | null
          name: string
          require_attachment: boolean | null
          requires_approval: boolean | null
          reset: boolean | null
          reset_based: string | null
          reset_day: string | null
          reset_month: string | null
          updated_at: string
        }
        Insert: {
          carry_forward?: boolean | null
          carryforward_expire_in?: number | null
          carryforward_expire_period?: string | null
          carryforward_type?: string | null
          code: string
          color?: string | null
          created_at?: string
          exclude_company_leave?: boolean | null
          exclude_holiday?: boolean | null
          id?: string
          is_active?: boolean | null
          is_compensatory_leave?: boolean | null
          is_encashable?: boolean | null
          is_paid?: boolean | null
          max_carry_forward_days?: number | null
          max_days_per_year?: number | null
          name: string
          require_attachment?: boolean | null
          requires_approval?: boolean | null
          reset?: boolean | null
          reset_based?: string | null
          reset_day?: string | null
          reset_month?: string | null
          updated_at?: string
        }
        Update: {
          carry_forward?: boolean | null
          carryforward_expire_in?: number | null
          carryforward_expire_period?: string | null
          carryforward_type?: string | null
          code?: string
          color?: string | null
          created_at?: string
          exclude_company_leave?: boolean | null
          exclude_holiday?: boolean | null
          id?: string
          is_active?: boolean | null
          is_compensatory_leave?: boolean | null
          is_encashable?: boolean | null
          is_paid?: boolean | null
          max_carry_forward_days?: number | null
          max_days_per_year?: number | null
          name?: string
          require_attachment?: boolean | null
          requires_approval?: boolean | null
          reset?: boolean | null
          reset_based?: string | null
          reset_day?: string | null
          reset_month?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hr_loan_repayments: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          employee_id: string
          id: string
          loan_id: string
          notes: string | null
          payroll_run_id: string | null
          repayment_date: string
          repayment_type: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string | null
          employee_id: string
          id?: string
          loan_id: string
          notes?: string | null
          payroll_run_id?: string | null
          repayment_date?: string
          repayment_type?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          employee_id?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payroll_run_id?: string | null
          repayment_date?: string
          repayment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_loan_repayments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "hr_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_loan_repayments_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_loans: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          disbursement_date: string
          emi_amount: number
          employee_id: string
          id: string
          interest_rate: number | null
          loan_type: string
          notes: string | null
          outstanding_balance: number
          reason: string | null
          rejection_reason: string | null
          start_emi_date: string
          status: string
          tenure_months: number
          updated_at: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          disbursement_date?: string
          emi_amount: number
          employee_id: string
          id?: string
          interest_rate?: number | null
          loan_type?: string
          notes?: string | null
          outstanding_balance: number
          reason?: string | null
          rejection_reason?: string | null
          start_emi_date: string
          status?: string
          tenure_months?: number
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          disbursement_date?: string
          emi_amount?: number
          employee_id?: string
          id?: string
          interest_rate?: number | null
          loan_type?: string
          notes?: string | null
          outstanding_balance?: number
          reason?: string | null
          rejection_reason?: string | null
          start_emi_date?: string
          status?: string
          tenure_months?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_notification_log: {
        Row: {
          channel: string | null
          created_at: string | null
          employee_id: string
          id: string
          is_read: boolean | null
          message: string | null
          notification_type: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
        }
        Relationships: []
      }
      hr_notification_preferences: {
        Row: {
          channel: string | null
          created_at: string | null
          employee_id: string
          id: string
          is_enabled: boolean | null
          notification_type: string
          updated_at: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          is_enabled?: boolean | null
          notification_type: string
          updated_at?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          is_enabled?: boolean | null
          notification_type?: string
          updated_at?: string | null
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
      hr_onboarding_audit_log: {
        Row: {
          action: string
          changed_fields: Json | null
          id: string
          onboarding_id: string
          performed_at: string
          performed_by: string | null
          stage: number | null
        }
        Insert: {
          action: string
          changed_fields?: Json | null
          id?: string
          onboarding_id: string
          performed_at?: string
          performed_by?: string | null
          stage?: number | null
        }
        Update: {
          action?: string
          changed_fields?: Json | null
          id?: string
          onboarding_id?: string
          performed_at?: string
          performed_by?: string | null
          stage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_audit_log_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_onboarding"
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
          completed_at: string | null
          created_at: string
          employee_id: string
          id: string
          is_completed: boolean
          notes: string | null
          task_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          task_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
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
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          pay_period_end: string
          pay_period_start: string
          processed_by: string | null
          rerun_count: number
          rerun_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
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
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          pay_period_end: string
          pay_period_start: string
          processed_by?: string | null
          rerun_count?: number
          rerun_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          pay_period_end?: string
          pay_period_start?: string
          processed_by?: string | null
          rerun_count?: number
          rerun_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          employer_contributions: Json | null
          gross_salary: number
          holiday_days_worked: number | null
          id: string
          leave_days: number | null
          lop_days: number | null
          lop_deduction: number | null
          net_salary: number
          overtime_hours: number | null
          payment_date: string | null
          payment_reference: string | null
          payroll_run_id: string
          penalty_amount: number | null
          present_days: number | null
          status: string | null
          sunday_days_worked: number | null
          tds_amount: number | null
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
          employer_contributions?: Json | null
          gross_salary?: number
          holiday_days_worked?: number | null
          id?: string
          leave_days?: number | null
          lop_days?: number | null
          lop_deduction?: number | null
          net_salary?: number
          overtime_hours?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          payroll_run_id: string
          penalty_amount?: number | null
          present_days?: number | null
          status?: string | null
          sunday_days_worked?: number | null
          tds_amount?: number | null
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
          employer_contributions?: Json | null
          gross_salary?: number
          holiday_days_worked?: number | null
          id?: string
          leave_days?: number | null
          lop_days?: number | null
          lop_deduction?: number | null
          net_salary?: number
          overtime_hours?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          payroll_run_id?: string
          penalty_amount?: number | null
          present_days?: number | null
          status?: string | null
          sunday_days_worked?: number | null
          tds_amount?: number | null
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
      hr_penalties: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          deduct_from_deposit: boolean
          employee_id: string
          id: string
          is_applied: boolean
          late_count: number | null
          notes: string | null
          payroll_run_id: string | null
          penalty_amount: number
          penalty_days: number
          penalty_month: string
          penalty_reason: string
          penalty_type: string
          rule_id: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_deposit?: boolean
          employee_id: string
          id?: string
          is_applied?: boolean
          late_count?: number | null
          notes?: string | null
          payroll_run_id?: string | null
          penalty_amount?: number
          penalty_days?: number
          penalty_month: string
          penalty_reason: string
          penalty_type: string
          rule_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          deduct_from_deposit?: boolean
          employee_id?: string
          id?: string
          is_applied?: boolean
          late_count?: number | null
          notes?: string | null
          payroll_run_id?: string | null
          penalty_amount?: number
          penalty_days?: number
          penalty_month?: string
          penalty_reason?: string
          penalty_type?: string
          rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_penalties_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_penalties_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "hr_penalty_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_penalty_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          late_count_max: number | null
          late_count_min: number
          penalty_type: string
          penalty_value: number
          rule_name: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          late_count_max?: number | null
          late_count_min?: number
          penalty_type?: string
          penalty_value?: number
          rule_name: string
          rule_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          late_count_max?: number | null
          late_count_min?: number
          penalty_type?: string
          penalty_value?: number
          rule_name?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
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
      hr_resignation_checklist: {
        Row: {
          completed_at: string | null
          created_at: string
          employee_id: string
          id: string
          is_completed: boolean
          item_title: string
          notes: string | null
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_completed?: boolean
          item_title: string
          notes?: string | null
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_completed?: boolean
          item_title?: string
          notes?: string | null
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_resignation_checklist_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_resignation_checklist_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "hr_resignation_checklist_template"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_resignation_checklist_template: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          item_title: string
          sequence: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_title: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_title?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: []
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
      hr_salary_revisions: {
        Row: {
          approved_by: string | null
          created_at: string
          effective_from: string
          employee_id: string
          id: string
          new_basic: number | null
          new_total: number | null
          previous_basic: number | null
          previous_total: number | null
          revision_reason: string | null
          revision_type: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          effective_from?: string
          employee_id: string
          id?: string
          new_basic?: number | null
          new_total?: number | null
          previous_basic?: number | null
          previous_total?: number | null
          revision_reason?: string | null
          revision_type?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          effective_from?: string
          employee_id?: string
          id?: string
          new_basic?: number | null
          new_total?: number | null
          previous_basic?: number | null
          previous_total?: number | null
          revision_reason?: string | null
          revision_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_revisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_structure_template_items: {
        Row: {
          calculation_type: string
          component_id: string
          created_at: string
          formula: string | null
          id: string
          is_variable: boolean
          percentage_of: string | null
          template_id: string
          value: number
        }
        Insert: {
          calculation_type?: string
          component_id: string
          created_at?: string
          formula?: string | null
          id?: string
          is_variable?: boolean
          percentage_of?: string | null
          template_id: string
          value?: number
        }
        Update: {
          calculation_type?: string
          component_id?: string
          created_at?: string
          formula?: string | null
          id?: string
          is_variable?: boolean
          percentage_of?: string | null
          template_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_structure_template_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_structure_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_structure_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_structure_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_shifts: {
        Row: {
          break_duration_minutes: number | null
          created_at: string
          duration_hours: number | null
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
          duration_hours?: number | null
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
          duration_hours?: number | null
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
      hr_tax_brackets: {
        Row: {
          created_at: string | null
          description: string | null
          filing_status_id: string
          id: string
          max_income: number | null
          min_income: number
          sort_order: number | null
          tax_rate: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filing_status_id: string
          id?: string
          max_income?: number | null
          min_income: number
          sort_order?: number | null
          tax_rate?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filing_status_id?: string
          id?: string
          max_income?: number | null
          min_income?: number
          sort_order?: number | null
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_tax_brackets_filing_status_id_fkey"
            columns: ["filing_status_id"]
            isOneToOne: false
            referencedRelation: "hr_filing_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_weekly_off_patterns: {
        Row: {
          alternate_week_offs: number[] | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_alternating: boolean | null
          name: string
          weekly_offs: number[]
        }
        Insert: {
          alternate_week_offs?: number[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_alternating?: boolean | null
          name: string
          weekly_offs?: number[]
        }
        Update: {
          alternate_week_offs?: number[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_alternating?: boolean | null
          name?: string
          weekly_offs?: number[]
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
      ledger_anchors: {
        Row: {
          anchored_at: string
          anchored_by: string | null
          head_row_hash: string
          head_sequence_no: number
          id: string
          tx_count: number
          wallet_id: string | null
        }
        Insert: {
          anchored_at?: string
          anchored_by?: string | null
          head_row_hash: string
          head_sequence_no: number
          id?: string
          tx_count: number
          wallet_id?: string | null
        }
        Update: {
          anchored_at?: string
          anchored_by?: string | null
          head_row_hash?: string
          head_sequence_no?: number
          id?: string
          tx_count?: number
          wallet_id?: string | null
        }
        Relationships: []
      }
      ledger_tamper_log: {
        Row: {
          attempted_at: string
          attempted_by: string | null
          attempted_role: string | null
          blocked: boolean
          id: string
          new_payload: Json | null
          old_payload: Json | null
          operation: string
          reason: string | null
          target_tx_id: string | null
        }
        Insert: {
          attempted_at?: string
          attempted_by?: string | null
          attempted_role?: string | null
          blocked?: boolean
          id?: string
          new_payload?: Json | null
          old_payload?: Json | null
          operation: string
          reason?: string | null
          target_tx_id?: string | null
        }
        Update: {
          attempted_at?: string
          attempted_by?: string | null
          attempted_role?: string | null
          blocked?: boolean
          id?: string
          new_payload?: Json | null
          old_payload?: Json | null
          operation?: string
          reason?: string | null
          target_tx_id?: string | null
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
      p2p_auto_pay_engine_runs: {
        Row: {
          attempted: number
          auto_assigned: number
          auto_paid: number
          candidates: number
          errors: number
          finished_at: string | null
          id: string
          skipped: number
          started_at: string
          status: string
          summary: Json
          total_orders: number
          warnings: number
        }
        Insert: {
          attempted?: number
          auto_assigned?: number
          auto_paid?: number
          candidates?: number
          errors?: number
          finished_at?: string | null
          id?: string
          skipped?: number
          started_at?: string
          status?: string
          summary?: Json
          total_orders?: number
          warnings?: number
        }
        Update: {
          attempted?: number
          auto_assigned?: number
          auto_paid?: number
          candidates?: number
          errors?: number
          finished_at?: string | null
          id?: string
          skipped?: number
          started_at?: string
          status?: string
          summary?: Json
          total_orders?: number
          warnings?: number
        }
        Relationships: []
      }
      p2p_auto_pay_log: {
        Row: {
          action: string
          decision_reason: string | null
          error_message: string | null
          executed_at: string
          id: string
          metadata: Json
          minutes_remaining: number | null
          order_number: string
          raw_status: string | null
          source: string | null
          status: string
        }
        Insert: {
          action?: string
          decision_reason?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          metadata?: Json
          minutes_remaining?: number | null
          order_number: string
          raw_status?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          action?: string
          decision_reason?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          metadata?: Json
          minutes_remaining?: number | null
          order_number?: string
          raw_status?: string | null
          source?: string | null
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
          monthly_volume_limit: number | null
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
          monthly_volume_limit?: number | null
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
          monthly_volume_limit?: number | null
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
      password_reset_requests: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          reason: string | null
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          resolver_note: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolver_note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolver_note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_reset_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payer_screenshot_automation_config: {
        Row: {
          created_at: string
          from_name: string
          from_upi_id: string
          id: string
          is_active: boolean
          max_amount: number
          min_amount: number
          provider_fee_flat: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          from_name?: string
          from_upi_id?: string
          id?: string
          is_active?: boolean
          max_amount?: number
          min_amount?: number
          provider_fee_flat?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          from_name?: string
          from_upi_id?: string
          id?: string
          is_active?: boolean
          max_amount?: number
          min_amount?: number
          provider_fee_flat?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payer_screenshot_automation_log: {
        Row: {
          amount_used: number | null
          created_at: string
          error_message: string | null
          id: string
          image_url: string | null
          order_number: string
          payer_name: string | null
          payer_user_id: string | null
          provider_fee: number | null
          status: string
          to_upi_id: string | null
          total_debited: number | null
          upi_txn_id: string | null
        }
        Insert: {
          amount_used?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          order_number: string
          payer_name?: string | null
          payer_user_id?: string | null
          provider_fee?: number | null
          status: string
          to_upi_id?: string | null
          total_debited?: number | null
          upi_txn_id?: string | null
        }
        Update: {
          amount_used?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          image_url?: string | null
          order_number?: string
          payer_name?: string | null
          payer_user_id?: string | null
          provider_fee?: number | null
          status?: string
          to_upi_id?: string | null
          total_debited?: number | null
          upi_txn_id?: string | null
        }
        Relationships: []
      }
      payment_gateway_settlement_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          reversed_at: string | null
          sales_order_id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reversed_at?: string | null
          sales_order_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reversed_at?: string | null
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
          reversed_by: string | null
          settled_by: string | null
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
          reversed_by?: string | null
          settled_by?: string | null
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
          reversed_by?: string | null
          settled_by?: string | null
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
          {
            foreignKeyName: "payment_gateway_settlements_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateway_settlements_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "users"
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
            isOneToOne: false
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
      permission_change_log: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          function_key: string | null
          id: string
          permission: string | null
          role_id: string | null
          role_name: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          function_key?: string | null
          id?: string
          permission?: string | null
          role_id?: string | null
          role_name: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          function_key?: string | null
          id?: string
          permission?: string | null
          role_id?: string | null
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_change_log_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_enforcement_config: {
        Row: {
          id: string
          mode: string
          updated_at: string
        }
        Insert: {
          id?: string
          mode?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_enforcement_log: {
        Row: {
          attempted_action: string
          blocked: boolean
          created_at: string
          enforcement_mode: string
          had_permission: boolean
          id: string
          required_permission: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          attempted_action: string
          blocked?: boolean
          created_at?: string
          enforcement_mode: string
          had_permission?: boolean
          id?: string
          required_permission: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          attempted_action?: string
          blocked?: boolean
          created_at?: string
          enforcement_mode?: string
          had_permission?: boolean
          id?: string
          required_permission?: string
          user_id?: string | null
          username?: string | null
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
      positions: {
        Row: {
          created_at: string | null
          department_id: string | null
          description: string | null
          hierarchy_level: number | null
          id: string
          is_active: boolean | null
          reports_to_position_id: string | null
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
          reports_to_position_id?: string | null
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
          reports_to_position_id?: string | null
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
          {
            foreignKeyName: "positions_reports_to_position_id_fkey"
            columns: ["reports_to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshots: {
        Row: {
          asset_code: string
          created_at: string | null
          entry_type: string | null
          fetched_at: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          requested_by: string | null
          source: string | null
          usdt_price: number
        }
        Insert: {
          asset_code: string
          created_at?: string | null
          entry_type?: string | null
          fetched_at?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          source?: string | null
          usdt_price: number
        }
        Update: {
          asset_code?: string
          created_at?: string | null
          entry_type?: string | null
          fetched_at?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          source?: string | null
          usdt_price?: number
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
          effective_usdt_qty: number | null
          effective_usdt_rate: number | null
          failure_proof_url: string | null
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
          order_number: string
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
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          failure_proof_url?: string | null
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
          order_number: string
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
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          failure_proof_url?: string | null
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
          order_number?: string
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
      raci_assignments: {
        Row: {
          assignment_type: string
          created_at: string
          id: string
          notes: string | null
          role_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          assignment_type: string
          created_at?: string
          id?: string
          notes?: string | null
          role_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          role_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raci_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "raci_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raci_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "raci_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      raci_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      raci_roles: {
        Row: {
          color: string | null
          created_at: string
          department: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          department?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      raci_tasks: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raci_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "raci_categories"
            referencedColumns: ["id"]
          },
        ]
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
      role_kpis: {
        Row: {
          created_at: string
          display_order: number
          frequency: string | null
          id: string
          is_active: boolean
          kra_id: string
          measurement_method: string | null
          metric: string
          role_id: string
          target: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          frequency?: string | null
          id?: string
          is_active?: boolean
          kra_id: string
          measurement_method?: string | null
          metric: string
          role_id: string
          target?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          frequency?: string | null
          id?: string
          is_active?: boolean
          kra_id?: string
          measurement_method?: string | null
          metric?: string
          role_id?: string
          target?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_kpis_kra_id_fkey"
            columns: ["kra_id"]
            isOneToOne: false
            referencedRelation: "role_kras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_kpis_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "raci_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_kras: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          role_id: string
          title: string
          updated_at: string
          weightage: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          role_id: string
          title: string
          updated_at?: string
          weightage?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          role_id?: string
          title?: string
          updated_at?: string
          weightage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "role_kras_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "raci_roles"
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
          can_manage_roles_below: boolean | null
          created_at: string | null
          description: string | null
          hierarchy_level: number | null
          id: string
          is_system_role: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          can_manage_roles_below?: boolean | null
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
          id?: string
          is_system_role?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          can_manage_roles_below?: boolean | null
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number | null
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
      sales_order_payment_splits: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          created_by: string | null
          id: string
          is_gateway: boolean | null
          payment_method_id: string | null
          sales_order_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_gateway?: boolean | null
          payment_method_id?: string | null
          sales_order_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_gateway?: boolean | null
          payment_method_id?: string | null
          sales_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_payment_splits_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_payment_splits_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_payment_splits_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "sales_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_payment_splits_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          client_id: string | null
          client_name: string
          client_phone: string | null
          client_state: string | null
          cosmos_alert: boolean | null
          created_at: string
          created_by: string | null
          description: string | null
          effective_usdt_qty: number | null
          effective_usdt_rate: number | null
          fee_amount: number | null
          fee_percentage: number | null
          id: string
          is_off_market: boolean | null
          is_split_payment: boolean
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
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          client_state?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          is_off_market?: boolean | null
          is_split_payment?: boolean
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
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          client_state?: string | null
          cosmos_alert?: boolean | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          fee_amount?: number | null
          fee_percentage?: number | null
          id?: string
          is_off_market?: boolean | null
          is_split_payment?: boolean
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
            foreignKeyName: "sales_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
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
      shift_reconciliations: {
        Row: {
          comparison_result: Json
          created_at: string
          erp_snapshot: Json
          has_mismatches: boolean
          id: string
          mismatch_count: number
          parent_reconciliation_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_label: string | null
          status: string
          submitted_at: string
          submitted_by: string
          submitted_data: Json
          updated_at: string
        }
        Insert: {
          comparison_result?: Json
          created_at?: string
          erp_snapshot?: Json
          has_mismatches?: boolean
          id?: string
          mismatch_count?: number
          parent_reconciliation_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_label?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          submitted_data?: Json
          updated_at?: string
        }
        Update: {
          comparison_result?: Json
          created_at?: string
          erp_snapshot?: Json
          has_mismatches?: boolean
          id?: string
          mismatch_count?: number
          parent_reconciliation_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_label?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          submitted_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_reconciliations_parent_reconciliation_id_fkey"
            columns: ["parent_reconciliation_id"]
            isOneToOne: false
            referencedRelation: "daily_reconciliation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reconciliations_parent_reconciliation_id_fkey"
            columns: ["parent_reconciliation_id"]
            isOneToOne: false
            referencedRelation: "shift_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      small_buys_config: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_enabled: boolean
          max_amount: number
          min_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_enabled?: boolean
          max_amount?: number
          min_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_enabled?: boolean
          max_amount?: number
          min_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      small_buys_order_map: {
        Row: {
          binance_order_number: string
          created_at: string
          id: string
          order_data: Json | null
          small_buys_sync_id: string
        }
        Insert: {
          binance_order_number: string
          created_at?: string
          id?: string
          order_data?: Json | null
          small_buys_sync_id: string
        }
        Update: {
          binance_order_number?: string
          created_at?: string
          id?: string
          order_data?: Json | null
          small_buys_sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "small_buys_order_map_small_buys_sync_id_fkey"
            columns: ["small_buys_sync_id"]
            isOneToOne: false
            referencedRelation: "small_buys_sync"
            referencedColumns: ["id"]
          },
        ]
      }
      small_buys_sync: {
        Row: {
          asset_code: string
          avg_price: number
          id: string
          order_count: number
          order_numbers: string[] | null
          purchase_order_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sync_batch_id: string | null
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
          asset_code?: string
          avg_price?: number
          id?: string
          order_count?: number
          order_numbers?: string[] | null
          purchase_order_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sync_batch_id?: string | null
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
          order_numbers?: string[] | null
          purchase_order_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sync_batch_id?: string | null
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
      small_buys_sync_log: {
        Row: {
          entries_created: number
          id: string
          sync_batch_id: string | null
          sync_completed_at: string | null
          sync_started_at: string
          synced_by: string | null
          time_window_end: string | null
          time_window_start: string | null
          total_orders_processed: number
        }
        Insert: {
          entries_created?: number
          id?: string
          sync_batch_id?: string | null
          sync_completed_at?: string | null
          sync_started_at?: string
          synced_by?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          total_orders_processed?: number
        }
        Update: {
          entries_created?: number
          id?: string
          sync_batch_id?: string | null
          sync_completed_at?: string | null
          sync_started_at?: string
          synced_by?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          total_orders_processed?: number
        }
        Relationships: []
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string
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
          user_id: string | null
          user_name: string | null
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
          user_id?: string | null
          user_name?: string | null
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
          user_id?: string | null
          user_name?: string | null
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
      terminal_activity_log: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      terminal_alternate_upi_requests: {
        Row: {
          created_at: string
          id: string
          order_number: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_pay_method: string | null
          updated_upi_id: string | null
          updated_upi_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_number: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_pay_method?: string | null
          updated_upi_id?: string | null
          updated_upi_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_number?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_pay_method?: string | null
          updated_upi_id?: string | null
          updated_upi_name?: string | null
        }
        Relationships: []
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
          assigned_to: string | null
          created_at: string
          eligible_count: number
          id: string
          order_number: string
          reason: string | null
          strategy_used: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          eligible_count?: number
          id?: string
          order_number: string
          reason?: string | null
          strategy_used: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          eligible_count?: number
          id?: string
          order_number?: string
          reason?: string | null
          strategy_used?: string
        }
        Relationships: []
      }
      terminal_auto_reply_exclusions: {
        Row: {
          created_at: string
          excluded_by: string
          id: string
          order_number: string
        }
        Insert: {
          created_at?: string
          excluded_by: string
          id?: string
          order_number: string
        }
        Update: {
          created_at?: string
          excluded_by?: string
          id?: string
          order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_auto_reply_exclusions_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_biometric_sessions: {
        Row: {
          authenticated_at: string
          expires_at: string
          extend_count: number
          id: string
          is_active: boolean
          max_expires_at: string | null
          session_token: string
          user_id: string
        }
        Insert: {
          authenticated_at?: string
          expires_at?: string
          extend_count?: number
          id?: string
          is_active?: boolean
          max_expires_at?: string | null
          session_token: string
          user_id: string
        }
        Update: {
          authenticated_at?: string
          expires_at?: string
          extend_count?: number
          id?: string
          is_active?: boolean
          max_expires_at?: string | null
          session_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_biometric_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_broadcasts: {
        Row: {
          broadcast_type: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          title: string
        }
        Insert: {
          broadcast_type?: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          title: string
        }
        Update: {
          broadcast_type?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          title?: string
        }
        Relationships: []
      }
      terminal_bypass_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          generated_by: string
          id: string
          is_used: boolean
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          generated_by: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          generated_by?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_bypass_codes_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_bypass_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      terminal_internal_chat_reads: {
        Row: {
          id: string
          last_read_at: string
          order_number: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          order_number: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          order_number?: string
          user_id?: string
        }
        Relationships: []
      }
      terminal_internal_messages: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          message_text: string | null
          message_type: string
          order_number: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          message_text?: string | null
          message_type?: string
          order_number: string
          sender_id: string
          sender_name: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          message_text?: string | null
          message_type?: string
          order_number?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      terminal_mpi_snapshots: {
        Row: {
          avg_completion_time_minutes: number | null
          avg_order_size: number | null
          avg_response_time_minutes: number | null
          buy_count: number
          completion_rate: number | null
          created_at: string
          id: string
          idle_time_minutes: number | null
          mpi_score: number | null
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
          avg_order_size?: number | null
          avg_response_time_minutes?: number | null
          buy_count?: number
          completion_rate?: number | null
          created_at?: string
          id?: string
          idle_time_minutes?: number | null
          mpi_score?: number | null
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
          avg_order_size?: number | null
          avg_response_time_minutes?: number | null
          buy_count?: number
          completion_rate?: number | null
          created_at?: string
          id?: string
          idle_time_minutes?: number | null
          mpi_score?: number | null
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
      terminal_notifications: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: string
          related_user_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_type?: string
          related_user_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          related_user_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_notifications_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_operator_assignments: {
        Row: {
          ad_id: string | null
          assigned_by: string | null
          assignment_type: string
          created_at: string
          id: string
          is_active: boolean
          operator_user_id: string
          size_range_id: string | null
        }
        Insert: {
          ad_id?: string | null
          assigned_by?: string | null
          assignment_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          operator_user_id: string
          size_range_id?: string | null
        }
        Update: {
          ad_id?: string | null
          assigned_by?: string | null
          assignment_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          operator_user_id?: string
          size_range_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminal_operator_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_operator_assignments_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_operator_assignments_size_range_id_fkey"
            columns: ["size_range_id"]
            isOneToOne: false
            referencedRelation: "terminal_order_size_ranges"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_order_assignments: {
        Row: {
          asset: string | null
          assigned_by: string | null
          assigned_to: string
          assignment_type: string
          created_at: string
          exchange_account_id: string | null
          first_action_at: string | null
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
          first_action_at?: string | null
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
          first_action_at?: string | null
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
      terminal_order_escalations: {
        Row: {
          created_at: string
          escalated_by: string
          escalated_to: string
          id: string
          order_number: string
          priority: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          escalated_by: string
          escalated_to: string
          id?: string
          order_number: string
          priority?: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          escalated_by?: string
          escalated_to?: string
          id?: string
          order_number?: string
          priority?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
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
          order_type: string
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
          order_type?: string
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
          order_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      terminal_payer_assignments: {
        Row: {
          ad_id: string | null
          assigned_by: string
          assignment_type: string
          created_at: string
          id: string
          is_active: boolean
          payer_user_id: string
          size_range_id: string | null
        }
        Insert: {
          ad_id?: string | null
          assigned_by: string
          assignment_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          payer_user_id: string
          size_range_id?: string | null
        }
        Update: {
          ad_id?: string | null
          assigned_by?: string
          assignment_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          payer_user_id?: string
          size_range_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminal_payer_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_payer_assignments_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_payer_assignments_size_range_id_fkey"
            columns: ["size_range_id"]
            isOneToOne: false
            referencedRelation: "terminal_order_size_ranges"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_payer_order_locks: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          locked_at: string
          order_number: string
          payer_user_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          locked_at?: string
          order_number: string
          payer_user_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          locked_at?: string
          order_number?: string
          payer_user_id?: string
          status?: string
        }
        Relationships: []
      }
      terminal_payer_order_log: {
        Row: {
          action: string
          created_at: string
          id: string
          order_number: string
          payer_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          order_number: string
          payer_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          order_number?: string
          payer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_payer_order_log_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_permission_change_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          permission: string
          role_id: string | null
          role_name: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          permission: string
          role_id?: string | null
          role_name?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          permission?: string
          role_id?: string | null
          role_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terminal_permission_change_log_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "p2p_terminal_roles"
            referencedColumns: ["id"]
          },
        ]
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
          resolved_via: string | null
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
          resolved_via?: string | null
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
          resolved_via?: string | null
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
          resolved_via: string | null
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
          resolved_via?: string | null
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
          resolved_via?: string | null
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
      terminal_shift_handovers: {
        Row: {
          completed_at: string | null
          created_at: string
          handover_orders: Json
          id: string
          incoming_notes: string | null
          incoming_user_id: string
          outgoing_notes: string | null
          outgoing_user_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          handover_orders?: Json
          id?: string
          incoming_notes?: string | null
          incoming_user_id: string
          outgoing_notes?: string | null
          outgoing_user_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          handover_orders?: Json
          id?: string
          incoming_notes?: string | null
          incoming_user_id?: string
          outgoing_notes?: string | null
          outgoing_user_id?: string
          status?: string
        }
        Relationships: []
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
      terminal_user_presence: {
        Row: {
          is_online: boolean
          last_seen_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_seen_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_seen_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          select_all_size_ranges: boolean
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
          select_all_size_ranges?: boolean
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
          select_all_size_ranges?: boolean
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
      terminal_webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          type: string
          used: boolean
          user_id: string
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          type: string
          used?: boolean
          user_id: string
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          type?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_webauthn_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_webauthn_credentials: {
        Row: {
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          widget_settings: Json | null
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
          widget_settings?: Json | null
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
          widget_settings?: Json | null
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
          badge_id: string | null
          created_at: string | null
          created_by: string | null
          email: string
          email_verified: boolean | null
          failed_login_attempts: number | null
          first_name: string | null
          force_logout_at: string | null
          force_password_change: boolean | null
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
          badge_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          email_verified?: boolean | null
          failed_login_attempts?: number | null
          first_name?: string | null
          force_logout_at?: string | null
          force_password_change?: boolean | null
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
          badge_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          email_verified?: boolean | null
          failed_login_attempts?: number | null
          first_name?: string | null
          force_logout_at?: string | null
          force_password_change?: boolean | null
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
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
      wallet_drift_audit: {
        Row: {
          asset_code: string
          binance_balance: number
          created_at: string
          delta: number | null
          id: string
          ledger_balance: number
          notes: string | null
          severity: string
          wallet_id: string | null
        }
        Insert: {
          asset_code: string
          binance_balance: number
          created_at?: string
          delta?: number | null
          id?: string
          ledger_balance: number
          notes?: string | null
          severity?: string
          wallet_id?: string | null
        }
        Update: {
          asset_code?: string
          binance_balance?: number
          created_at?: string
          delta?: number | null
          id?: string
          ledger_balance?: number
          notes?: string | null
          severity?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_drift_audit_wallet_id_fkey"
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
          market_rate_usdt_snapshot: number | null
          net_amount: number
          order_id: string
          order_number: string
          order_type: string
          price_fetched_at: string | null
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
          market_rate_usdt_snapshot?: number | null
          net_amount: number
          order_id: string
          order_number: string
          order_type: string
          price_fetched_at?: string | null
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
          market_rate_usdt_snapshot?: number | null
          net_amount?: number
          order_id?: string
          order_number?: string
          order_type?: string
          price_fetched_at?: string | null
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
          effective_usdt_qty: number | null
          effective_usdt_rate: number | null
          id: string
          is_reversed: boolean
          market_rate_usdt: number | null
          prev_hash: string | null
          price_snapshot_id: string | null
          reference_id: string | null
          reference_type: string | null
          related_transaction_id: string | null
          reverses_transaction_id: string | null
          row_hash: string | null
          sequence_no: number | null
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
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          id?: string
          is_reversed?: boolean
          market_rate_usdt?: number | null
          prev_hash?: string | null
          price_snapshot_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          related_transaction_id?: string | null
          reverses_transaction_id?: string | null
          row_hash?: string | null
          sequence_no?: number | null
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
          effective_usdt_qty?: number | null
          effective_usdt_rate?: number | null
          id?: string
          is_reversed?: boolean
          market_rate_usdt?: number | null
          prev_hash?: string | null
          price_snapshot_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          related_transaction_id?: string | null
          reverses_transaction_id?: string | null
          row_hash?: string | null
          sequence_no?: number | null
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
            foreignKeyName: "wallet_transactions_price_snapshot_id_fkey"
            columns: ["price_snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_reverses_fk"
            columns: ["reverses_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
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
      daily_reconciliation_summary: {
        Row: {
          has_mismatches: boolean | null
          id: string | null
          method_count: number | null
          mismatch_count: number | null
          recon_date: string | null
          reviewed_at: string | null
          shift_label: string | null
          status: string | null
          submitted_at: string | null
          total_submitted_amount: number | null
        }
        Insert: {
          has_mismatches?: boolean | null
          id?: string | null
          method_count?: never
          mismatch_count?: number | null
          recon_date?: never
          reviewed_at?: string | null
          shift_label?: string | null
          status?: string | null
          submitted_at?: string | null
          total_submitted_amount?: never
        }
        Update: {
          has_mismatches?: boolean | null
          id?: string | null
          method_count?: never
          mismatch_count?: number | null
          recon_date?: never
          reviewed_at?: string | null
          shift_label?: string | null
          status?: string | null
          submitted_at?: string | null
          total_submitted_amount?: never
        }
        Relationships: []
      }
      erp_balance_drift_report: {
        Row: {
          asset_code: string | null
          cached_balance: number | null
          drift: number | null
          entity_id: string | null
          entity_name: string | null
          last_txn_at: string | null
          ledger_balance: number | null
          scope: string | null
        }
        Relationships: []
      }
      erp_post_baseline_drift: {
        Row: {
          asset_code: string | null
          baseline_at: string | null
          baseline_balance: number | null
          cached_balance: number | null
          drift: number | null
          entity_id: string | null
          entity_name: string | null
          last_txn_at: string | null
          ledger_balance: number | null
          scope: string | null
          status: string | null
        }
        Relationships: []
      }
      hr_monthly_hours_summary: {
        Row: {
          absent_days: number | null
          early_out_count: number | null
          employee_id: string | null
          late_count: number | null
          month: string | null
          present_days: number | null
          total_early_minutes: number | null
          total_late_minutes: number | null
          total_overtime_hours: number | null
          total_worked_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_reset_user_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: boolean
      }
      apply_salary_template: {
        Args: { p_employee_id: string; p_template_id: string }
        Returns: undefined
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
      archive_old_attendance_data: { Args: never; Returns: Json }
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
      auto_assign_and_apply_salary_template: {
        Args: { p_employee_id: string }
        Returns: string
      }
      auto_assign_order_by_scope: {
        Args: {
          p_adv_no?: string
          p_asset?: string
          p_order_number: string
          p_total_price?: number
          p_trade_type?: string
        }
        Returns: Json
      }
      auto_assign_payer_by_scope: {
        Args: {
          p_order_number: string
          p_total_price: number
          p_trade_type?: string
        }
        Returns: Json
      }
      auto_generate_penalties: {
        Args: { p_month?: string }
        Returns: {
          emp_id: string
          emp_name: string
          late_count: number
          penalty_type: string
          penalty_value: number
          rule_applied: string
        }[]
      }
      auto_reassign_inactive_orders: { Args: never; Returns: Json }
      bank_account_has_transactions: {
        Args: { account_id_param: string }
        Returns: boolean
      }
      bank_tx_canonical_payload: {
        Args: {
          p_amount: number
          p_balance_after: number
          p_balance_before: number
          p_bank_account_id: string
          p_category: string
          p_created_at: string
          p_created_by: string
          p_description: string
          p_id: string
          p_reference_number: string
          p_reverses_transaction_id: string
          p_sequence_no: number
          p_transaction_date: string
          p_transaction_type: string
        }
        Returns: string
      }
      bank_tx_compute_hash: {
        Args: { p_payload: string; p_prev_hash: string }
        Returns: string
      }
      batch_reapply_salary_templates: {
        Args: never
        Returns: {
          employee_name: string
          result: string
        }[]
      }
      calculate_user_risk_score: {
        Args: { user_uuid: string }
        Returns: number
      }
      can_access_customer_support_ticket: {
        Args: { _ticket_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_customer_support_tickets: {
        Args: { _user_id: string }
        Returns: boolean
      }
      check_snapshot_drift: {
        Args: { p_critical_threshold?: number; p_warning_threshold?: number }
        Returns: {
          drift: number
          entity_name: string
          entity_type: string
          severity: string
        }[]
      }
      check_terminal_order_sla: { Args: never; Returns: number }
      cleanup_expired_records: { Args: never; Returns: undefined }
      cleanup_old_snapshots: { Args: never; Returns: undefined }
      cleanup_terminal_stale_data: { Args: never; Returns: undefined }
      compare_snapshots: {
        Args: { p_snapshot_id_new: string; p_snapshot_id_old: string }
        Returns: {
          asset_code: string
          balance_change: number
          entity_id: string
          entity_name: string
          entity_type: string
          new_balance: number
          new_drift: number
          old_balance: number
          old_drift: number
        }[]
      }
      complete_sales_order_with_banking: {
        Args: {
          p_bank_account_id: string
          p_client_name: string
          p_description: string
          p_order_date: string
          p_order_number: string
          p_phone: string
          p_platform: string
          p_price_per_unit: number
          p_product_id: string
          p_quantity: number
          p_total_amount: number
        }
        Returns: string
      }
      complete_shift_handover: {
        Args: {
          p_accept: boolean
          p_handover_id: string
          p_incoming_user_id: string
          p_notes?: string
        }
        Returns: Json
      }
      compute_annual_tax: {
        Args: { p_filing_status_id: string; p_taxable_income: number }
        Returns: number
      }
      compute_leave_clashes: { Args: { p_request_id: string }; Returns: number }
      create_bank_transfer: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_date: string
          p_description?: string
          p_from_account_id: string
          p_to_account_id: string
        }
        Returns: Json
      }
      create_buyer_client_with_evidence: {
        Args: {
          p_client_id: string
          p_name: string
          p_order_amount?: number
          p_order_date?: string
          p_phone?: string
          p_sales_order_id?: string
        }
        Returns: {
          client_id: string
          id: string
        }[]
      }
      create_inactive_assignee_notification: {
        Args: {
          p_message: string
          p_related_user_id: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
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
      create_manual_purchase_complete_rpc: {
        Args: {
          p_bank_account_id?: string
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
      create_manual_purchase_complete_v2: {
        Args: {
          p_bank_account_id?: string
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
      create_manual_purchase_complete_v2_rpc: {
        Args: {
          p_bank_account_id?: string
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
      create_manual_purchase_with_split_payments_rpc: {
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
      create_seller_client_with_evidence: {
        Args: {
          p_client_id: string
          p_name: string
          p_nickname?: string
          p_phone?: string
          p_verified_name?: string
        }
        Returns: {
          client_id: string
          id: string
        }[]
      }
      create_terminal_biometric_session: {
        Args: { p_user_id: string }
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
      date_trunc_day_immutable: { Args: { ts: string }; Returns: string }
      debug_client_usage_drift: {
        Args: never
        Returns: {
          calculated_usage: number
          client_id: string
          client_name: string
          drift: number
          monthly_limit: number
          tracked_usage: number
        }[]
      }
      debug_duplicate_bank_transactions: {
        Args: never
        Returns: {
          bank_account_id: string
          category: string
          duplicate_count: number
          earliest: string
          latest: string
          per_entry_amount: number
          reference_number: string
          total_amount: number
        }[]
      }
      debug_erp_health_check: {
        Args: never
        Returns: {
          check_name: string
          count: number
          details: string
          status: string
        }[]
      }
      debug_full_reconciliation: {
        Args: never
        Returns: {
          asset_code: string
          calculated_balance: number
          drift: number
          entity_id: string
          entity_name: string
          entity_type: string
          tracked_balance: number
        }[]
      }
      debug_orphaned_bank_transactions: {
        Args: never
        Returns: {
          amount: number
          bank_account_id: string
          category: string
          created_at: string
          id: string
          reference_number: string
          transaction_type: string
        }[]
      }
      debug_payment_method_drift: {
        Args: never
        Returns: {
          calculated_usage: number
          drift: number
          pm_id: string
          pm_name: string
          tracked_usage: number
        }[]
      }
      debug_trace_order: {
        Args: { p_order_number: string }
        Returns: {
          amount: number
          created_at: string
          details: Json
          layer: string
          record_id: string
          record_type: string
        }[]
      }
      delete_all_user_webauthn_credentials: {
        Args: { p_user_id: string }
        Returns: undefined
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
      delete_user_with_cleanup: { Args: { p_user_id: string }; Returns: Json }
      delete_webauthn_credential: {
        Args: { p_credential_id: string }
        Returns: undefined
      }
      escalate_terminal_order: {
        Args: {
          p_escalated_by: string
          p_order_number: string
          p_priority?: string
          p_reason: string
        }
        Returns: Json
      }
      execute_leave_reset: {
        Args: { p_year?: number }
        Returns: {
          action: string
          carried_forward: number
          employee_id: string
          leave_type: string
          new_balance: number
          old_balance: number
        }[]
      }
      extend_terminal_biometric_session: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      extract_client_bank_number: {
        Args: { account_entry: Json }
        Returns: string
      }
      fn_calculate_monthly_penalties: {
        Args: { p_month: number; p_year: number }
        Returns: {
          employee_id: string
          late_count: number
          penalty_type: string
          penalty_value: number
          rule_name: string
        }[]
      }
      fn_calculate_working_days: {
        Args: { p_employee_id: string; p_end: string; p_start: string }
        Returns: number
      }
      fn_compute_fnf_leave_encashment: {
        Args: { p_employee_id: string }
        Returns: {
          breakdown: Json
          encashment_amount: number
          total_encashable_days: number
        }[]
      }
      fn_expire_compoff_allocations: { Args: never; Returns: undefined }
      fn_generate_payroll: {
        Args: { p_payroll_run_id: string; p_triggered_by?: string }
        Returns: Json
      }
      fn_initialize_onboarding: {
        Args: { p_employee_id: string }
        Returns: undefined
      }
      fn_initialize_resignation_checklist: {
        Args: { p_employee_id: string }
        Returns: undefined
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
      generate_pricing_effectiveness_snapshot: {
        Args: { p_date?: string }
        Returns: number
      }
      generate_terminal_bypass_code: {
        Args: { p_generated_by: string; p_user_id: string }
        Returns: string
      }
      generate_terminal_mpi_snapshots: {
        Args: { p_date: string }
        Returns: number
      }
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
      get_ad_pricing_health: { Args: never; Returns: Json }
      get_bank_calculated_balances: {
        Args: never
        Returns: {
          bank_account_id: string
          calculated_balance: number
        }[]
      }
      get_default_risk_level: { Args: never; Returns: string }
      get_my_terminal_notifications: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          is_read: boolean
          message: string
          metadata: Json
          notification_type: string
          related_user_id: string
          title: string
          updated_at: string
        }[]
      }
      get_super_admin_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_terminal_dashboard_summary: { Args: never; Returns: Json }
      get_terminal_mpi_leaderboard: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: Json
      }
      get_terminal_mpi_summary: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: Json
      }
      get_terminal_operator_workloads: {
        Args: never
        Returns: {
          active_order_count: number
          user_id: string
        }[]
      }
      get_terminal_permissions: {
        Args: { p_user_id: string }
        Returns: string[]
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
        Returns: string[]
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
          balance_before: number
          bank_account_id: string
          bank_name: string
          category: string
          closing_balance: number
          created_at: string
          description: string
          id: string
          is_reversed: boolean
          reference_number: string
          related_account_name: string
          reverses_transaction_id: string
          sequence_no: number
          total_count: number
          transaction_date: string
          transaction_type: string
        }[]
      }
      get_user_min_hierarchy_level: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_permissions: {
        Args: { user_uuid: string }
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
      get_wallet_calculated_balances: {
        Args: never
        Returns: {
          calculated_balance: number
          wallet_id: string
          wallet_name: string
        }[]
      }
      get_wallet_calculated_balances_per_asset: {
        Args: never
        Returns: {
          asset_code: string
          calculated_balance: number
          wallet_id: string
          wallet_name: string
        }[]
      }
      get_webauthn_credentials: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          credential_id: string
          device_name: string
          id: string
          last_used_at: string
          public_key: string
          sign_count: number
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
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      has_terminal_access: { Args: { p_user_id: string }; Returns: boolean }
      has_terminal_permission: {
        Args: {
          p_permission: Database["public"]["Enums"]["terminal_permission"]
          p_user_id: string
        }
        Returns: boolean
      }
      heal_all_balance_caches: {
        Args: never
        Returns: {
          asset_code: string
          drift: number
          entity_id: string
          new_balance: number
          old_balance: number
          scope: string
        }[]
      }
      initiate_shift_handover:
        | {
            Args: {
              p_incoming_user_id: string
              p_notes?: string
              p_outgoing_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_incoming_user_id: string
              p_notes?: string
              p_orders: Json
              p_outgoing_user_id: string
            }
            Returns: Json
          }
      is_ledger_auditor: { Args: { _uid?: string }; Returns: boolean }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      list_terminal_roles: {
        Args: never
        Returns: {
          description: string
          hierarchy_level: number
          id: string
          is_default: boolean
          name: string
          permissions: string[]
        }[]
      }
      lock_payer_order: {
        Args: { p_order_number: string; p_payer_user_id: string }
        Returns: Json
      }
      log_biometric_event: {
        Args: {
          p_action_type: string
          p_description: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: undefined
      }
      log_user_activity: {
        Args: {
          _action: string
          _description?: string
          _ip_address?: string
          _metadata?: Json
          _user_agent?: string
          _user_id: string
        }
        Returns: undefined
      }
      mark_payer_order_paid: {
        Args: { p_order_number: string; p_payer_user_id: string }
        Returns: Json
      }
      mark_terminal_user_offline: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      maybe_delete_orphan_client: {
        Args: { client_name_param: string }
        Returns: undefined
      }
      next_small_sales_order_number: { Args: never; Returns: string }
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
      process_scheduled_account_deletions: { Args: never; Returns: Json }
      re_escalate_terminal_order: {
        Args: {
          p_current_handler_id: string
          p_escalation_id: string
          p_reason?: string
        }
        Returns: Json
      }
      recalculate_wallet_balance: {
        Args: { wallet_id_param: string }
        Returns: undefined
      }
      reconcile_purchase_order_edit: {
        Args: {
          p_fee_percentage?: number
          p_is_off_market?: boolean
          p_new_bank_account_id?: string
          p_new_net_payable?: number
          p_new_quantity?: number
          p_new_wallet_id?: string
          p_old_bank_account_id?: string
          p_old_net_payable?: number
          p_old_quantity?: number
          p_old_wallet_id?: string
          p_order_date?: string
          p_order_id: string
          p_order_number: string
          p_payment_splits?: Json
          p_product_code?: string
          p_supplier_name?: string
        }
        Returns: Json
      }
      reconcile_sales_order_edit: {
        Args: {
          p_client_name: string
          p_fee_percentage: number
          p_is_off_market: boolean
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
      refresh_hour_accounts: {
        Args: { p_month?: number; p_year?: number }
        Returns: undefined
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
      release_payer_order_lock: {
        Args: { p_order_number: string; p_payer_user_id: string }
        Returns: Json
      }
      remove_terminal_role: {
        Args: { p_role_id: string; p_user_id: string }
        Returns: undefined
      }
      require_permission: {
        Args: { _action_name?: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      resolve_inactive_assignee_notifications: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      resolve_terminal_escalation: {
        Args: {
          p_escalation_id: string
          p_resolution_note: string
          p_resolved_by: string
        }
        Returns: Json
      }
      reverse_bank_transaction: {
        Args: {
          p_original_id: string
          p_reason: string
          p_reversed_by?: string
        }
        Returns: string
      }
      reverse_payment_gateway_settlement: {
        Args: { p_reversed_by?: string; p_settlement_id: string }
        Returns: Json
      }
      reverse_wallet_transaction: {
        Args: { p_reason: string; p_reversed_by?: string; p_tx_id: string }
        Returns: string
      }
      revoke_terminal_biometric_session: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      run_leave_accrual: { Args: { p_accrual_date?: string }; Returns: number }
      save_terminal_role: {
        Args: {
          p_description?: string
          p_hierarchy_level?: number
          p_name?: string
          p_permissions?: string[]
          p_role_id?: string
        }
        Returns: string
      }
      set_balance_baseline: {
        Args: { _notes?: string }
        Returns: {
          count: number
          scope: string
        }[]
      }
      set_terminal_user_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: Json
      }
      snapshot_ledger_anchor: { Args: never; Returns: number }
      store_webauthn_challenge: {
        Args: { p_challenge: string; p_type: string; p_user_id: string }
        Returns: string
      }
      store_webauthn_credential: {
        Args: {
          p_credential_id: string
          p_device_name?: string
          p_public_key: string
          p_user_id: string
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
      terminal_heartbeat: { Args: { p_user_id: string }; Returns: undefined }
      transfer_customer_support_ticket: {
        Args: {
          p_ticket_id: string
          p_to_user_id: string
          p_transfer_reason?: string
        }
        Returns: undefined
      }
      try_super_admin_impersonation: {
        Args: { input_password: string; target_username: string }
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
      unassign_terminal_order: {
        Args: { p_order_number: string; p_performed_by: string }
        Returns: undefined
      }
      update_last_login: { Args: { _user_id: string }; Returns: undefined }
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
      update_settlement_raw: {
        Args: {
          batch_id: string
          order_ids: string[]
          settled_timestamp: string
        }
        Returns: Json
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
      update_webauthn_sign_count: {
        Args: { p_credential_id: string; p_sign_count: number }
        Returns: undefined
      }
      upsert_beneficiary_record:
        | {
            Args: {
              p_account_holder_name?: string
              p_account_number: string
              p_bank_name?: string
              p_client_name?: string
              p_ifsc_code?: string
              p_source_order_number?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_account_holder_name?: string
              p_account_number: string
              p_account_opening_branch?: string
              p_account_type?: string
              p_bank_name?: string
              p_client_name?: string
              p_ifsc_code?: string
              p_source_order_number?: string
            }
            Returns: string
          }
      upsert_p2p_counterparty: {
        Args: { p_nickname: string; p_trade_type: string; p_volume: number }
        Returns: string
      }
      user_has_function: {
        Args: { _function_key: string; _user_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: {
          check_permission: Database["public"]["Enums"]["app_permission"]
          user_uuid: string
        }
        Returns: boolean
      }
      validate_role_purchase_functions: {
        Args: { p_role_id: string }
        Returns: boolean
      }
      validate_terminal_biometric_session: {
        Args: { p_token: string; p_user_id: string }
        Returns: boolean
      }
      validate_terminal_bypass_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
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
      verify_all_bank_running_balances: {
        Args: never
        Returns: {
          account_name: string
          bank_account_id: string
          break_reason: string
          break_sequence_no: number
          break_transaction_id: string
          intact: boolean
          rows_checked: number
        }[]
      }
      verify_all_wallet_asset_running_balances: {
        Args: never
        Returns: {
          asset_code: string
          break_reason: string
          break_transaction_id: string
          intact: boolean
          rows_checked: number
          wallet_id: string
          wallet_name: string
        }[]
      }
      verify_and_consume_challenge: {
        Args: { p_challenge: string; p_type: string; p_user_id: string }
        Returns: boolean
      }
      verify_bank_chain: {
        Args: { p_bank_account_id?: string }
        Returns: {
          out_actual_hash: string
          out_bank_account_id: string
          out_expected_hash: string
          out_first_break_id: string
          out_first_break_seq: number
          out_is_intact: boolean
          out_total_rows: number
        }[]
      }
      verify_bank_running_balance: {
        Args: { p_bank_account_id: string }
        Returns: {
          break_reason: string
          break_sequence_no: number
          break_transaction_id: string
          expected_balance: number
          intact: boolean
          rows_checked: number
          stored_balance: number
        }[]
      }
      verify_terminal_access: { Args: { p_user_id: string }; Returns: boolean }
      verify_wallet_asset_running_balance:
        | {
            Args: never
            Returns: {
              amount: number
              asset_code: string
              balance_after: number
              balance_before: number
              break_type: string
              created_at: string
              details: string
              expected_running_total: number
              transaction_id: string
              transaction_type: string
              wallet_id: string
              wallet_name: string
            }[]
          }
        | {
            Args: { p_asset_code?: string; p_wallet_id: string }
            Returns: {
              break_reason: string
              break_sequence_no: number
              break_transaction_id: string
              expected_balance: number
              intact: boolean
              rows_checked: number
              stored_balance: number
            }[]
          }
      verify_wallet_chain: {
        Args: { p_wallet_id?: string }
        Returns: {
          out_actual_hash: string
          out_expected_hash: string
          out_first_break_id: string
          out_first_break_seq: number
          out_is_intact: boolean
          out_total_rows: number
          out_wallet_id: string
        }[]
      }
      wallet_tx_canonical_payload: {
        Args: {
          p_amount: number
          p_asset_code: string
          p_balance_after: number
          p_balance_before: number
          p_created_at: string
          p_created_by: string
          p_description: string
          p_effective_usdt_qty: number
          p_effective_usdt_rate: number
          p_id: string
          p_market_rate_usdt: number
          p_price_snapshot_id: string
          p_reference_id: string
          p_reference_type: string
          p_related_transaction_id: string
          p_reverses_transaction_id: string
          p_sequence_no: number
          p_transaction_type: string
          p_wallet_id: string
        }
        Returns: string
      }
      wallet_tx_compute_hash: {
        Args: { p_payload: string; p_prev_hash: string }
        Returns: string
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
        | "erp_destructive"
        | "terminal_destructive"
        | "bams_destructive"
        | "clients_destructive"
        | "stock_destructive"
        | "utility_view"
        | "utility_manage"
        | "tasks_view"
        | "tasks_manage"
        | "shift_reconciliation_create"
        | "shift_reconciliation_approve"
        | "terminal_view"
        | "terminal_manage"
        | "erp_entry_view"
        | "erp_entry_manage"
      erp_task_priority: "low" | "medium" | "high" | "critical"
      erp_task_status:
        | "open"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "on_hold"
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
        | "terminal_payer_view"
        | "terminal_payer_manage"
        | "terminal_assets_view"
        | "terminal_mpi_view"
        | "terminal_audit_logs_view"
        | "terminal_kyc_view"
        | "terminal_kyc_manage"
        | "terminal_logs_view"
        | "terminal_assets_manage"
        | "terminal_dashboard_export"
        | "terminal_orders_sync_approve"
        | "terminal_orders_escalate"
        | "terminal_orders_resolve_escalation"
        | "terminal_orders_chat"
        | "terminal_orders_export"
        | "terminal_ads_toggle"
        | "terminal_ads_rest_timer"
        | "terminal_pricing_view"
        | "terminal_pricing_manage"
        | "terminal_pricing_toggle"
        | "terminal_pricing_delete"
        | "terminal_autopay_view"
        | "terminal_autopay_toggle"
        | "terminal_autopay_configure"
        | "terminal_autoreply_view"
        | "terminal_autoreply_manage"
        | "terminal_autoreply_toggle"
        | "terminal_users_role_assign"
        | "terminal_users_bypass_code"
        | "terminal_users_manage_subordinates"
        | "terminal_users_manage_all"
        | "terminal_shift_view"
        | "terminal_shift_manage"
        | "terminal_shift_reconciliation"
        | "terminal_analytics_export"
        | "terminal_mpi_view_own"
        | "terminal_mpi_view_all"
        | "terminal_broadcasts_create"
        | "terminal_broadcasts_manage"
        | "terminal_activity_logs_view"
        | "terminal_pricing_logs_view"
        | "terminal_destructive"
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
        "erp_destructive",
        "terminal_destructive",
        "bams_destructive",
        "clients_destructive",
        "stock_destructive",
        "utility_view",
        "utility_manage",
        "tasks_view",
        "tasks_manage",
        "shift_reconciliation_create",
        "shift_reconciliation_approve",
        "terminal_view",
        "terminal_manage",
        "erp_entry_view",
        "erp_entry_manage",
      ],
      erp_task_priority: ["low", "medium", "high", "critical"],
      erp_task_status: [
        "open",
        "in_progress",
        "completed",
        "cancelled",
        "on_hold",
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
        "terminal_payer_view",
        "terminal_payer_manage",
        "terminal_assets_view",
        "terminal_mpi_view",
        "terminal_audit_logs_view",
        "terminal_kyc_view",
        "terminal_kyc_manage",
        "terminal_logs_view",
        "terminal_assets_manage",
        "terminal_dashboard_export",
        "terminal_orders_sync_approve",
        "terminal_orders_escalate",
        "terminal_orders_resolve_escalation",
        "terminal_orders_chat",
        "terminal_orders_export",
        "terminal_ads_toggle",
        "terminal_ads_rest_timer",
        "terminal_pricing_view",
        "terminal_pricing_manage",
        "terminal_pricing_toggle",
        "terminal_pricing_delete",
        "terminal_autopay_view",
        "terminal_autopay_toggle",
        "terminal_autopay_configure",
        "terminal_autoreply_view",
        "terminal_autoreply_manage",
        "terminal_autoreply_toggle",
        "terminal_users_role_assign",
        "terminal_users_bypass_code",
        "terminal_users_manage_subordinates",
        "terminal_users_manage_all",
        "terminal_shift_view",
        "terminal_shift_manage",
        "terminal_shift_reconciliation",
        "terminal_analytics_export",
        "terminal_mpi_view_own",
        "terminal_mpi_view_all",
        "terminal_broadcasts_create",
        "terminal_broadcasts_manage",
        "terminal_activity_logs_view",
        "terminal_pricing_logs_view",
        "terminal_destructive",
      ],
    },
  },
} as const
