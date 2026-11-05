export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_audit_log: {
        Row: {
          created_at: string
          event: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_state: {
        Row: {
          cart: Json
          prefs: Json
          tombstones: Json
          updated_at: string
          user_id: string
          wishlist: Json
        }
        Insert: {
          cart?: Json
          prefs?: Json
          tombstones?: Json
          updated_at?: string
          user_id: string
          wishlist?: Json
        }
        Update: {
          cart?: Json
          prefs?: Json
          tombstones?: Json
          updated_at?: string
          user_id?: string
          wishlist?: Json
        }
        Relationships: [
          {
            foreignKeyName: "account_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          line1: string
          line2: string | null
          phone: string
          pincode: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          line1: string
          line2?: string | null
          phone: string
          pincode: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          line1?: string
          line2?: string | null
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          href: string | null
          id: string
          kind: string
          metadata: Json | null
          read_at: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string | null
          entity_type: string
          event: string
          id: string
          metadata: Json | null
          new_state: string | null
          notes: string | null
          order_id: string | null
          previous_state: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event: string
          id?: string
          metadata?: Json | null
          new_state?: string | null
          notes?: string | null
          order_id?: string | null
          previous_state?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event?: string
          id?: string
          metadata?: Json | null
          new_state?: string | null
          notes?: string | null
          order_id?: string | null
          previous_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_allocations: {
        Row: {
          allocated_at: string
          batch_id: string
          component_key: string
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          qty: number
          sale_movement_id: string | null
          state: string
          variant_id: string
        }
        Insert: {
          allocated_at?: string
          batch_id: string
          component_key?: string
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          qty: number
          sale_movement_id?: string | null
          state?: string
          variant_id: string
        }
        Update: {
          allocated_at?: string
          batch_id?: string
          component_key?: string
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          qty?: number
          sale_movement_id?: string | null
          state?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_allocations_sale_movement_id_fkey"
            columns: ["sale_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_allocations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_candle_spec: {
        Row: {
          batch_id: string
          created_at: string
          deviations: string | null
          fill_weight_actual_g: number | null
          fill_weight_target_g: number | null
          formula_snapshot: Json | null
          fragrance_add_temp_c: number | null
          fragrance_formula_code: string | null
          fragrance_formula_version: string | null
          fragrance_load_pct: number | null
          fragrance_qty: number | null
          operator_id: string | null
          pour_temp_c: number | null
          updated_at: string
          vessel_spec: string | null
          wax_formula_code: string | null
          wax_formula_version: string | null
          wax_qty: number | null
          wick_spec: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          deviations?: string | null
          fill_weight_actual_g?: number | null
          fill_weight_target_g?: number | null
          formula_snapshot?: Json | null
          fragrance_add_temp_c?: number | null
          fragrance_formula_code?: string | null
          fragrance_formula_version?: string | null
          fragrance_load_pct?: number | null
          fragrance_qty?: number | null
          operator_id?: string | null
          pour_temp_c?: number | null
          updated_at?: string
          vessel_spec?: string | null
          wax_formula_code?: string | null
          wax_formula_version?: string | null
          wax_qty?: number | null
          wick_spec?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          deviations?: string | null
          fill_weight_actual_g?: number | null
          fill_weight_target_g?: number | null
          formula_snapshot?: Json | null
          fragrance_add_temp_c?: number | null
          fragrance_formula_code?: string | null
          fragrance_formula_version?: string | null
          fragrance_load_pct?: number | null
          fragrance_qty?: number | null
          operator_id?: string | null
          pour_temp_c?: number | null
          updated_at?: string
          vessel_spec?: string | null
          wax_formula_code?: string | null
          wax_formula_version?: string | null
          wax_qty?: number | null
          wick_spec?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_candle_spec_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_candle_spec_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_code_sequences: {
        Row: {
          last_seq: number
          scope_key: string
          updated_at: string
        }
        Insert: {
          last_seq?: number
          scope_key: string
          updated_at?: string
        }
        Update: {
          last_seq?: number
          scope_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      batch_design_validations: {
        Row: {
          batch_id: string
          config_fingerprint: string
          created_at: string
          criteria: Json | null
          deviations: string | null
          id: string
          idempotency_key: string | null
          measurements: Json | null
          result: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          state: string
          superseded_by: string | null
          validated_at: string
          validated_by: string | null
          variant_id: string
        }
        Insert: {
          batch_id: string
          config_fingerprint: string
          created_at?: string
          criteria?: Json | null
          deviations?: string | null
          id?: string
          idempotency_key?: string | null
          measurements?: Json | null
          result?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          state?: string
          superseded_by?: string | null
          validated_at?: string
          validated_by?: string | null
          variant_id: string
        }
        Update: {
          batch_id?: string
          config_fingerprint?: string
          created_at?: string
          criteria?: Json | null
          deviations?: string | null
          id?: string
          idempotency_key?: string | null
          measurements?: Json | null
          result?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          state?: string
          superseded_by?: string | null
          validated_at?: string
          validated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_design_validations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_design_validations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_design_validations_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "batch_design_validations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_design_validations_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_design_validations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_material_consumption: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          material_lot_id: string
          qty_consumed: number
          uom: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          material_lot_id: string
          qty_consumed: number
          uom?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          material_lot_id?: string
          qty_consumed?: number
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_material_consumption_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_material_consumption_material_lot_id_fkey"
            columns: ["material_lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_pick_confirmations: {
        Row: {
          allocated_batch_id: string | null
          batch_id: string
          component_key: string
          confirmed_at: string
          confirmed_by: string | null
          id: string
          is_substitution: boolean
          order_id: string
          order_item_id: string
          qty: number
          reason: string | null
          variant_id: string
        }
        Insert: {
          allocated_batch_id?: string | null
          batch_id: string
          component_key?: string
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          is_substitution?: boolean
          order_id: string
          order_item_id: string
          qty: number
          reason?: string | null
          variant_id: string
        }
        Update: {
          allocated_batch_id?: string | null
          batch_id?: string
          component_key?: string
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          is_substitution?: boolean
          order_id?: string
          order_item_id?: string
          qty?: number
          reason?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_pick_confirmations_allocated_batch_id_fkey"
            columns: ["allocated_batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_pick_confirmations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_pick_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_pick_confirmations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_pick_confirmations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_pick_confirmations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_quality_checks: {
        Row: {
          approval_notes: string | null
          approved_delta: number
          batch_id: string
          check_type: string
          config_fingerprint: string | null
          created_at: string
          criteria: Json | null
          deviations: string | null
          id: string
          idempotency_key: string | null
          inspected_qty: number
          inspector_id: string | null
          measurements: Json | null
          performed_at: string | null
          rejected_delta: number
          result: string | null
          sample_destroyed_qty: number
          sample_size: number
          sampled_destroyed_delta: number
          template_id: string | null
          template_version: number | null
        }
        Insert: {
          approval_notes?: string | null
          approved_delta?: number
          batch_id: string
          check_type: string
          config_fingerprint?: string | null
          created_at?: string
          criteria?: Json | null
          deviations?: string | null
          id?: string
          idempotency_key?: string | null
          inspected_qty?: number
          inspector_id?: string | null
          measurements?: Json | null
          performed_at?: string | null
          rejected_delta?: number
          result?: string | null
          sample_destroyed_qty?: number
          sample_size?: number
          sampled_destroyed_delta?: number
          template_id?: string | null
          template_version?: number | null
        }
        Update: {
          approval_notes?: string | null
          approved_delta?: number
          batch_id?: string
          check_type?: string
          config_fingerprint?: string | null
          created_at?: string
          criteria?: Json | null
          deviations?: string | null
          id?: string
          idempotency_key?: string | null
          inspected_qty?: number
          inspector_id?: string | null
          measurements?: Json | null
          performed_at?: string | null
          rejected_delta?: number
          result?: string | null
          sample_destroyed_qty?: number
          sample_size?: number
          sampled_destroyed_delta?: number
          template_id?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_quality_checks_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quality_checks_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quality_checks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "qc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_quarantine: {
        Row: {
          actor_id: string | null
          batch_id: string
          created_at: string
          disposition: string
          id: string
          qty: number
          reason: string | null
          stock_entry_id: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          actor_id?: string | null
          batch_id: string
          created_at?: string
          disposition?: string
          id?: string
          qty: number
          reason?: string | null
          stock_entry_id?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          disposition?: string
          id?: string
          qty?: number
          reason?: string | null
          stock_entry_id?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_quarantine_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quarantine_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quarantine_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "batch_stock_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_quarantine_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_receipt_holds: {
        Row: {
          created_at: string
          id: string
          kind: string
          order_id: string | null
          qty: number
          reason: string | null
          receipt_id: string | null
          receipt_item_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          state: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          order_id?: string | null
          qty: number
          reason?: string | null
          receipt_id?: string | null
          receipt_item_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          order_id?: string | null
          qty?: number
          reason?: string | null
          receipt_id?: string | null
          receipt_item_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_receipt_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_receipt_holds_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "inventory_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_receipt_holds_receipt_item_id_fkey"
            columns: ["receipt_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_receipt_holds_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_receipt_holds_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_release_events: {
        Row: {
          batch_id: string
          id: string
          idempotency_key: string
          movement_id: string | null
          qc_revision: number | null
          qty: number
          release_seq: number
          released_at: string
          released_by: string | null
          stock_entry_id: string | null
        }
        Insert: {
          batch_id: string
          id?: string
          idempotency_key: string
          movement_id?: string | null
          qc_revision?: number | null
          qty: number
          release_seq: number
          released_at?: string
          released_by?: string | null
          stock_entry_id?: string | null
        }
        Update: {
          batch_id?: string
          id?: string
          idempotency_key?: string
          movement_id?: string | null
          qc_revision?: number | null
          qty?: number
          release_seq?: number
          released_at?: string
          released_by?: string | null
          stock_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_release_events_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_release_events_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_release_events_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_release_events_stock_entry_id_fkey"
            columns: ["stock_entry_id"]
            isOneToOne: false
            referencedRelation: "batch_stock_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_status_history: {
        Row: {
          actor_id: string | null
          batch_id: string
          created_at: string
          dimension: string
          from_state: string | null
          id: string
          reason: string | null
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          batch_id: string
          created_at?: string
          dimension: string
          from_state?: string | null
          id?: string
          reason?: string | null
          to_state: string
        }
        Update: {
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          dimension?: string
          from_state?: string | null
          id?: string
          reason?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_status_history_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_stock_entries: {
        Row: {
          actor_id: string | null
          batch_id: string
          created_at: string
          entry_type: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          movement_id: string | null
          qty: number
          reference: string | null
          source_id: string | null
          source_type: string | null
          variant_id: string
        }
        Insert: {
          actor_id?: string | null
          batch_id: string
          created_at?: string
          entry_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          movement_id?: string | null
          qty: number
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          variant_id: string
        }
        Update: {
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          movement_id?: string | null
          qty?: number
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_stock_entries_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_stock_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_stock_entries_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_stock_entries_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      blogs: {
        Row: {
          author_id: string | null
          campaign_tag: string | null
          categories: string[]
          content: string | null
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          og_image_url: string | null
          published_at: string | null
          scheduled_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          campaign_tag?: string | null
          categories?: string[]
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          campaign_tag?: string | null
          categories?: string[]
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blogs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_pages: {
        Row: {
          bundle_key: string
          draft: Json | null
          published: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          bundle_key?: string
          draft?: Json | null
          published?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          bundle_key?: string
          draft?: Json | null
          published?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_rules: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          id: string
          name: string
          priority: number
          trigger: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          priority?: number
          trigger: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          priority?: number
          trigger?: string
        }
        Relationships: []
      }
      cart: {
        Row: {
          abandoned_email_1_sent: boolean
          abandoned_email_2_sent: boolean
          abandoned_email_3_sent: boolean
          created_at: string
          email: string | null
          id: string
          items: Json
          last_activity_at: string
          session_id: string | null
          subtotal: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abandoned_email_1_sent?: boolean
          abandoned_email_2_sent?: boolean
          abandoned_email_3_sent?: boolean
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          last_activity_at?: string
          session_id?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abandoned_email_1_sent?: boolean
          abandoned_email_2_sent?: boolean
          abandoned_email_3_sent?: boolean
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          last_activity_at?: string
          session_id?: string | null
          subtotal?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          default_gst_rate: number
          default_hsn_code: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sku_prefix: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_gst_rate?: number
          default_hsn_code: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sku_prefix: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_gst_rate?: number
          default_hsn_code?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sku_prefix?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      cms_locks: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          locked_at: string
          resource_key: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          locked_at?: string
          resource_key: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          locked_at?: string
          resource_key?: string
        }
        Relationships: []
      }
      cms_page_revisions: {
        Row: {
          actor_id: string | null
          created_at: string
          eyebrow: string | null
          id: string
          intro: string | null
          publish_at: string | null
          sections: Json
          seo: Json
          slug: string
          status: string
          title: string
          unpublish_at: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          eyebrow?: string | null
          id?: string
          intro?: string | null
          publish_at?: string | null
          sections?: Json
          seo?: Json
          slug: string
          status?: string
          title: string
          unpublish_at?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          eyebrow?: string | null
          id?: string
          intro?: string | null
          publish_at?: string | null
          sections?: Json
          seo?: Json
          slug?: string
          status?: string
          title?: string
          unpublish_at?: string | null
        }
        Relationships: []
      }
      cms_pages: {
        Row: {
          created_at: string
          eyebrow: string | null
          form_config: Json
          id: string
          intro: string | null
          publish_at: string | null
          sections: Json
          seo: Json
          slug: string
          status: string
          title: string
          unpublish_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          eyebrow?: string | null
          form_config?: Json
          id?: string
          intro?: string | null
          publish_at?: string | null
          sections?: Json
          seo?: Json
          slug: string
          status?: string
          title: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          eyebrow?: string | null
          form_config?: Json
          id?: string
          intro?: string | null
          publish_at?: string | null
          sections?: Json
          seo?: Json
          slug?: string
          status?: string
          title?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cms_revisions: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          label: string | null
          resource_key: string
          resource_type: string
          snapshot: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          resource_key: string
          resource_type: string
          snapshot: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          resource_key?: string
          resource_type?: string
          snapshot?: Json
        }
        Relationships: []
      }
      collections: {
        Row: {
          air_chapter: Json | null
          chapter_content: Json | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          hero_mobile_url: string | null
          hero_product_id: string | null
          id: string
          intro: string | null
          is_active: boolean
          is_coming_soon: boolean
          name: string
          poetic_line: string | null
          seo_canonical: string | null
          seo_description: string | null
          seo_og_image: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          story_long: string | null
          tagline: string | null
          updated_at: string
          volume: string | null
        }
        Insert: {
          air_chapter?: Json | null
          chapter_content?: Json | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hero_mobile_url?: string | null
          hero_product_id?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          is_coming_soon?: boolean
          name: string
          poetic_line?: string | null
          seo_canonical?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
          volume?: string | null
        }
        Update: {
          air_chapter?: Json | null
          chapter_content?: Json | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hero_mobile_url?: string | null
          hero_product_id?: string | null
          id?: string
          intro?: string | null
          is_active?: boolean
          is_coming_soon?: boolean
          name?: string
          poetic_line?: string | null
          seo_canonical?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_hero_product_id_fkey"
            columns: ["hero_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      composed_pages: {
        Row: {
          draft: Json | null
          page_key: string
          publish_at: string | null
          published: Json | null
          status: string
          unpublish_at: string | null
          updated_at: string
        }
        Insert: {
          draft?: Json | null
          page_key: string
          publish_at?: string | null
          published?: Json | null
          status?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Update: {
          draft?: Json | null
          page_key?: string
          publish_at?: string | null
          published?: Json | null
          status?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_enquiries: {
        Row: {
          admin_notes: string | null
          assignee_id: string | null
          assignee_name: string | null
          consent: boolean
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string | null
          message: string
          meta: Json
          number: string
          order_number: string | null
          phone: string | null
          source: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          consent?: boolean
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name?: string | null
          message: string
          meta?: Json
          number?: string
          order_number?: string | null
          phone?: string | null
          source?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          consent?: boolean
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string | null
          message?: string
          meta?: Json
          number?: string
          order_number?: string | null
          phone?: string | null
          source?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_enquiries_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_enquiry_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          detail: string | null
          enquiry_id: string
          id: string
          kind: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          enquiry_id: string
          id?: string
          kind: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          enquiry_id?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_enquiry_events_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "contact_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      counters: {
        Row: {
          last_number: number
          period: string
          scope: string
        }
        Insert: {
          last_number?: number
          period: string
          scope: string
        }
        Update: {
          last_number?: number
          period?: string
          scope?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          consumed_at: string | null
          coupon_code: string
          coupon_id: string | null
          created_at: string
          discount_paise: number
          email_normalized: string | null
          id: string
          identity: string
          order_id: string | null
          reason: string | null
          released_at: string | null
          reserved_at: string
          state: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          consumed_at?: string | null
          coupon_code: string
          coupon_id?: string | null
          created_at?: string
          discount_paise?: number
          email_normalized?: string | null
          id?: string
          identity: string
          order_id?: string | null
          reason?: string | null
          released_at?: string | null
          reserved_at?: string
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          consumed_at?: string | null
          coupon_code?: string
          coupon_id?: string | null
          created_at?: string
          discount_paise?: number
          email_normalized?: string | null
          id?: string
          identity?: string
          order_id?: string | null
          reason?: string | null
          released_at?: string | null
          reserved_at?: string
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_targets: {
        Row: {
          category_id: string | null
          collection_id: string | null
          coupon_id: string
          created_at: string
          id: string
          mode: string
          product_id: string | null
          product_type: string | null
          target_type: string
          variant_id: string | null
        }
        Insert: {
          category_id?: string | null
          collection_id?: string | null
          coupon_id: string
          created_at?: string
          id?: string
          mode: string
          product_id?: string | null
          product_type?: string | null
          target_type: string
          variant_id?: string | null
        }
        Update: {
          category_id?: string | null
          collection_id?: string | null
          coupon_id?: string
          created_at?: string
          id?: string
          mode?: string
          product_id?: string | null
          product_type?: string | null
          target_type?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_targets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_targets_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_targets_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_targets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_targets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          auto_apply: boolean
          code: string
          combinable: boolean
          created_at: string
          description: string | null
          eligibility: string
          exclude_sale: boolean
          expires_at: string | null
          first_order_only: boolean
          id: string
          internal_notes: string | null
          is_active: boolean
          max_discount: number | null
          max_uses: number | null
          max_uses_per_user: number | null
          min_order: number
          min_qualifying_quantity: number | null
          priority: number
          product_id: string | null
          public_description: string | null
          starts_at: string | null
          status: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          used_count: number
          user_id: string | null
          value: number
        }
        Insert: {
          auto_apply?: boolean
          code: string
          combinable?: boolean
          created_at?: string
          description?: string | null
          eligibility?: string
          exclude_sale?: boolean
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order?: number
          min_qualifying_quantity?: number | null
          priority?: number
          product_id?: string | null
          public_description?: string | null
          starts_at?: string | null
          status?: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          used_count?: number
          user_id?: string | null
          value: number
        }
        Update: {
          auto_apply?: boolean
          code?: string
          combinable?: boolean
          created_at?: string
          description?: string | null
          eligibility?: string
          exclude_sale?: boolean
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order?: number
          min_qualifying_quantity?: number | null
          priority?: number
          product_id?: string | null
          public_description?: string | null
          starts_at?: string | null
          status?: string
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          used_count?: number
          user_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_capabilities: {
        Row: {
          active: boolean
          base_cost: number | null
          courier: string
          created_at: string
          dangerous_goods_ok: boolean
          est_days: number | null
          fragile_ok: boolean
          id: string
          max_length_cm: number | null
          max_weight_kg: number | null
          pickup_sla_hrs: number | null
          provider: string
          supports_cod: boolean
          supports_insurance: boolean
          tier: string | null
          zones: string[] | null
        }
        Insert: {
          active?: boolean
          base_cost?: number | null
          courier: string
          created_at?: string
          dangerous_goods_ok?: boolean
          est_days?: number | null
          fragile_ok?: boolean
          id?: string
          max_length_cm?: number | null
          max_weight_kg?: number | null
          pickup_sla_hrs?: number | null
          provider: string
          supports_cod?: boolean
          supports_insurance?: boolean
          tier?: string | null
          zones?: string[] | null
        }
        Update: {
          active?: boolean
          base_cost?: number | null
          courier?: string
          created_at?: string
          dangerous_goods_ok?: boolean
          est_days?: number | null
          fragile_ok?: boolean
          id?: string
          max_length_cm?: number | null
          max_weight_kg?: number | null
          pickup_sla_hrs?: number | null
          provider?: string
          supports_cod?: boolean
          supports_insurance?: boolean
          tier?: string | null
          zones?: string[] | null
        }
        Relationships: []
      }
      cron_locks: {
        Row: {
          holder: string | null
          job: string
          locked_until: string
        }
        Insert: {
          holder?: string | null
          job: string
          locked_until?: string
        }
        Update: {
          holder?: string | null
          job?: string
          locked_until?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          blocks: Json | null
          draft: Json | null
          enabled: boolean
          eyebrow: string | null
          heading: string | null
          intro: string | null
          key: string
          preheader: string | null
          signoff: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          blocks?: Json | null
          draft?: Json | null
          enabled?: boolean
          eyebrow?: string | null
          heading?: string | null
          intro?: string | null
          key: string
          preheader?: string | null
          signoff?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          blocks?: Json | null
          draft?: Json | null
          enabled?: boolean
          eyebrow?: string | null
          heading?: string | null
          intro?: string | null
          key?: string
          preheader?: string | null
          signoff?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fragrance_notes: {
        Row: {
          created_at: string
          id: string
          layer: Database["public"]["Enums"]["fragrance_layer"]
          note: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          layer: Database["public"]["Enums"]["fragrance_layer"]
          note: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          layer?: Database["public"]["Enums"]["fragrance_layer"]
          note?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fragrance_notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance: number
          code: string
          created_at: string
          expiry_date: string | null
          id: string
          is_active: boolean
          message: string | null
          order_id: string | null
          original_amount: number
          purchaser_user_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          updated_at: string
          used_amount: number
        }
        Insert: {
          balance: number
          code: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          order_id?: string | null
          original_amount: number
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          updated_at?: string
          used_amount?: number
        }
        Update: {
          balance?: number
          code?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          order_id?: string | null
          original_amount?: number
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          updated_at?: string
          used_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_purchaser_user_id_fkey"
            columns: ["purchaser_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_banners: {
        Row: {
          attribution: string | null
          bg_color: string | null
          copy_text: string | null
          created_at: string
          cta_text: string | null
          cta_url: string | null
          extra: Json | null
          heading: string | null
          id: string
          image_url: string | null
          is_active: boolean
          label: string | null
          quote_text: string | null
          slot_key: string
          sort_order: number
          subtext: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attribution?: string | null
          bg_color?: string | null
          copy_text?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          extra?: Json | null
          heading?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          label?: string | null
          quote_text?: string | null
          slot_key: string
          sort_order?: number
          subtext?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attribution?: string | null
          bg_color?: string | null
          copy_text?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          extra?: Json | null
          heading?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          label?: string | null
          quote_text?: string | null
          slot_key?: string
          sort_order?: number
          subtext?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homepage_banners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          incident_id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          incident_id: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          incident_id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "incident_checklist_items_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_escalations: {
        Row: {
          age_minutes: number
          channels: string
          created_at: string
          id: string
          incident_id: string
          level: number
          reason: string
          target_role: string
        }
        Insert: {
          age_minutes: number
          channels: string
          created_at?: string
          id?: string
          incident_id: string
          level: number
          reason: string
          target_role: string
        }
        Update: {
          age_minutes?: number
          channels?: string
          created_at?: string
          id?: string
          incident_id?: string
          level?: number
          reason?: string
          target_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_escalations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_history: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          incident_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          incident_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_history_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          id: string
          incident_id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          incident_id: string
          note: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_notes_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_notifications: {
        Row: {
          added_at: string
          alert_key: string
          id: string
          incident_id: string
          order_number: string | null
          resolved_at: string | null
          severity: string | null
        }
        Insert: {
          added_at?: string
          alert_key: string
          id?: string
          incident_id: string
          order_number?: string | null
          resolved_at?: string | null
          severity?: string | null
        }
        Update: {
          added_at?: string
          alert_key?: string
          id?: string
          incident_id?: string
          order_number?: string | null
          resolved_at?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_notifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_participants: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          role: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          role?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          role?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_participants_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_postmortems: {
        Row: {
          generated_at: string
          generated_by: string | null
          id: string
          impact: string | null
          incident_id: string
          lessons: string | null
          resolution: string | null
          root_cause: string | null
          summary: string | null
          timeline: Json | null
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          impact?: string | null
          incident_id: string
          lessons?: string | null
          resolution?: string | null
          root_cause?: string | null
          summary?: string | null
          timeline?: Json | null
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          impact?: string | null
          incident_id?: string
          lessons?: string | null
          resolution?: string | null
          root_cause?: string | null
          summary?: string | null
          timeline?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_postmortems_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_runbook_steps: {
        Row: {
          action: string | null
          created_at: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          incident_id: string
          instruction: string | null
          step_no: number
          title: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          incident_id: string
          instruction?: string | null
          step_no: number
          title: string
        }
        Update: {
          action?: string | null
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          incident_id?: string
          instruction?: string | null
          step_no?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_runbook_steps_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_suppression_rules: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          ends_at: string | null
          id: string
          reason: string
          reason_pattern: string | null
          root_cause_system: string | null
          starts_at: string | null
          subsystem: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          ends_at?: string | null
          id?: string
          reason: string
          reason_pattern?: string | null
          root_cause_system?: string | null
          starts_at?: string | null
          subsystem?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          ends_at?: string | null
          id?: string
          reason?: string
          reason_pattern?: string | null
          root_cause_system?: string | null
          starts_at?: string | null
          subsystem?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          affected_notifications: number
          affected_orders: number
          assignee_id: string | null
          assignee_name: string | null
          assignment_reason: string | null
          category: string
          confidence: number | null
          confidence_reasons: Json | null
          created_at: string
          description: string | null
          detected_at: string | null
          dismiss_reason: string | null
          dismissed_at: string | null
          escalation_level: number
          false_positive: boolean
          id: string
          impact_computed_at: string | null
          impact_cost: number | null
          impact_customers: number | null
          impact_level: string | null
          impact_orders: number | null
          impact_refund_value: number | null
          impact_revenue: number | null
          impact_shipments_delayed: number | null
          is_simulation: boolean
          kb_resolution: string | null
          last_activity_at: string
          merged_into_id: string | null
          number: string
          owner_id: string | null
          owner_name: string | null
          parent_incident_id: string | null
          prevention: string | null
          priority: string | null
          reclassified_from: string | null
          recovery_at: string | null
          resolution_notes: string | null
          resolved_at: string | null
          root_cause: string | null
          root_cause_system: string | null
          rule_id: string | null
          severity: string
          severity_locked: boolean
          sla_breached: boolean
          sla_breached_at: string | null
          sla_due_at: string | null
          sla_target_min: number | null
          snoozed_until: string | null
          source_system: string | null
          split_from_id: string | null
          started_at: string
          status: string
          subsystem: string | null
          team: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_notifications?: number
          affected_orders?: number
          assignee_id?: string | null
          assignee_name?: string | null
          assignment_reason?: string | null
          category: string
          confidence?: number | null
          confidence_reasons?: Json | null
          created_at?: string
          description?: string | null
          detected_at?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          escalation_level?: number
          false_positive?: boolean
          id?: string
          impact_computed_at?: string | null
          impact_cost?: number | null
          impact_customers?: number | null
          impact_level?: string | null
          impact_orders?: number | null
          impact_refund_value?: number | null
          impact_revenue?: number | null
          impact_shipments_delayed?: number | null
          is_simulation?: boolean
          kb_resolution?: string | null
          last_activity_at?: string
          merged_into_id?: string | null
          number?: string
          owner_id?: string | null
          owner_name?: string | null
          parent_incident_id?: string | null
          prevention?: string | null
          priority?: string | null
          reclassified_from?: string | null
          recovery_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          root_cause_system?: string | null
          rule_id?: string | null
          severity?: string
          severity_locked?: boolean
          sla_breached?: boolean
          sla_breached_at?: string | null
          sla_due_at?: string | null
          sla_target_min?: number | null
          snoozed_until?: string | null
          source_system?: string | null
          split_from_id?: string | null
          started_at?: string
          status?: string
          subsystem?: string | null
          team?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_notifications?: number
          affected_orders?: number
          assignee_id?: string | null
          assignee_name?: string | null
          assignment_reason?: string | null
          category?: string
          confidence?: number | null
          confidence_reasons?: Json | null
          created_at?: string
          description?: string | null
          detected_at?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          escalation_level?: number
          false_positive?: boolean
          id?: string
          impact_computed_at?: string | null
          impact_cost?: number | null
          impact_customers?: number | null
          impact_level?: string | null
          impact_orders?: number | null
          impact_refund_value?: number | null
          impact_revenue?: number | null
          impact_shipments_delayed?: number | null
          is_simulation?: boolean
          kb_resolution?: string | null
          last_activity_at?: string
          merged_into_id?: string | null
          number?: string
          owner_id?: string | null
          owner_name?: string | null
          parent_incident_id?: string | null
          prevention?: string | null
          priority?: string | null
          reclassified_from?: string | null
          recovery_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          root_cause_system?: string | null
          rule_id?: string | null
          severity?: string
          severity_locked?: boolean
          sla_breached?: boolean
          sla_breached_at?: string | null
          sla_due_at?: string | null
          sla_target_min?: number | null
          snoozed_until?: string | null
          source_system?: string | null
          split_from_id?: string | null
          started_at?: string
          status?: string
          subsystem?: string | null
          team?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_parent_incident_id_fkey"
            columns: ["parent_incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_split_from_id_fkey"
            columns: ["split_from_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_gallery: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          is_featured: boolean
          link_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_featured?: boolean
          link_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_featured?: boolean
          link_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          movement_type: string
          note: string | null
          product_name_snapshot: string
          quantity_after: number
          quantity_before: number
          quantity_delta: number
          reason: string | null
          reference: string | null
          sku_snapshot: string
          source_id: string | null
          source_type: string
          variant_id: string | null
          variant_name_snapshot: string | null
          variant_ref: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          movement_type: string
          note?: string | null
          product_name_snapshot: string
          quantity_after: number
          quantity_before: number
          quantity_delta: number
          reason?: string | null
          reference?: string | null
          sku_snapshot: string
          source_id?: string | null
          source_type: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
          variant_ref: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          movement_type?: string
          note?: string | null
          product_name_snapshot?: string
          quantity_after?: number
          quantity_before?: number
          quantity_delta?: number
          reason?: string | null
          reference?: string | null
          sku_snapshot?: string
          source_id?: string | null
          source_type?: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
          variant_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipt_items: {
        Row: {
          created_at: string
          damaged_qty: number
          disposition: string | null
          expected_qty: number
          id: string
          movement_id: string | null
          product_name_snapshot: string
          receipt_id: string
          received_qty: number
          restockable_qty: number
          sku_snapshot: string
          variant_id: string | null
          variant_name_snapshot: string | null
          variant_ref: string
        }
        Insert: {
          created_at?: string
          damaged_qty?: number
          disposition?: string | null
          expected_qty: number
          id?: string
          movement_id?: string | null
          product_name_snapshot: string
          receipt_id: string
          received_qty: number
          restockable_qty?: number
          sku_snapshot: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
          variant_ref: string
        }
        Update: {
          created_at?: string
          damaged_qty?: number
          disposition?: string | null
          expected_qty?: number
          id?: string
          movement_id?: string | null
          product_name_snapshot?: string
          receipt_id?: string
          received_qty?: number
          restockable_qty?: number
          sku_snapshot?: string
          variant_id?: string | null
          variant_name_snapshot?: string | null
          variant_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_receipt_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "inventory_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipts: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          id: string
          note: string | null
          received_at: string
          received_by: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          received_at?: string
          received_by?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          received_at?: string
          received_by?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      label_print_jobs: {
        Row: {
          batch_code: string
          batch_id: string
          created_at: string
          data_snapshot: Json
          id: string
          printed_by: string | null
          printed_confirmed_at: string | null
          printed_confirmed_by: string | null
          purpose: string
          quantity: number
          status: string
          template_id: string
          template_key: string
          template_version: number
          variant_id: string | null
        }
        Insert: {
          batch_code: string
          batch_id: string
          created_at?: string
          data_snapshot: Json
          id?: string
          printed_by?: string | null
          printed_confirmed_at?: string | null
          printed_confirmed_by?: string | null
          purpose: string
          quantity: number
          status?: string
          template_id: string
          template_key: string
          template_version: number
          variant_id?: string | null
        }
        Update: {
          batch_code?: string
          batch_id?: string
          created_at?: string
          data_snapshot?: Json
          id?: string
          printed_by?: string | null
          printed_confirmed_at?: string | null
          printed_confirmed_by?: string | null
          purpose?: string
          quantity?: number
          status?: string
          template_id?: string
          template_key?: string
          template_version?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "label_print_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_print_jobs_printed_by_fkey"
            columns: ["printed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_print_jobs_printed_confirmed_by_fkey"
            columns: ["printed_confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_print_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "label_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_print_jobs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      label_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          dimensions: Json
          dimensions_status: string
          fields: Json
          id: string
          purpose: string
          template_key: string
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          dimensions_status?: string
          fields?: Json
          id?: string
          purpose: string
          template_key: string
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dimensions?: Json
          dimensions_status?: string
          fields?: Json
          id?: string
          purpose?: string
          template_key?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "label_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          browser: string | null
          country: string | null
          created_at: string
          device: string | null
          device_id: string | null
          id: string
          ip: string | null
          ip_hash: string | null
          provider: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          device_id?: string | null
          id?: string
          ip?: string | null
          ip_hash?: string | null
          provider?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          device_id?: string | null
          id?: string
          ip?: string | null
          ip_hash?: string | null
          provider?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          points_balance: number
          points_change: number
          reason: string | null
          type: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          points_balance: number
          points_change: number
          reason?: string | null
          type: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          points_balance?: number
          points_change?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_windows: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          ends_at: string
          id: string
          reason: string | null
          root_cause_system: string | null
          starts_at: string
          subsystem: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          ends_at: string
          id?: string
          reason?: string | null
          root_cause_system?: string | null
          starts_at: string
          subsystem?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          ends_at?: string
          id?: string
          reason?: string | null
          root_cause_system?: string | null
          starts_at?: string
          subsystem?: string | null
          title?: string
        }
        Relationships: []
      }
      manufacturing_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_qty: number
          batch_code: string
          batch_kind: string
          created_at: string
          created_by: string | null
          creation_idempotency_key: string | null
          cure_start_date: string | null
          earliest_release_date: string | null
          id: string
          lifecycle_status: string
          manufacturing_date: string | null
          notes: string | null
          pending_inspection_qty: number
          planned_qty: number
          produced_qty: number
          product_id: string | null
          product_type: string | null
          production_completed_at: string | null
          production_sequence: number | null
          production_started_at: string | null
          qc_revision: number
          qc_sampled_destroyed_qty: number
          recall_state: string
          rejected_qty: number
          sku_snapshot: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_qty?: number
          batch_code: string
          batch_kind?: string
          created_at?: string
          created_by?: string | null
          creation_idempotency_key?: string | null
          cure_start_date?: string | null
          earliest_release_date?: string | null
          id?: string
          lifecycle_status?: string
          manufacturing_date?: string | null
          notes?: string | null
          pending_inspection_qty?: number
          planned_qty?: number
          produced_qty?: number
          product_id?: string | null
          product_type?: string | null
          production_completed_at?: string | null
          production_sequence?: number | null
          production_started_at?: string | null
          qc_revision?: number
          qc_sampled_destroyed_qty?: number
          recall_state?: string
          rejected_qty?: number
          sku_snapshot: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_qty?: number
          batch_code?: string
          batch_kind?: string
          created_at?: string
          created_by?: string | null
          creation_idempotency_key?: string | null
          cure_start_date?: string | null
          earliest_release_date?: string | null
          id?: string
          lifecycle_status?: string
          manufacturing_date?: string | null
          notes?: string | null
          pending_inspection_qty?: number
          planned_qty?: number
          produced_qty?: number
          product_id?: string | null
          product_type?: string | null
          production_completed_at?: string | null
          production_sequence?: number | null
          production_started_at?: string | null
          qc_revision?: number
          qc_sampled_destroyed_qty?: number
          recall_state?: string
          rejected_qty?: number
          sku_snapshot?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_settings: {
        Row: {
          allocation_enabled: boolean
          id: boolean
          release_enabled: boolean
          updated_at: string
        }
        Insert: {
          allocation_enabled?: boolean
          id?: boolean
          release_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allocation_enabled?: boolean
          id?: boolean
          release_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      material_lots: {
        Row: {
          created_at: string
          id: string
          material_id: string
          note: string | null
          received_on: string | null
          received_qty: number | null
          supplier_lot_code: string
          supplier_name: string | null
          uom: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          note?: string | null
          received_on?: string | null
          received_qty?: number | null
          supplier_lot_code: string
          supplier_name?: string | null
          uom?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          note?: string | null
          received_on?: string | null
          received_qty?: number | null
          supplier_lot_code?: string
          supplier_name?: string | null
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_lots_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          created_at: string
          default_uom: string | null
          id: string
          material_type: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_uom?: string | null
          id?: string
          material_type: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_uom?: string | null
          id?: string
          material_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          alt: string | null
          aspect_ratio: string | null
          blur_data_url: string | null
          bytes: number | null
          copyright: string | null
          created_at: string
          credit: string | null
          dominant_color: string | null
          focal_x: number | null
          focal_y: number | null
          folder: string
          format: string | null
          height: number | null
          id: string
          kind: string
          photographer: string | null
          provider: string
          public_id: string | null
          role: string | null
          status: string
          tags: string[]
          title: string | null
          updated_at: string
          url: string
          version: number
          width: number | null
        }
        Insert: {
          alt?: string | null
          aspect_ratio?: string | null
          blur_data_url?: string | null
          bytes?: number | null
          copyright?: string | null
          created_at?: string
          credit?: string | null
          dominant_color?: string | null
          focal_x?: number | null
          focal_y?: number | null
          folder?: string
          format?: string | null
          height?: number | null
          id?: string
          kind?: string
          photographer?: string | null
          provider?: string
          public_id?: string | null
          role?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          url: string
          version?: number
          width?: number | null
        }
        Update: {
          alt?: string | null
          aspect_ratio?: string | null
          blur_data_url?: string | null
          bytes?: number | null
          copyright?: string | null
          created_at?: string
          credit?: string | null
          dominant_color?: string | null
          focal_x?: number | null
          focal_y?: number | null
          folder?: string
          format?: string | null
          height?: number | null
          id?: string
          kind?: string
          photographer?: string | null
          provider?: string
          public_id?: string | null
          role?: string | null
          status?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          url?: string
          version?: number
          width?: number | null
        }
        Relationships: []
      }
      navigation_menus: {
        Row: {
          draft: Json | null
          id: string
          predecessor_revision_id: string | null
          publish_at: string | null
          published: Json | null
          published_revision_id: string | null
          status: string
          unpublish_at: string | null
          updated_at: string
        }
        Insert: {
          draft?: Json | null
          id: string
          predecessor_revision_id?: string | null
          publish_at?: string | null
          published?: Json | null
          published_revision_id?: string | null
          status?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Update: {
          draft?: Json | null
          id?: string
          predecessor_revision_id?: string | null
          publish_at?: string | null
          published?: Json | null
          published_revision_id?: string | null
          status?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_menus_predecessor_revision_id_fkey"
            columns: ["predecessor_revision_id"]
            isOneToOne: false
            referencedRelation: "cms_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_menus_published_revision_id_fkey"
            columns: ["published_revision_id"]
            isOneToOne: false
            referencedRelation: "cms_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          source: string | null
          subscribed_at: string
          tags: string[]
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_dispatches: {
        Row: {
          channel: string
          created_at: string
          entity_ref: string
          error: string | null
          event: string
          id: string
          order_id: string | null
          provider_message_id: string | null
          recipient: string
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          entity_ref?: string
          error?: string | null
          event: string
          id?: string
          order_id?: string | null
          provider_message_id?: string | null
          recipient: string
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          entity_ref?: string
          error?: string | null
          event?: string
          id?: string
          order_id?: string | null
          provider_message_id?: string | null
          recipient?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attempts: number
          category: string | null
          channel: string
          claimed_at: string | null
          correlation_id: string | null
          correlation_key: string | null
          created_at: string
          dead_at: string | null
          dead_reason: string | null
          dedup_key: string | null
          delivered_recipients: string[]
          delivery_ms: number | null
          entity_ref: string | null
          entity_type: string | null
          error: string | null
          event: string
          expires_at: string | null
          group_id: string | null
          id: string
          last_attempt_at: string | null
          last_occurrence_at: string | null
          next_retry_at: string | null
          occurrence_count: number
          payload: Json | null
          provider_message_id: string | null
          read_at: string | null
          replayed_at: string | null
          replayed_by: string | null
          retention_class: string
          retry_history: Json
          severity: string
          status: string
          target: string | null
          title: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts?: number
          category?: string | null
          channel: string
          claimed_at?: string | null
          correlation_id?: string | null
          correlation_key?: string | null
          created_at?: string
          dead_at?: string | null
          dead_reason?: string | null
          dedup_key?: string | null
          delivered_recipients?: string[]
          delivery_ms?: number | null
          entity_ref?: string | null
          entity_type?: string | null
          error?: string | null
          event: string
          expires_at?: string | null
          group_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_occurrence_at?: string | null
          next_retry_at?: string | null
          occurrence_count?: number
          payload?: Json | null
          provider_message_id?: string | null
          read_at?: string | null
          replayed_at?: string | null
          replayed_by?: string | null
          retention_class?: string
          retry_history?: Json
          severity?: string
          status: string
          target?: string | null
          title?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts?: number
          category?: string | null
          channel?: string
          claimed_at?: string | null
          correlation_id?: string | null
          correlation_key?: string | null
          created_at?: string
          dead_at?: string | null
          dead_reason?: string | null
          dedup_key?: string | null
          delivered_recipients?: string[]
          delivery_ms?: number | null
          entity_ref?: string | null
          entity_type?: string | null
          error?: string | null
          event?: string
          expires_at?: string | null
          group_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_occurrence_at?: string | null
          next_retry_at?: string | null
          occurrence_count?: number
          payload?: Json | null
          provider_message_id?: string | null
          read_at?: string | null
          replayed_at?: string | null
          replayed_by?: string | null
          retention_class?: string
          retry_history?: Json
          severity?: string
          status?: string
          target?: string | null
          title?: string | null
        }
        Relationships: []
      }
      notification_occurrences: {
        Row: {
          created_at: string
          dedup_key: string
          entity_ref: string | null
          entity_type: string | null
          event: string
          id: string
          leader_group_id: string
          payload: Json | null
          severity: string
        }
        Insert: {
          created_at?: string
          dedup_key: string
          entity_ref?: string | null
          entity_type?: string | null
          event: string
          id?: string
          leader_group_id: string
          payload?: Json | null
          severity: string
        }
        Update: {
          created_at?: string
          dedup_key?: string
          entity_ref?: string | null
          entity_type?: string | null
          event?: string
          id?: string
          leader_group_id?: string
          payload?: Json | null
          severity?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          category: string | null
          channel: string
          created_at: string
          enabled: boolean
          event: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          channel: string
          created_at?: string
          enabled?: boolean
          event?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          channel?: string
          created_at?: string
          enabled?: boolean
          event?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_state: {
        Row: {
          alert_key: string
          assignee_id: string | null
          assignee_name: string | null
          note: string | null
          snoozed_until: string | null
          state: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_key: string
          assignee_id?: string | null
          assignee_name?: string | null
          note?: string | null
          snoozed_until?: string | null
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_key?: string
          assignee_id?: string | null
          assignee_name?: string | null
          note?: string | null
          snoozed_until?: string | null
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_state_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_state_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_triggers: {
        Row: {
          active: boolean
          channel: string
          created_at: string
          event: string
          id: string
          template: string
        }
        Insert: {
          active?: boolean
          channel: string
          created_at?: string
          event: string
          id?: string
          template: string
        }
        Update: {
          active?: boolean
          channel?: string
          created_at?: string
          event?: string
          id?: string
          template?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_inventory_exceptions: {
        Row: {
          created_at: string
          id: string
          movement_id: string | null
          order_id: string
          reason: string | null
          refund_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          shortfall_qty: number
          state: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_id?: string | null
          order_id: string
          reason?: string | null
          refund_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shortfall_qty: number
          state?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_id?: string | null
          order_id?: string
          reason?: string | null
          refund_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shortfall_qty?: number
          state?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_inventory_exceptions_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_inventory_exceptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_inventory_exceptions_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_inventory_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_inventory_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_name: string | null
          bundle_components: Json | null
          collection_name: string | null
          composition_id: string | null
          created_at: string
          edition_label: string | null
          gst_rate: number
          hsn_code: string
          id: string
          image_url: string | null
          is_bundle: boolean
          line_cgst: number
          line_discount: number
          line_igst: number
          line_sgst: number
          line_subtotal: number
          line_taxable: number
          line_total: number
          order_id: string
          picked_qty: number
          product_id: string | null
          product_name: string
          product_slug: string | null
          quantity: number
          size: string | null
          sku: string
          unit_price: number
          variant_id: string | null
          variant_name: string | null
          vessel: string | null
          volume_label: string | null
        }
        Insert: {
          brand_name?: string | null
          bundle_components?: Json | null
          collection_name?: string | null
          composition_id?: string | null
          created_at?: string
          edition_label?: string | null
          gst_rate: number
          hsn_code: string
          id?: string
          image_url?: string | null
          is_bundle?: boolean
          line_cgst?: number
          line_discount?: number
          line_igst?: number
          line_sgst?: number
          line_subtotal: number
          line_taxable?: number
          line_total: number
          order_id: string
          picked_qty?: number
          product_id?: string | null
          product_name: string
          product_slug?: string | null
          quantity: number
          size?: string | null
          sku: string
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
          vessel?: string | null
          volume_label?: string | null
        }
        Update: {
          brand_name?: string | null
          bundle_components?: Json | null
          collection_name?: string | null
          composition_id?: string | null
          created_at?: string
          edition_label?: string | null
          gst_rate?: number
          hsn_code?: string
          id?: string
          image_url?: string | null
          is_bundle?: boolean
          line_cgst?: number
          line_discount?: number
          line_igst?: number
          line_sgst?: number
          line_subtotal?: number
          line_taxable?: number
          line_total?: number
          order_id?: string
          picked_qty?: number
          product_id?: string | null
          product_name?: string
          product_slug?: string | null
          quantity?: number
          size?: string | null
          sku?: string
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
          vessel?: string | null
          volume_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          assigned_to: string | null
          awb_number: string | null
          bill_city: string | null
          bill_full_name: string | null
          bill_line1: string | null
          bill_line2: string | null
          bill_phone: string | null
          bill_pincode: string | null
          bill_state: string | null
          brand_name: string | null
          buyer_company: string | null
          buyer_gstin: string | null
          cancel_reason: string | null
          cancellation_type: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cart_hash: string | null
          cgst_amount: number
          commerce_version: string | null
          coupon_code: string | null
          coupon_id: string | null
          courier_name: string | null
          created_at: string
          discount_amount: number
          email: string
          fraud_review: string
          fulfillment_hold_reason: string | null
          fulfillment_prev_status: string | null
          fulfillment_status: string | null
          gift_card_amount: number
          gift_note: string | null
          gift_occasion: string | null
          gift_recipient: string | null
          id: string
          idempotency_key: string | null
          igst_amount: number
          incident_number: string | null
          internal_notes: string | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_url: string | null
          is_cod: boolean
          is_gift: boolean
          loyalty_discount: number
          loyalty_points_earned: number
          loyalty_points_used: number
          ndr_reason: string | null
          ndr_status: Database["public"]["Enums"]["ndr_status"] | null
          ops_note: string | null
          ops_tags: string[]
          order_number: string
          packing_checklist: Json
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          placed_at: string
          pricing_version: string | null
          priority: string
          promotions: Json | null
          qc_at: string | null
          qc_by: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refund_amount: number
          refunded_at: string | null
          sgst_amount: number
          ship_city: string | null
          ship_country: string | null
          ship_full_name: string | null
          ship_line1: string | null
          ship_line2: string | null
          ship_phone: string | null
          ship_pincode: string | null
          ship_state: string | null
          shipping_amount: number
          shipping_charge: number
          shipping_gst: number
          shipping_method: string | null
          shipping_rate_version: string | null
          shiprocket_order_id: string | null
          shiprocket_shipment_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_version: string | null
          taxable_amount: number
          total_amount: number
          tracking_url: string | null
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wholesale: string
        }
        Insert: {
          address_id?: string | null
          assigned_to?: string | null
          awb_number?: string | null
          bill_city?: string | null
          bill_full_name?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_phone?: string | null
          bill_pincode?: string | null
          bill_state?: string | null
          brand_name?: string | null
          buyer_company?: string | null
          buyer_gstin?: string | null
          cancel_reason?: string | null
          cancellation_type?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cart_hash?: string | null
          cgst_amount?: number
          commerce_version?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number
          email: string
          fraud_review?: string
          fulfillment_hold_reason?: string | null
          fulfillment_prev_status?: string | null
          fulfillment_status?: string | null
          gift_card_amount?: number
          gift_note?: string | null
          gift_occasion?: string | null
          gift_recipient?: string | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
          incident_number?: string | null
          internal_notes?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          is_cod?: boolean
          is_gift?: boolean
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_used?: number
          ndr_reason?: string | null
          ndr_status?: Database["public"]["Enums"]["ndr_status"] | null
          ops_note?: string | null
          ops_tags?: string[]
          order_number: string
          packing_checklist?: Json
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          placed_at?: string
          pricing_version?: string | null
          priority?: string
          promotions?: Json | null
          qc_at?: string | null
          qc_by?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refund_amount?: number
          refunded_at?: string | null
          sgst_amount?: number
          ship_city?: string | null
          ship_country?: string | null
          ship_full_name?: string | null
          ship_line1?: string | null
          ship_line2?: string | null
          ship_phone?: string | null
          ship_pincode?: string | null
          ship_state?: string | null
          shipping_amount?: number
          shipping_charge?: number
          shipping_gst?: number
          shipping_method?: string | null
          shipping_rate_version?: string | null
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_version?: string | null
          taxable_amount?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wholesale?: string
        }
        Update: {
          address_id?: string | null
          assigned_to?: string | null
          awb_number?: string | null
          bill_city?: string | null
          bill_full_name?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_phone?: string | null
          bill_pincode?: string | null
          bill_state?: string | null
          brand_name?: string | null
          buyer_company?: string | null
          buyer_gstin?: string | null
          cancel_reason?: string | null
          cancellation_type?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cart_hash?: string | null
          cgst_amount?: number
          commerce_version?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number
          email?: string
          fraud_review?: string
          fulfillment_hold_reason?: string | null
          fulfillment_prev_status?: string | null
          fulfillment_status?: string | null
          gift_card_amount?: number
          gift_note?: string | null
          gift_occasion?: string | null
          gift_recipient?: string | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
          incident_number?: string | null
          internal_notes?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          is_cod?: boolean
          is_gift?: boolean
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_used?: number
          ndr_reason?: string | null
          ndr_status?: Database["public"]["Enums"]["ndr_status"] | null
          ops_note?: string | null
          ops_tags?: string[]
          order_number?: string
          packing_checklist?: Json
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          placed_at?: string
          pricing_version?: string | null
          priority?: string
          promotions?: Json | null
          qc_at?: string | null
          qc_by?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refund_amount?: number
          refunded_at?: string | null
          sgst_amount?: number
          ship_city?: string | null
          ship_country?: string | null
          ship_full_name?: string | null
          ship_line1?: string | null
          ship_line2?: string | null
          ship_phone?: string | null
          ship_pincode?: string | null
          ship_state?: string | null
          shipping_amount?: number
          shipping_charge?: number
          shipping_gst?: number
          shipping_method?: string | null
          shipping_rate_version?: string | null
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_version?: string | null
          taxable_amount?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wholesale?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_qc_by_fkey"
            columns: ["qc_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_assets: {
        Row: {
          active: boolean
          barcode: string | null
          cost: number | null
          created_at: string
          current_stock: number
          fragile: boolean
          height_cm: number | null
          id: string
          length_cm: number | null
          max_products: number | null
          max_weight_g: number | null
          min_stock: number
          name: string
          purchase_cost: number | null
          reorder_level: number
          type: string
          updated_at: string
          vendor: string | null
          weight_g: number
          width_cm: number | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          cost?: number | null
          created_at?: string
          current_stock?: number
          fragile?: boolean
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          max_products?: number | null
          max_weight_g?: number | null
          min_stock?: number
          name: string
          purchase_cost?: number | null
          reorder_level?: number
          type: string
          updated_at?: string
          vendor?: string | null
          weight_g?: number
          width_cm?: number | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          cost?: number | null
          created_at?: string
          current_stock?: number
          fragile?: boolean
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          max_products?: number | null
          max_weight_g?: number | null
          min_stock?: number
          name?: string
          purchase_cost?: number | null
          reorder_level?: number
          type?: string
          updated_at?: string
          vendor?: string | null
          weight_g?: number
          width_cm?: number | null
        }
        Relationships: []
      }
      packaging_profile_items: {
        Row: {
          asset_id: string
          id: string
          profile_id: string
          quantity: number
          role: string
        }
        Insert: {
          asset_id: string
          id?: string
          profile_id: string
          quantity?: number
          role?: string
        }
        Update: {
          asset_id?: string
          id?: string
          profile_id?: string
          quantity?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_profile_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "packaging_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_profile_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "packaging_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_profiles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      packaging_rules: {
        Row: {
          active: boolean
          add_fragile_wrap: boolean
          add_leak_seal: boolean
          created_at: string
          id: string
          is_gift: boolean | null
          kind: string
          max_products: number | null
          min_products: number | null
          name: string
          priority: number
          product_type: string | null
          profile_id: string | null
          vessel: string | null
        }
        Insert: {
          active?: boolean
          add_fragile_wrap?: boolean
          add_leak_seal?: boolean
          created_at?: string
          id?: string
          is_gift?: boolean | null
          kind?: string
          max_products?: number | null
          min_products?: number | null
          name: string
          priority?: number
          product_type?: string | null
          profile_id?: string | null
          vessel?: string | null
        }
        Update: {
          active?: boolean
          add_fragile_wrap?: boolean
          add_leak_seal?: boolean
          created_at?: string
          id?: string
          is_gift?: boolean | null
          kind?: string
          max_products?: number | null
          min_products?: number | null
          name?: string
          priority?: number
          product_type?: string | null
          profile_id?: string | null
          vessel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_rules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "packaging_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_qc_checks: {
        Row: {
          checklist: Json
          created_at: string
          id: string
          notes: string | null
          operator_id: string | null
          order_id: string
          passed: boolean
          pick_fingerprint: string | null
          shipment_id: string | null
        }
        Insert: {
          checklist: Json
          created_at?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          order_id: string
          passed: boolean
          pick_fingerprint?: string | null
          shipment_id?: string | null
        }
        Update: {
          checklist?: Json
          created_at?: string
          id?: string
          notes?: string | null
          operator_id?: string | null
          order_id?: string
          passed?: boolean
          pick_fingerprint?: string | null
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_qc_checks_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_qc_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_qc_checks_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          error_code: string | null
          error_description: string | null
          id: string
          order_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          source: string | null
          status: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          error_description?: string | null
          id?: string
          order_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          source?: string | null
          status: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_code?: string | null
          error_description?: string | null
          id?: string
          order_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_audits: {
        Row: {
          audit_date: string
          broken_links_count: number | null
          cls_score: number | null
          created_at: string
          fcp_ms: number | null
          id: string
          lcp_ms: number | null
          lighthouse_score: number | null
          low_stock_count: number | null
          missing_alt_count: number | null
          missing_meta_count: number | null
          notes: string | null
          performance_score: number | null
          run_by: string | null
        }
        Insert: {
          audit_date?: string
          broken_links_count?: number | null
          cls_score?: number | null
          created_at?: string
          fcp_ms?: number | null
          id?: string
          lcp_ms?: number | null
          lighthouse_score?: number | null
          low_stock_count?: number | null
          missing_alt_count?: number | null
          missing_meta_count?: number | null
          notes?: string | null
          performance_score?: number | null
          run_by?: string | null
        }
        Update: {
          audit_date?: string
          broken_links_count?: number | null
          cls_score?: number | null
          created_at?: string
          fcp_ms?: number | null
          id?: string
          lcp_ms?: number | null
          lighthouse_score?: number | null
          low_stock_count?: number | null
          missing_alt_count?: number | null
          missing_meta_count?: number | null
          notes?: string | null
          performance_score?: number | null
          run_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_audits_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string
          created_at: string
          focal: string | null
          height: number | null
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          updated_at: string
          url: string
          width: number | null
        }
        Insert: {
          alt_text: string
          created_at?: string
          focal?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          updated_at?: string
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          focal?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          air_content: Json | null
          allow_backorder: boolean
          artist_enabled: boolean
          artist_image: string | null
          artist_name: string | null
          artist_quote: string | null
          artist_role: string | null
          artist_story: string | null
          base_sku: string
          batch_prefix: string | null
          burn_time: string | null
          category_id: string
          chapter_position: string | null
          collection_id: string | null
          created_at: string
          cultural_reference: string | null
          display_order: number
          flame_persona: string | null
          fragrance_family: string | null
          gst_rate: number
          hsn_code: string
          id: string
          is_bestseller: boolean
          is_coming_soon: boolean
          is_featured: boolean
          is_hero: boolean
          is_limited_edition: boolean
          is_new_arrival: boolean
          is_seasonal: boolean
          is_staff_pick: boolean
          lifestyle_use: string | null
          mood_tags: string[]
          name: string
          pdp_content: Json | null
          price: number
          product_type: string
          publish_at: string | null
          sale_price: number | null
          scent_group: string | null
          seo_canonical: string | null
          seo_description: string | null
          seo_og_image: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          story: string | null
          story_long: string | null
          tagline: string | null
          updated_at: string
          visible_bundles: boolean
          visible_chapter: boolean
          visible_homepage: boolean
          visible_search: boolean
          visible_website: boolean
          wax_blend: string | null
          weight_grams: number | null
          wick: string | null
        }
        Insert: {
          air_content?: Json | null
          allow_backorder?: boolean
          artist_enabled?: boolean
          artist_image?: string | null
          artist_name?: string | null
          artist_quote?: string | null
          artist_role?: string | null
          artist_story?: string | null
          base_sku: string
          batch_prefix?: string | null
          burn_time?: string | null
          category_id: string
          chapter_position?: string | null
          collection_id?: string | null
          created_at?: string
          cultural_reference?: string | null
          display_order?: number
          flame_persona?: string | null
          fragrance_family?: string | null
          gst_rate?: number
          hsn_code: string
          id?: string
          is_bestseller?: boolean
          is_coming_soon?: boolean
          is_featured?: boolean
          is_hero?: boolean
          is_limited_edition?: boolean
          is_new_arrival?: boolean
          is_seasonal?: boolean
          is_staff_pick?: boolean
          lifestyle_use?: string | null
          mood_tags?: string[]
          name: string
          pdp_content?: Json | null
          price: number
          product_type?: string
          publish_at?: string | null
          sale_price?: number | null
          scent_group?: string | null
          seo_canonical?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
          visible_bundles?: boolean
          visible_chapter?: boolean
          visible_homepage?: boolean
          visible_search?: boolean
          visible_website?: boolean
          wax_blend?: string | null
          weight_grams?: number | null
          wick?: string | null
        }
        Update: {
          air_content?: Json | null
          allow_backorder?: boolean
          artist_enabled?: boolean
          artist_image?: string | null
          artist_name?: string | null
          artist_quote?: string | null
          artist_role?: string | null
          artist_story?: string | null
          base_sku?: string
          batch_prefix?: string | null
          burn_time?: string | null
          category_id?: string
          chapter_position?: string | null
          collection_id?: string | null
          created_at?: string
          cultural_reference?: string | null
          display_order?: number
          flame_persona?: string | null
          fragrance_family?: string | null
          gst_rate?: number
          hsn_code?: string
          id?: string
          is_bestseller?: boolean
          is_coming_soon?: boolean
          is_featured?: boolean
          is_hero?: boolean
          is_limited_edition?: boolean
          is_new_arrival?: boolean
          is_seasonal?: boolean
          is_staff_pick?: boolean
          lifestyle_use?: string | null
          mood_tags?: string[]
          name?: string
          pdp_content?: Json | null
          price?: number
          product_type?: string
          publish_at?: string | null
          sale_price?: number | null
          scent_group?: string | null
          seo_canonical?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
          visible_bundles?: boolean
          visible_chapter?: boolean
          visible_homepage?: boolean
          visible_search?: boolean
          visible_website?: boolean
          wax_blend?: string | null
          weight_grams?: number | null
          wick?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string | null
          product_type: string
          required_checks: Json
          variant_config: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          product_type: string
          required_checks?: Json
          variant_config?: string
          version: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string | null
          product_type?: string
          required_checks?: Json
          variant_config?: string
          version?: number
        }
        Relationships: []
      }
      recall_case_batches: {
        Row: {
          added_at: string
          batch_id: string
          recall_id: string
          variant_id: string | null
        }
        Insert: {
          added_at?: string
          batch_id: string
          recall_id: string
          variant_id?: string | null
        }
        Update: {
          added_at?: string
          batch_id?: string
          recall_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recall_case_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_case_batches_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recall_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_case_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_case_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          from_state: string | null
          id: string
          notes: string | null
          recall_id: string
          to_state: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          from_state?: string | null
          id?: string
          notes?: string | null
          recall_id: string
          to_state?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          from_state?: string | null
          id?: string
          notes?: string | null
          recall_id?: string
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recall_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_case_events_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recall_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_case_lots: {
        Row: {
          added_at: string
          material_lot_id: string
          recall_id: string
        }
        Insert: {
          added_at?: string
          material_lot_id: string
          recall_id: string
        }
        Update: {
          added_at?: string
          material_lot_id?: string
          recall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recall_case_lots_material_lot_id_fkey"
            columns: ["material_lot_id"]
            isOneToOne: false
            referencedRelation: "material_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_case_lots_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recall_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_cases: {
        Row: {
          approved_by: string | null
          closed_at: string | null
          closure_decision: string | null
          containment_status: string
          created_at: string
          evidence: Json | null
          id: string
          initiated_at: string | null
          initiated_by: string | null
          investigation_notes: string | null
          kind: string
          reason: string
          recall_number: string | null
          required_actions: Json | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          closed_at?: string | null
          closure_decision?: string | null
          containment_status?: string
          created_at?: string
          evidence?: Json | null
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          investigation_notes?: string | null
          kind: string
          reason: string
          recall_number?: string | null
          required_actions?: Json | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          closed_at?: string | null
          closure_decision?: string | null
          containment_status?: string
          created_at?: string
          evidence?: Json | null
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          investigation_notes?: string | null
          kind?: string
          reason?: string
          recall_number?: string | null
          required_actions?: Json | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recall_cases_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_cases_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_notifications: {
        Row: {
          approval_status: string
          attempts: number
          created_at: string
          email_snapshot: string | null
          id: string
          necessity: string
          needs_followup: boolean
          order_id: string
          outcome: string | null
          provenance: string
          recall_id: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          attempts?: number
          created_at?: string
          email_snapshot?: string | null
          id?: string
          necessity?: string
          needs_followup?: boolean
          order_id: string
          outcome?: string | null
          provenance: string
          recall_id: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          attempts?: number
          created_at?: string
          email_snapshot?: string | null
          id?: string
          necessity?: string
          needs_followup?: boolean
          order_id?: string
          outcome?: string | null
          provenance?: string
          recall_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recall_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_notifications_recall_id_fkey"
            columns: ["recall_id"]
            isOneToOne: false
            referencedRelation: "recall_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      redirects: {
        Row: {
          code: number
          created_at: string
          enabled: boolean
          from_path: string
          hits: number
          id: string
          to_path: string
        }
        Insert: {
          code?: number
          created_at?: string
          enabled?: boolean
          from_path: string
          hits?: number
          id?: string
          to_path: string
        }
        Update: {
          code?: number
          created_at?: string
          enabled?: boolean
          from_path?: string
          hits?: number
          id?: string
          to_path?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          owner_user_id: string
          referral_count: number
          total_discount_given: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id: string
          referral_count?: number
          total_discount_given?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_user_id?: string
          referral_count?: number
          total_discount_given?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_uses: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          order_id: string | null
          referral_code_id: string
          referred_user_id: string | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          referral_code_id: string
          referred_user_id?: string | null
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          referral_code_id?: string
          referred_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_uses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_uses_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_uses_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_code: string | null
          error_description: string | null
          id: string
          method: string
          order_id: string
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          reason: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          method?: string
          order_id: string
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          method?: string
          order_id?: string
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      related_products: {
        Row: {
          created_at: string
          id: string
          product_id: string
          related_product_id: string
          relation_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          related_product_id: string
          relation_type?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          related_product_id?: string
          relation_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "related_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "related_products_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      return_attachments: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: string
          public_id: string | null
          return_id: string
          source: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          public_id?: string | null
          return_id: string
          source?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          public_id?: string | null
          return_id?: string
          source?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_attachments_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      return_events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          return_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          return_id: string
          status: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          return_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_events_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          created_at: string
          id: string
          line_amount: number
          order_item_id: string | null
          product_name: string | null
          quantity: number
          restock: boolean
          return_id: string
          sku: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_amount?: number
          order_item_id?: string | null
          product_name?: string | null
          quantity: number
          restock?: boolean
          return_id: string
          sku?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_amount?: number
          order_item_id?: string | null
          product_name?: string | null
          quantity?: number
          restock?: boolean
          return_id?: string
          sku?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_message: string | null
          damage_classification: string | null
          id: string
          inspected_at: string | null
          inspection_by: string | null
          inspection_note: string | null
          inspection_result: string | null
          notes: string | null
          order_id: string
          order_number: string
          reason: string | null
          receiving_closed_at: string | null
          receiving_closed_by: string | null
          refund_amount: number | null
          refund_id: string | null
          refund_method: string | null
          resolution: string | null
          resolution_by: string | null
          resolution_reason: string | null
          resolved_at: string | null
          return_type: string
          rma_number: string | null
          status: string
          updated_at: string
          warehouse_decided_at: string | null
          warehouse_decision: string | null
          warehouse_decision_by: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_message?: string | null
          damage_classification?: string | null
          id?: string
          inspected_at?: string | null
          inspection_by?: string | null
          inspection_note?: string | null
          inspection_result?: string | null
          notes?: string | null
          order_id: string
          order_number: string
          reason?: string | null
          receiving_closed_at?: string | null
          receiving_closed_by?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_method?: string | null
          resolution?: string | null
          resolution_by?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          return_type?: string
          rma_number?: string | null
          status?: string
          updated_at?: string
          warehouse_decided_at?: string | null
          warehouse_decision?: string | null
          warehouse_decision_by?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_message?: string | null
          damage_classification?: string | null
          id?: string
          inspected_at?: string | null
          inspection_by?: string | null
          inspection_note?: string | null
          inspection_result?: string | null
          notes?: string | null
          order_id?: string
          order_number?: string
          reason?: string | null
          receiving_closed_at?: string | null
          receiving_closed_by?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_method?: string | null
          resolution?: string | null
          resolution_by?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          return_type?: string
          rma_number?: string | null
          status?: string
          updated_at?: string
          warehouse_decided_at?: string | null
          warehouse_decision?: string | null
          warehouse_decision_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_inspection_by_fkey"
            columns: ["inspection_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_receiving_closed_by_fkey"
            columns: ["receiving_closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_resolution_by_fkey"
            columns: ["resolution_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_warehouse_decision_by_fkey"
            columns: ["warehouse_decision_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_reply: string | null
          comment: string
          created_at: string
          helpful_count: number
          id: string
          images: string[]
          is_verified_purchase: boolean
          order_id: string | null
          product_id: string
          rating: number
          replied_at: string | null
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          admin_reply?: string | null
          comment: string
          created_at?: string
          helpful_count?: number
          id?: string
          images?: string[]
          is_verified_purchase?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          replied_at?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          admin_reply?: string | null
          comment?: string
          created_at?: string
          helpful_count?: number
          id?: string
          images?: string[]
          is_verified_purchase?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          replied_at?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          clicked_product_id: string | null
          created_at: string
          id: string
          query: string
          results_count: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          clicked_product_id?: string | null
          created_at?: string
          id?: string
          query: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_product_id?: string | null
          created_at?: string
          id?: string
          query?: string
          results_count?: number
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_clicked_product_id_fkey"
            columns: ["clicked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      section_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          page_key: string
          path: string | null
          scroll_pct: number | null
          section_id: string
          section_type: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          page_key?: string
          path?: string | null
          scroll_pct?: number | null
          section_id: string
          section_type?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          page_key?: string
          path?: string | null
          scroll_pct?: number | null
          section_id?: string
          section_type?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      seo_overrides: {
        Row: {
          canonical: string | null
          change_freq: string | null
          description: string | null
          og_image: string | null
          path: string
          robots: string | null
          sitemap_priority: number | null
          structured_data: Json | null
          title: string | null
          updated_at: string
        }
        Insert: {
          canonical?: string | null
          change_freq?: string | null
          description?: string | null
          og_image?: string | null
          path: string
          robots?: string | null
          sitemap_priority?: number | null
          structured_data?: Json | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          canonical?: string | null
          change_freq?: string | null
          description?: string | null
          og_image?: string | null
          path?: string
          robots?: string | null
          sitemap_priority?: number | null
          structured_data?: Json | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string | null
          section: string | null
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label?: string | null
          section?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string | null
          section?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      shipment_batch_lines: {
        Row: {
          batch_id: string
          component_key: string
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          qty: number
          shipment_id: string
          variant_id: string
        }
        Insert: {
          batch_id: string
          component_key?: string
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          qty: number
          shipment_id: string
          variant_id: string
        }
        Update: {
          batch_id?: string
          component_key?: string
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          qty?: number
          shipment_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_batch_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_batch_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_batch_lines_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_batch_lines_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_batch_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          created_at: string
          customer_status: string | null
          description: string | null
          id: string
          location: string | null
          shipment_id: string
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          customer_status?: string | null
          description?: string | null
          id?: string
          location?: string | null
          shipment_id: string
          source?: string
          status: string
        }
        Update: {
          created_at?: string
          customer_status?: string | null
          description?: string | null
          id?: string
          location?: string | null
          shipment_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_exceptions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          resolution: string | null
          resolved_at: string | null
          shipment_id: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          shipment_id?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          shipment_id?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_exceptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_exceptions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          awb: string | null
          cancelled_at: string | null
          chargeable_weight_kg: number | null
          cod_amount: number
          cod_fee: number
          courier_cost: number
          courier_name: string | null
          created_at: string
          declared_value: number | null
          delivered_at: string | null
          delivered_to: string | null
          exception_reason: string | null
          fuel_surcharge: number
          height_cm: number | null
          id: string
          insurance_cost: number
          insured: boolean
          label_url: string | null
          length_cm: number | null
          net_weight_kg: number | null
          order_id: string
          packaging_confirmed: boolean
          packaging_cost: number
          packaging_weight_kg: number | null
          payment_mode: string
          pod_note: string | null
          provider: string
          provider_shipment_id: string | null
          rto_at: string | null
          rto_receiving_closed_at: string | null
          rto_receiving_closed_by: string | null
          shipping_cost: number | null
          shipping_weight_kg: number | null
          status: string
          tax_cost: number
          total_logistics_cost: number
          tracking_url: string | null
          updated_at: string
          volumetric_weight_kg: number | null
          warehouse_id: string | null
          width_cm: number | null
        }
        Insert: {
          awb?: string | null
          cancelled_at?: string | null
          chargeable_weight_kg?: number | null
          cod_amount?: number
          cod_fee?: number
          courier_cost?: number
          courier_name?: string | null
          created_at?: string
          declared_value?: number | null
          delivered_at?: string | null
          delivered_to?: string | null
          exception_reason?: string | null
          fuel_surcharge?: number
          height_cm?: number | null
          id?: string
          insurance_cost?: number
          insured?: boolean
          label_url?: string | null
          length_cm?: number | null
          net_weight_kg?: number | null
          order_id: string
          packaging_confirmed?: boolean
          packaging_cost?: number
          packaging_weight_kg?: number | null
          payment_mode?: string
          pod_note?: string | null
          provider: string
          provider_shipment_id?: string | null
          rto_at?: string | null
          rto_receiving_closed_at?: string | null
          rto_receiving_closed_by?: string | null
          shipping_cost?: number | null
          shipping_weight_kg?: number | null
          status?: string
          tax_cost?: number
          total_logistics_cost?: number
          tracking_url?: string | null
          updated_at?: string
          volumetric_weight_kg?: number | null
          warehouse_id?: string | null
          width_cm?: number | null
        }
        Update: {
          awb?: string | null
          cancelled_at?: string | null
          chargeable_weight_kg?: number | null
          cod_amount?: number
          cod_fee?: number
          courier_cost?: number
          courier_name?: string | null
          created_at?: string
          declared_value?: number | null
          delivered_at?: string | null
          delivered_to?: string | null
          exception_reason?: string | null
          fuel_surcharge?: number
          height_cm?: number | null
          id?: string
          insurance_cost?: number
          insured?: boolean
          label_url?: string | null
          length_cm?: number | null
          net_weight_kg?: number | null
          order_id?: string
          packaging_confirmed?: boolean
          packaging_cost?: number
          packaging_weight_kg?: number | null
          payment_mode?: string
          pod_note?: string | null
          provider?: string
          provider_shipment_id?: string | null
          rto_at?: string | null
          rto_receiving_closed_at?: string | null
          rto_receiving_closed_by?: string | null
          shipping_cost?: number | null
          shipping_weight_kg?: number | null
          status?: string
          tax_cost?: number
          total_logistics_cost?: number
          tracking_url?: string | null
          updated_at?: string
          volumetric_weight_kg?: number | null
          warehouse_id?: string | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_rto_receiving_closed_by_fkey"
            columns: ["rto_receiving_closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_settings: {
        Row: {
          auto_assign: boolean
          auto_create_after_fulfillment: boolean
          cod_threshold: number
          courier_strategy: string
          default_provider: string
          default_warehouse_id: string | null
          fragile_policy: string
          holiday_calendar: string[]
          id: boolean
          insurance_threshold: number
          updated_at: string
          volumetric_divisor: number
          working_days: string[]
        }
        Insert: {
          auto_assign?: boolean
          auto_create_after_fulfillment?: boolean
          cod_threshold?: number
          courier_strategy?: string
          default_provider?: string
          default_warehouse_id?: string | null
          fragile_policy?: string
          holiday_calendar?: string[]
          id?: boolean
          insurance_threshold?: number
          updated_at?: string
          volumetric_divisor?: number
          working_days?: string[]
        }
        Update: {
          auto_assign?: boolean
          auto_create_after_fulfillment?: boolean
          cod_threshold?: number
          courier_strategy?: string
          default_provider?: string
          default_warehouse_id?: string | null
          fragile_policy?: string
          holiday_calendar?: string[]
          id?: boolean
          insurance_threshold?: number
          updated_at?: string
          volumetric_divisor?: number
          working_days?: string[]
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          data: Json
          id: boolean
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: boolean
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      stock_notifications: {
        Row: {
          created_at: string
          email: string
          id: string
          is_notified: boolean
          notified_at: string | null
          user_id: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_notified?: boolean
          notified_at?: string | null
          user_id?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_notified?: boolean
          notified_at?: string | null
          user_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string | null
          quantity: number
          session_id: string | null
          user_id: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id?: string | null
          quantity: number
          session_id?: string | null
          user_id?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string | null
          quantity?: number
          session_id?: string | null
          user_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_auth_providers: {
        Row: {
          email: string | null
          id: string
          linked_at: string
          provider: string
          provider_id: string | null
          user_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          linked_at?: string
          provider: string
          provider_id?: string | null
          user_id: string
        }
        Update: {
          email?: string | null
          id?: string
          linked_at?: string
          provider?: string
          provider_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_auth_providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          browser: string | null
          created_at: string
          device: string | null
          device_id: string
          id: string
          label: string | null
          last_active_at: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device?: string | null
          device_id: string
          id?: string
          label?: string | null
          last_active_at?: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device?: string | null
          device_id?: string
          id?: string
          label?: string | null
          last_active_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          admin_notes: string | null
          avatar_cached_url: string | null
          avatar_url: string | null
          birthday: string | null
          created_at: string
          email: string
          email_verified: boolean
          full_name: string | null
          id: string
          last_login_at: string | null
          last_login_provider: string | null
          loyalty_points: number
          loyalty_tier: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent: boolean
          onboarded: boolean
          phone: string | null
          provider: string | null
          provider_id: string | null
          referral_code: string | null
          role: Database["public"]["Enums"]["user_role"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          avatar_cached_url?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          email: string
          email_verified?: boolean
          full_name?: string | null
          id: string
          last_login_at?: string | null
          last_login_provider?: string | null
          loyalty_points?: number
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent?: boolean
          onboarded?: boolean
          phone?: string | null
          provider?: string | null
          provider_id?: string | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          avatar_cached_url?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          email?: string
          email_verified?: boolean
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_login_provider?: string | null
          loyalty_points?: number
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent?: boolean
          onboarded?: boolean
          phone?: string | null
          provider?: string | null
          provider_id?: string | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      variant_legacy_reconciliation: {
        Row: {
          accounting_balance: number
          created_at: string
          notes: string | null
          quarantined_qty: number
          reconciled_at: string | null
          reconciled_by: string | null
          state: string
          unknown_qty: number
          updated_at: string
          variant_id: string
          verified_eligible_qty: number
        }
        Insert: {
          accounting_balance?: number
          created_at?: string
          notes?: string | null
          quarantined_qty?: number
          reconciled_at?: string | null
          reconciled_by?: string | null
          state?: string
          unknown_qty?: number
          updated_at?: string
          variant_id: string
          verified_eligible_qty?: number
        }
        Update: {
          accounting_balance?: number
          created_at?: string
          notes?: string | null
          quarantined_qty?: number
          reconciled_at?: string | null
          reconciled_by?: string | null
          state?: string
          unknown_qty?: number
          updated_at?: string
          variant_id?: string
          verified_eligible_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "variant_legacy_reconciliation_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_legacy_reconciliation_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_tracking_epochs: {
        Row: {
          activated_by: string | null
          created_at: string
          epoch_at: string
          id: string
          variant_id: string
        }
        Insert: {
          activated_by?: string | null
          created_at?: string
          epoch_at?: string
          id?: string
          variant_id: string
        }
        Update: {
          activated_by?: string | null
          created_at?: string
          epoch_at?: string
          id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_tracking_epochs_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_tracking_epochs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variants: {
        Row: {
          barcode: string | null
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          package_height_cm: number | null
          package_length_cm: number | null
          package_width_cm: number | null
          price: number
          product_id: string
          sale_price: number | null
          shipping_class: string | null
          size_label: string | null
          sku: string
          sort_order: number
          stock: number
          supplier_sku: string | null
          tracked_at: string | null
          tracking_state: string
          updated_at: string
          variant_name: string | null
          vessel_type: Database["public"]["Enums"]["vessel_type"] | null
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          price: number
          product_id: string
          sale_price?: number | null
          shipping_class?: string | null
          size_label?: string | null
          sku: string
          sort_order?: number
          stock?: number
          supplier_sku?: string | null
          tracked_at?: string | null
          tracking_state?: string
          updated_at?: string
          variant_name?: string | null
          vessel_type?: Database["public"]["Enums"]["vessel_type"] | null
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          price?: number
          product_id?: string
          sale_price?: number | null
          shipping_class?: string | null
          size_label?: string | null
          sku?: string
          sort_order?: number
          stock?: number
          supplier_sku?: string | null
          tracked_at?: string | null
          tracking_state?: string
          updated_at?: string
          variant_name?: string | null
          vessel_type?: Database["public"]["Enums"]["vessel_type"] | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          city: string | null
          country: string | null
          created_at: string
          daily_capacity: number | null
          gstin: string | null
          id: string
          line1: string | null
          line2: string | null
          manager: string | null
          name: string
          phone: string | null
          pincode: string | null
          priority: number
          serves_states: string[]
          state: string | null
          updated_at: string
          working_hours: string | null
        }
        Insert: {
          active?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          daily_capacity?: number | null
          gstin?: string | null
          id: string
          line1?: string | null
          line2?: string | null
          manager?: string | null
          name: string
          phone?: string | null
          pincode?: string | null
          priority?: number
          serves_states?: string[]
          state?: string | null
          updated_at?: string
          working_hours?: string | null
        }
        Update: {
          active?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          daily_capacity?: number | null
          gstin?: string | null
          id?: string
          line1?: string | null
          line2?: string | null
          manager?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          priority?: number
          serves_states?: string[]
          state?: string | null
          updated_at?: string
          working_hours?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string | null
          event_type: string
          id: string
          order_id: string | null
          payload: Json
          processed_at: string | null
          processing_ms: number | null
          provider: string
          retry_count: number
          status: Database["public"]["Enums"]["webhook_status"]
          verified: boolean
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type: string
          id?: string
          order_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_ms?: number | null
          provider: string
          retry_count?: number
          status?: Database["public"]["Enums"]["webhook_status"]
          verified?: boolean
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          id?: string
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_ms?: number | null
          provider?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["webhook_status"]
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_customers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_name: string
          contact_name: string | null
          created_at: string
          custom_price_tier: string | null
          email: string
          gstin: string | null
          id: string
          moq: number | null
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["wholesale_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_name: string
          contact_name?: string | null
          created_at?: string
          custom_price_tier?: string | null
          email: string
          gstin?: string | null
          id?: string
          moq?: number | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["wholesale_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_name?: string
          contact_name?: string | null
          created_at?: string
          custom_price_tier?: string | null
          email?: string
          gstin?: string | null
          id?: string
          moq?: number | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["wholesale_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_customers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_mv_daily_customers: {
        Row: {
          customers: number | null
          day: string | null
        }
        Relationships: []
      }
      analytics_mv_daily_order_metrics: {
        Row: {
          day: string | null
          orders: number | null
          revenue: number | null
        }
        Relationships: []
      }
      order_dispatch_list: {
        Row: {
          collection_name: string | null
          edition_label: string | null
          group_key: string | null
          line_type: string | null
          order_id: string | null
          order_number: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          product_name: string | null
          quantity: number | null
          ship_full_name: string | null
          ship_phone: string | null
          size: string | null
          sku: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          vessel: string | null
          volume_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_variant_tracking: { Args: { p: Json }; Returns: Json }
      add_recall_batches: { Args: { p: Json }; Returns: Json }
      add_shipment_event: { Args: { p: Json }; Returns: undefined }
      adjust_batch_inventory: { Args: { p: Json }; Returns: Json }
      adjust_inventory: { Args: { p: Json }; Returns: Json }
      advance_batch_lifecycle: { Args: { p: Json }; Returns: Json }
      allocate_invoice_number: { Args: never; Returns: string }
      allocate_order_batches: {
        Args: { p_actor: string; p_order_id: string }
        Returns: Json
      }
      allocate_order_number: { Args: never; Returns: string }
      analytics_daily_series_v1: {
        Args: { p_window_days?: number }
        Returns: {
          day: string
          orders: number
          revenue: number
        }[]
      }
      analytics_daily_series_v2: {
        Args: { p_window_days?: number }
        Returns: {
          customers: number
          day: string
          orders: number
          revenue: number
        }[]
      }
      analytics_kpi_snapshot_v1: {
        Args: { p_window_days?: number }
        Returns: {
          cur_orders: number
          cur_revenue: number
          prev_orders: number
          prev_revenue: number
          today_orders: number
          today_revenue: number
          yday_orders: number
          yday_revenue: number
        }[]
      }
      analytics_refresh_mvs: { Args: never; Returns: undefined }
      apply_recall_containment: { Args: { p: Json }; Returns: Json }
      apply_stock_movement: {
        Args: {
          p_actor_id: string
          p_delta: number
          p_idempotency_key: string
          p_metadata: Json
          p_movement_type: string
          p_note: string
          p_reason: string
          p_reference: string
          p_source_id: string
          p_source_type: string
          p_variant_id: string
        }
        Returns: Json
      }
      assert_shipment_dispatchable: {
        Args: { p_shipment_id: string }
        Returns: Json
      }
      assert_tracked_shipment_ready: {
        Args: { p_order_id: string }
        Returns: Json
      }
      attribute_receipt_restock: {
        Args: {
          p_actor: string
          p_movement_type: string
          p_order: string
          p_receipt_id: string
          p_receipt_item_id: string
          p_reference: string
          p_restockable: number
          p_src_id: string
          p_src_type: string
          p_variant: string
        }
        Returns: Json
      }
      available_stock: { Args: { p_variant_id: string }; Returns: number }
      backfill_opening_balances: { Args: never; Returns: number }
      batch_affected_orders: {
        Args: { p_batch_id: string }
        Returns: {
          fulfillment_status: string
          order_id: string
          order_item_id: string
          order_status: string
          provenance: string
          qty: number
        }[]
      }
      batch_config_fingerprint: {
        Args: { p_batch_id: string }
        Returns: string
      }
      batch_format_code: {
        Args: { p_product_type: string; p_size_label: string; p_vessel: string }
        Returns: string
      }
      batch_label_payload: {
        Args: { p_batch_id: string; p_purpose: string }
        Returns: Json
      }
      batch_material_lots: {
        Args: { p_batch_id: string }
        Returns: {
          material_id: string
          material_lot_id: string
          qty_consumed: number
          received_on: string
          supplier_lot_code: string
          supplier_name: string
          uom: string
        }[]
      }
      batch_onhand: { Args: { p_batch_id: string }; Returns: number }
      batch_open_recall_kind: { Args: { p_batch_id: string }; Returns: string }
      batch_recall_accounting: { Args: { p_batch_id: string }; Returns: Json }
      batch_recall_impact: {
        Args: { p_batch_id: string }
        Returns: {
          order_id: string
          order_item_id: string
          order_status: string
          provenance: string
          qty: number
          shipment_state: string
        }[]
      }
      begin_refund: { Args: { p: Json }; Returns: Json }
      cancel_order: { Args: { p: Json }; Returns: Json }
      claim_due_notifications: {
        Args: { p_limit: number }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attempts: number
          category: string | null
          channel: string
          claimed_at: string | null
          correlation_id: string | null
          correlation_key: string | null
          created_at: string
          dead_at: string | null
          dead_reason: string | null
          dedup_key: string | null
          delivered_recipients: string[]
          delivery_ms: number | null
          entity_ref: string | null
          entity_type: string | null
          error: string | null
          event: string
          expires_at: string | null
          group_id: string | null
          id: string
          last_attempt_at: string | null
          last_occurrence_at: string | null
          next_retry_at: string | null
          occurrence_count: number
          payload: Json | null
          provider_message_id: string | null
          read_at: string | null
          replayed_at: string | null
          replayed_by: string | null
          retention_class: string
          retry_history: Json
          severity: string
          status: string
          target: string | null
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_fulfillment_jobs: {
        Args: { p_job_type: string; p_limit?: number }
        Returns: {
          attempts: number
          id: string
          order_id: string
        }[]
      }
      close_return_receiving: {
        Args: { p_actor_id?: string; p_return_id: string }
        Returns: Json
      }
      close_rto_receiving: {
        Args: { p_actor_id?: string; p_shipment_id: string }
        Returns: Json
      }
      commit_receipt: {
        Args: { p_actor_id?: string; p_receipt_id: string }
        Returns: Json
      }
      commit_return_receipt: {
        Args: { p_actor_id?: string; p_receipt_id: string }
        Returns: Json
      }
      commit_rto_receipt: {
        Args: { p_actor_id?: string; p_receipt_id: string }
        Returns: Json
      }
      complete_fulfillment_job: {
        Args: { p_error?: string; p_id: string; p_status: string }
        Returns: undefined
      }
      confirm_label_printed: { Args: { p: Json }; Returns: Json }
      confirm_pick_batch: { Args: { p: Json }; Returns: Json }
      confirm_shipment_provenance: {
        Args: { p_actor?: string; p_shipment_id: string }
        Returns: Json
      }
      consume_coupon: { Args: { p_order_id: string }; Returns: Json }
      create_batch: { Args: { p: Json }; Returns: Json }
      create_pending_order: { Args: { p: Json }; Returns: Json }
      create_recall_case: { Args: { p: Json }; Returns: Json }
      create_shipment: { Args: { p: Json }; Returns: Json }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dispose_exception_shortfall: { Args: { p: Json }; Returns: Json }
      expand_recall_batches: { Args: { p: Json }; Returns: Json }
      expire_stale_pending_orders: {
        Args: { p_minutes?: number }
        Returns: number
      }
      finalize_order: {
        Args: {
          p_amount_paise?: number
          p_payment_id: string
          p_razorpay_order_id: string
          p_signature: string
          p_source: string
        }
        Returns: Json
      }
      financial_year: { Args: { p_ts: string }; Returns: string }
      generate_batch_code: {
        Args: { p_date: string; p_format: string; p_prefix: string }
        Returns: string
      }
      generate_label: { Args: { p: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_editor: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      lot_affected_orders: {
        Args: { p_lot_id: string }
        Returns: {
          batch_id: string
          order_id: string
          order_item_id: string
          provenance: string
          qty: number
        }[]
      }
      material_lot_batches: {
        Args: { p_lot_id: string }
        Returns: {
          batch_code: string
          batch_id: string
          lifecycle_status: string
          qty_consumed: number
          recall_state: string
          variant_id: string
        }[]
      }
      next_batch_sequence: { Args: { p_scope_key: string }; Returns: number }
      next_counter: {
        Args: { p_period: string; p_scope: string }
        Returns: number
      }
      order_allocation_blocked: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      order_fulfillment_blocked: { Args: { p_order_id: string }; Returns: Json }
      order_item_entitlements: { Args: { p_order_id: string }; Returns: Json }
      order_pick_fingerprint: { Args: { p_order_id: string }; Returns: string }
      order_variant_provenance: {
        Args: { p_order: string; p_variant: string }
        Returns: {
          batch_id: string
          qty: number
        }[]
      }
      payable_window_minutes: { Args: never; Returns: number }
      prepare_recall_notifications: { Args: { p: Json }; Returns: Json }
      queue_fulfillment_job: {
        Args: { p_job_type: string; p_order_id: string }
        Returns: undefined
      }
      reallocate_order_exception: { Args: { p: Json }; Returns: Json }
      recall_case_transition: { Args: { p: Json }; Returns: Json }
      recall_stamp_batch: { Args: { p_batch_id: string }; Returns: undefined }
      record_audit_event: { Args: { p: Json }; Returns: undefined }
      record_design_validation: { Args: { p: Json }; Returns: Json }
      record_material_consumption: { Args: { p: Json }; Returns: Json }
      record_notification: { Args: { p: Json }; Returns: Json }
      record_packing_qc: { Args: { p: Json }; Returns: Json }
      record_payment_attempt: { Args: { p: Json }; Returns: undefined }
      record_qc: { Args: { p: Json }; Returns: Json }
      register_material: { Args: { p: Json }; Returns: Json }
      register_material_lot: { Args: { p: Json }; Returns: Json }
      release_batch: { Args: { p: Json }; Returns: Json }
      release_batch_containment: { Args: { p: Json }; Returns: Json }
      release_coupon: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      release_cron_lock: {
        Args: { p_job: string; p_token: string }
        Returns: boolean
      }
      release_expired_reservations: { Args: never; Returns: number }
      reserve_coupon: {
        Args: {
          p_benefit_paise: number
          p_coupon_code: string
          p_email: string
          p_identity: string
          p_order_id: string
          p_user_id: string
        }
        Returns: Json
      }
      reserve_stock: { Args: { p: Json }; Returns: Json }
      resolve_exception_by_refund: { Args: { p: Json }; Returns: Json }
      resolve_order_inventory_exception: { Args: { p: Json }; Returns: Json }
      resolve_receipt_hold: { Args: { p: Json }; Returns: Json }
      restock_return_items: { Args: { p_return_id: string }; Returns: number }
      restore_coupon: {
        Args: { p_actor_id?: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      revoke_design_validation: { Args: { p: Json }; Returns: Json }
      section_analytics: {
        Args: { p_days?: number; p_page_key: string }
        Returns: {
          avg_scroll: number
          clicks: number
          conversions: number
          section_id: string
          views: number
        }[]
      }
      set_batch_hold: { Args: { p: Json }; Returns: Json }
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_user_id: string
        }
        Returns: undefined
      }
      settle_refund: { Args: { p: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_batch_production: { Args: { p: Json }; Returns: Json }
      try_acquire_cron_lock: {
        Args: { p_job: string; p_ttl_seconds: number }
        Returns: string
      }
      update_batch: { Args: { p: Json }; Returns: Json }
      upsert_qc_template: { Args: { p: Json }; Returns: Json }
      variant_batch_reconciliation: {
        Args: { p_variant_id: string }
        Returns: Json
      }
      variant_reserved: {
        Args: { p_variant_ids: string[] }
        Returns: {
          reserved: number
          variant_id: string
        }[]
      }
    }
    Enums: {
      blog_status: "draft" | "scheduled" | "published"
      coupon_type: "percent" | "fixed" | "free_shipping"
      fragrance_layer: "top" | "heart" | "base"
      loyalty_tier: "bronze" | "silver" | "gold" | "platinum"
      loyalty_txn_type: "earn" | "redeem" | "expire" | "bonus"
      ndr_status: "delivery_failed" | "re_attempt_scheduled" | "rto"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "packed"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "returned"
        | "rto"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      product_status: "active" | "draft" | "archived" | "out_of_stock"
      review_status: "pending" | "approved" | "rejected"
      user_role: "customer" | "editor" | "manager" | "admin" | "super_admin"
      vessel_type: "glass" | "ceramic" | "terracotta"
      webhook_status: "received" | "processed" | "failed" | "duplicate"
      wholesale_status: "pending" | "approved" | "suspended"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      blog_status: ["draft", "scheduled", "published"],
      coupon_type: ["percent", "fixed", "free_shipping"],
      fragrance_layer: ["top", "heart", "base"],
      loyalty_tier: ["bronze", "silver", "gold", "platinum"],
      loyalty_txn_type: ["earn", "redeem", "expire", "bonus"],
      ndr_status: ["delivery_failed", "re_attempt_scheduled", "rto"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
        "rto",
      ],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      product_status: ["active", "draft", "archived", "out_of_stock"],
      review_status: ["pending", "approved", "rejected"],
      user_role: ["customer", "editor", "manager", "admin", "super_admin"],
      vessel_type: ["glass", "ceramic", "terracotta"],
      webhook_status: ["received", "processed", "failed", "duplicate"],
      wholesale_status: ["pending", "approved", "suspended"],
    },
  },
} as const

