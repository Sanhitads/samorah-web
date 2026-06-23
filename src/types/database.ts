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
      collections: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          hero_product_id: string | null
          id: string
          is_active: boolean
          is_coming_soon: boolean
          name: string
          poetic_line: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
          volume: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hero_product_id?: string | null
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          name: string
          poetic_line?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          volume?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hero_product_id?: string | null
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          name?: string
          poetic_line?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
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
      coupons: {
        Row: {
          auto_apply: boolean
          code: string
          created_at: string
          description: string | null
          expires_at: string | null
          first_order_only: boolean
          id: string
          is_active: boolean
          max_discount: number | null
          max_uses: number | null
          max_uses_per_user: number | null
          min_order: number
          product_id: string | null
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          used_count: number
          user_id: string | null
          value: number
        }
        Insert: {
          auto_apply?: boolean
          code: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order?: number
          product_id?: string | null
          starts_at?: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          used_count?: number
          user_id?: string | null
          value: number
        }
        Update: {
          auto_apply?: boolean
          code?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_order?: number
          product_id?: string | null
          starts_at?: string | null
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
      order_items: {
        Row: {
          bundle_components: Json | null
          created_at: string
          gst_rate: number
          hsn_code: string
          id: string
          is_bundle: boolean
          line_cgst: number
          line_discount: number
          line_igst: number
          line_sgst: number
          line_subtotal: number
          line_taxable: number
          line_total: number
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          bundle_components?: Json | null
          created_at?: string
          gst_rate: number
          hsn_code: string
          id?: string
          is_bundle?: boolean
          line_cgst?: number
          line_discount?: number
          line_igst?: number
          line_sgst?: number
          line_subtotal: number
          line_taxable?: number
          line_total: number
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sku: string
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          bundle_components?: Json | null
          created_at?: string
          gst_rate?: number
          hsn_code?: string
          id?: string
          is_bundle?: boolean
          line_cgst?: number
          line_discount?: number
          line_igst?: number
          line_sgst?: number
          line_subtotal?: number
          line_taxable?: number
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
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
          awb_number: string | null
          cgst_amount: number
          coupon_code: string | null
          coupon_id: string | null
          courier_name: string | null
          created_at: string
          discount_amount: number
          email: string
          gift_card_amount: number
          gift_note: string | null
          gift_occasion: string | null
          gift_recipient: string | null
          id: string
          idempotency_key: string | null
          igst_amount: number
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
          order_number: string
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          placed_at: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
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
          shiprocket_order_id: string | null
          shiprocket_shipment_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          taxable_amount: number
          total_amount: number
          tracking_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_id?: string | null
          awb_number?: string | null
          cgst_amount?: number
          coupon_code?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number
          email: string
          gift_card_amount?: number
          gift_note?: string | null
          gift_occasion?: string | null
          gift_recipient?: string | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
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
          order_number: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          placed_at?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
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
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_id?: string | null
          awb_number?: string | null
          cgst_amount?: number
          coupon_code?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number
          email?: string
          gift_card_amount?: number
          gift_note?: string | null
          gift_occasion?: string | null
          gift_recipient?: string | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
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
          order_number?: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          placed_at?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
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
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string | null
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
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
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
          allow_backorder: boolean
          base_sku: string
          burn_time: string | null
          category_id: string
          collection_id: string | null
          created_at: string
          cultural_reference: string | null
          flame_persona: string | null
          fragrance_family: string | null
          gst_rate: number
          hsn_code: string
          id: string
          is_featured: boolean
          is_hero: boolean
          lifestyle_use: string | null
          mood_tags: string[]
          name: string
          price: number
          publish_at: string | null
          sale_price: number | null
          scent_group: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          story: string | null
          story_long: string | null
          tagline: string | null
          updated_at: string
          wax_blend: string | null
          weight_grams: number | null
          wick: string | null
        }
        Insert: {
          allow_backorder?: boolean
          base_sku: string
          burn_time?: string | null
          category_id: string
          collection_id?: string | null
          created_at?: string
          cultural_reference?: string | null
          flame_persona?: string | null
          fragrance_family?: string | null
          gst_rate?: number
          hsn_code: string
          id?: string
          is_featured?: boolean
          is_hero?: boolean
          lifestyle_use?: string | null
          mood_tags?: string[]
          name: string
          price: number
          publish_at?: string | null
          sale_price?: number | null
          scent_group?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
          wax_blend?: string | null
          weight_grams?: number | null
          wick?: string | null
        }
        Update: {
          allow_backorder?: boolean
          base_sku?: string
          burn_time?: string | null
          category_id?: string
          collection_id?: string | null
          created_at?: string
          cultural_reference?: string | null
          flame_persona?: string | null
          fragrance_family?: string | null
          gst_rate?: number
          hsn_code?: string
          id?: string
          is_featured?: boolean
          is_hero?: boolean
          lifestyle_use?: string | null
          mood_tags?: string[]
          name?: string
          price?: number
          publish_at?: string | null
          sale_price?: number | null
          scent_group?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          story?: string | null
          story_long?: string | null
          tagline?: string | null
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      users: {
        Row: {
          birthday: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          loyalty_points: number
          loyalty_tier: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent: boolean
          phone: string | null
          referral_code: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          loyalty_points?: number
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent?: boolean
          phone?: string | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          loyalty_points?: number
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier"]
          marketing_consent?: boolean
          phone?: string | null
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      variants: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          price: number
          product_id: string
          sale_price: number | null
          size_label: string | null
          sku: string
          sort_order: number
          stock: number
          updated_at: string
          variant_name: string | null
          vessel_type: Database["public"]["Enums"]["vessel_type"] | null
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          price: number
          product_id: string
          sale_price?: number | null
          size_label?: string | null
          sku: string
          sort_order?: number
          stock?: number
          updated_at?: string
          variant_name?: string | null
          vessel_type?: Database["public"]["Enums"]["vessel_type"] | null
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          price?: number
          product_id?: string
          sale_price?: number | null
          size_label?: string | null
          sku?: string
          sort_order?: number
          stock?: number
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
          provider: string
          retry_count: number
          status: Database["public"]["Enums"]["webhook_status"]
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
          provider: string
          retry_count?: number
          status?: Database["public"]["Enums"]["webhook_status"]
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
          provider?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["webhook_status"]
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
      [_ in never]: never
    }
    Functions: {
      allocate_invoice_number: { Args: never; Returns: string }
      allocate_order_number: { Args: never; Returns: string }
      available_stock: { Args: { p_variant_id: string }; Returns: number }
      release_expired_reservations: { Args: never; Returns: number }
    }
    Enums: {
      blog_status: "draft" | "scheduled" | "published"
      coupon_type: "percent" | "fixed"
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
      coupon_type: ["percent", "fixed"],
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
