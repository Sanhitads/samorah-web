# Business Requirements Document v3.0 â€” searchable text mirror

> Auto-extracted from `docs/Samorah_BRD_v3.pdf` via `pdftotext -layout` on 2026-06-25.
> The **PDF is the canonical original**; this is the greppable text mirror used
> for reference. Tables (GST / HSN / numeric) may be imperfectly aligned â€”
> verify exact figures against the PDF.

---

    SAMORAH

        Business Requirements Document

               v3.0 | Enterprise Custom Platform

 Luxury Handmade Scented Candles -- Complete Build Reference

This document is the single source of truth for every Claude prompt session

Platform          Next.js 15 + TypeScript + Supabase
Frontend
Backend           Next.js 15 + Tailwind CSS + Shadcn UI +
Payments          Framer Motion
Shipping
Email/Marketing   Supabase -- PostgreSQL + Auth + Storage
Hosting           + Edge Functions + pg_cron
Monthly Cost
Document Version  Razorpay -- UPI, RuPay, Cards, Wallets,
                  Net Banking, EMI, COD

                  Shiprocket API -- rate calc, AWB, NDR,
                  tracking, returns

                  Resend + React Email -- 15 templates +
                  sequences

                  Vercel (Frontend) + Supabase Cloud
                  (Backend)

                  65­500/month at launch

                  v3.0 -- June 2025 (Updated: Added 14
                  missing sections)

HOW TO USE THIS BRD WITH CLAUDE:
Step 1: Upload this entire BRD and say: 'Read it and acknowledge. Do not write code yet.'
Step 2: Start each phase with: 'Claude, referring to SAMORAH BRD, execute Phase [N].'
Step 3: Build one file at a time. Never ask Claude to build entire pages in one prompt.
Step 4: Reference section numbers (e.g., 'Section 8.3') when asking for specific features.
1. Project Overview

Brand Name    Samorah
Industry
Platform      Luxury Handmade Scented Candles

Domain        Custom-built -- Next.js 15 + Supabase (No WooCommerce / No
              Shopify)
Database
              Purchased via GoDaddy -- connected to Vercel, auto SSL via
Image CDN     Let's Encrypt
Payment
              Supabase PostgreSQL -- with pg_cron for scheduled jobs
Shipping      (abandoned cart, backups)
Email
Monthly Cost  Cloudinary -- auto WebP/AVIF, CDN, transformation

              Razorpay -- UPI, RuPay, Cards, Net Banking, Wallets, EMI,
              COD

              Shiprocket API -- NDR management included

              Resend + React Email -- 15+ templates + marketing sequences

              65­500/month at launch vs 2,500­8,000/month on Shopify

1.1 Core Objectives

    · Editorial luxury ecommerce experience -- Trudon, Aesop, Byredo, Dior aesthetic
         quality

    · Complete Admin Panel: products, orders, inventory, SKUs, coupons, blog,
         analytics, banners

    · Full inventory management with SKUs, low-stock alerts, audit trail, CSV bulk
         operations

    · RBAC: 5 user roles -- Customer, Editor, Manager, Admin, Super Admin
    · Razorpay: UPI, RuPay, Cards, Wallets, EMI, COD -- with idempotent webhook

         handling
    · Shiprocket: AWB, tracking, NDR management, COD reconciliation
    · GST-compliant Tax Invoices with HSN codes -- legally required in India
    · Marketing automation: abandoned cart sequences, welcome flow, festival

         campaigns
    · Loyalty system, referral program, gift cards -- Phase 2 ready schema included
    · Performance: <2s load, Lighthouse >90, Supabase pg_cron for background jobs
2. Technology Stack

2.1 Frontend   Technology               Purpose
               Next.js 15 (App Router)
 Layer                                  SSR, ISR, SSG, Server Components,
 Framework                              API Routes

Language       TypeScript               Type safety -- all components, stores,
                                        API routes typed
Styling        Tailwind CSS
                                        Utility-first -- no CSS bloat, full design
UI Components Shadcn UI                 control

Animations     Framer Motion + GSAP     Accessible headless components --
                                        themed to Samorah brand
State          Zustand (8 stores)
                                        Luxury micro-animations, scroll effects,
Forms          React Hook Form + Zod    page transitions

Data Fetching  TanStack Query           Cart, auth, wishlist, checkout, UI,
                                        search, notifications
Admin Tables   TanStack Table
                                        Client + server validation, TypeScript-
                                        safe schemas

                                        Server state caching, background
                                        refetch, stale-while-revalidate

                                        Sortable, filterable, paginated admin
                                        data tables

2.2 Backend & Infrastructure

Service        Technology               Purpose
Database       Supabase PostgreSQL
                                        Primary store -- products, orders,
Auth           Supabase Auth            users, inventory

Storage        Supabase Storage         JWT, OAuth, OTP, Magic Link, email
                                        verification
Edge Functions Supabase Edge Functions
                                        Backup storage -- Cloudinary is
Scheduled Jobs Supabase pg_cron         primary image CDN

                                        Webhook handlers, payment verify,
                                        Shiprocket sync

                                        Abandoned cart sweeps, backup
                                        exports, stock alerts
Realtime    Supabase Realtime       Live order status in admin -- new
RLS                                 orders ping dashboard
API Routes  PostgreSQL Row-Level    Users read/write only their own data
            Security
            Next.js API Routes      Razorpay webhook, Shiprocket sync,
                                    idempotent handlers

2.3 External Integrations

Service     Provider                Purpose
Payments    Razorpay
Shipping                            UPI, RuPay, Cards, Wallets, Net Banking,
Email       Shiprocket              EMI, COD -- idempotent webhooks
Images
CMS         Resend + Brevo          Order sync, AWB, pickup, NDR
Analytics   (optional)              management, tracking, returns
Search      Cloudinary
GST / Tax                           Transactional + marketing automation
            Sanity CMS              sequences

            GA4 + Meta Pixel +      Auto WebP/AVIF, resize, CDN -- 25GB
            Clarity                 free tier
            PG Full-Text (P1) /
            Algolia (P2)            Blog, journal, editorial sections -- editor-
            Manual (HSN + GST rate  friendly
            fields)
                                    Traffic, conversion funnels, heatmaps, GA4
                                    events

                                    Product search, autocomplete, AI semantic
                                    search (P2)

                                    Legally required for Indian tax invoices
3. Folder & Route Architecture

3.1 Folder Structure

Directory               Purpose

src/app/(store)/        Customer-facing storefront routes -- home, shop, product,
                        collection, cart, checkout

src/app/(admin)/        Admin panel routes -- protected by Next.js Middleware (role:
                        editor+)

src/app/api/            Next.js API routes -- Razorpay webhook (idempotent),
                        Shiprocket sync, abandoned cart trigger

src/components/ui/      Shadcn design system: Button, Input, Card, Modal, Toast,
                        Drawer, Accordion, Tabs

src/components/sections/ Page sections: Hero, CollectionSlider, ScentExperience,
                                     BundleBuilder, Newsletter

src/components/layout/  Header, MegaMenu, Footer, AdminSidebar, AdminTopbar,
                        AnnouncementBar

src/store/              8 Zustand stores -- see Section 7 for full spec + hydration fix

src/hooks/              useStore (hydration-safe), useCart, useWishlist, useAuth,
                        useSearch, useToast

src/lib/                supabaseClient.ts, razorpay.ts, shiprocket.ts, cloudinary.ts,
                        resend.ts

src/services/           productService, orderService, authService, inventoryService,
                        couponService, loyaltyService

src/types/              Product, Variant, Order, User, Cart, Coupon, GiftCard,
                        LoyaltyPoints, AuditLog

src/config/             constants.ts, featureFlags.ts, gst.ts (HSN codes + rates)

src/styles/             globals.css -- CSS design tokens (all --var declarations from
                        Section 4)

middleware.ts           JWT check + role enforcement on every /account/* and /admin/*
                        request

3.2 Key Routes          Rendering  Notes
                        ISR 60s
 Route                             Homepage -- banner manager controls
 /                      SSG        hero/announcement/campaign blocks

 /shop/[slug]                      Product page -- 12 sections
/collections/[slug]       SSG         Collection editorial page
/bundles                  CSR
/checkout                 SSR         Interactive bundle builder

/admin/inventory          Admin only  GST-aware -- calculates CGST/SGST/IGST
                                      at runtime
/admin/banners            Admin only
                                      SKU management, stock adjustments, CSV
/admin/loyalty            Admin only  import
/admin/gift-cards         Admin only
/admin/ndrs               Admin only  Homepage Banner Manager -- hero,
                                      announcement, campaign, footer quote
/api/razorpay/webhook     API Route
                                      Loyalty points, tiers, referrals
/api/cron/abandoned-cart  API Route
                                      Gift card generation and tracking

                                      Shiprocket NDR (Non-Delivery Report)
                                      management

                                      Idempotent -- checks order.status before
                                      processing

                                      Called by Supabase pg_cron every hour
4. Branding & Design System

4.1 Reference Brands

Brand             Reference & Takeaway
Trudon
                  trudon.com -- dark editorial, cinematic chapter layout, mega menu with
Aesop             campaign images

Byredo            aesop.com -- restrained luxury, high whitespace, editorial typography,
Dior              no noise
Boy Smells
                  byredo.com -- minimal black/white, no-noise luxury, product-first
Voluspa
                  dior.com -- cinematic campaign energy, collection editorial layout

                  boysmells.com -- modern candle UX, variant selector, fragrance notes
                  UI

                  voluspa.com -- lifestyle grid, atmospheric imagery, Instagram-feel
                  gallery

4.2 CSS Design Tokens (globals.css)

CSS Variable      Value      Usage
--bg-primary      #F5F2ED    Main site background -- warm ivory
--bg-secondary    #ECE7E0    Section backgrounds
--text-primary    #181818    Headings, primary text
--text-secondary  #5F5A55    Body text, descriptions
--accent          #9C826B    CTAs, highlights, prices, badges
--border-soft     #DDD6CD    Borders, dividers
--dark-bg         #181818    Dark sections, scent experience, footer

4.3 Typography

Element           Font       Specs
H1 Hero                      Bold, 64­96px, letter-spacing -0.02em
H2 Section        Cormorant  SemiBold, 36­48px
Body              Garamond   Regular 400, 16px, line-height 1.7

                  Cormorant
                  Garamond

                  DM Sans
Labels  DM Sans    Uppercase, letter-spacing 0.12em, 11­12px
Prices             Medium 500, 20­24px
        Cormorant
        Garamond

4.4 Animation System

    · Fade-in on scroll: opacity 01, translateY(20px)0, 0.4s ease-out
    · Product image hover: scale(1.03), 0.4s -- never aggressive
    · Navigation: transparent  warm ivory on scroll (0.3s)
    · All animations respect prefers-reduced-motion media query
5. Website Architecture & Pages

5.1 Full Sitemap      Page            Key Sections
                      Home
 Route                                Hero (Banner Manager), Signature Chapters,
 / (home)             Shop All        Brand Story, Scent Exp, Featured, Testimonial,
                      Product Page    Instagram Grid, Newsletter, Footer
 /shop                Collection
 /shop/[slug]         Bundle Builder  Filters (price, category, mood, fragrance family),
 /collections/[slug]  Cart            grid, sort, pagination
 /bundles             Checkout
 /cart                Account         12 sections -- gallery, variants, story, fragrance
 /checkout            Blog            notes, reviews, recommendations
 /account/*           Contact
 /journal/[slug]      Archive         Editorial hero, featured product, supporting
 /contact             Gift Cards      product grid
 /archive
 /gift-cards                          3-candle composition builder -- vessel filter,
                                      composition tray, savings display

                                      Items, quantities, coupon, gift note, gift card
                                      redeem, shipping estimate

                                      Address  Delivery  Payment (Razorpay) 
                                      Review  Confirmation (GST invoice)

                                      Profile, addresses, orders, wishlist, loyalty points,
                                      reviews

                                      Editorial blog posts via Sanity CMS

                                      Minimal form, FAQs, WhatsApp link

                                      Retired fragrances grouped by volume

                                      Purchase and redeem Samorah gift cards

5.2 Homepage -- Banner Manager Controlled Sections

 IMPORTANT: All homepage editorial sections below are controlled by the Homepage Banner
 Manager (Section 27).
 Editors can update hero heading, announcement text, campaign images, and newsletter
 quote WITHOUT touching code.
 This eliminates the need for developer involvement for routine content updates.

# Section             Controlled By
1 Announcement Bar    Banner Manager -- text, link, background color
2 Navigation + Mega     Code -- structure fixed, campaign image per chapter is Banner
       Menu             Manager

3 Hero                  Banner Manager -- heading, subtext, CTA text/link,
                        background image

4 Signature Chapters    Admin -- collection management, cover images
       Slider

5 Brand Story Block     Banner Manager -- image, heading, copy, CTA

6 Scent Experience      Code -- fragrance families from database
       (dark)

7 Air Chapter + Bundle Banner Manager -- campaign images, CTA links for both
                                        blocks

8 Featured Product      Admin -- mark product as is_featured = true

9 Testimonial Quote     Banner Manager -- quote text, attribution

10 Instagram            Admin -- Instagram Gallery Manager (Section 27)
       Atmosphere Grid

11 Newsletter           Banner Manager -- headline, subtext

12 Footer               Banner Manager -- poetic footer statement

5.3 Cart -- Gift Features

    · Gift Note field: free-text, max 200 chars -- printed on packing slip and shown in
         order

    · Gift recipient name (optional -- for luxury gift-wrap orders)
    · Occasion dropdown: Birthday | Anniversary | Diwali | Christmas | Just Because |

         Other
    · Gift card redemption: apply gift card code (validates balance, deducts from total)
    · Gift wrap option (Phase 2): checkbox for branded Samorah gift box (+99)
6. Authentication & Authorization

6.1 Authentication Methods

Method                 Provider         Notes
Email + Password                        Email verification required, bcrypt hashing
Google OAuth           Supabase Auth    One-click login, profile auto-fill

OTP (Phone)            Supabase Auth +  6-digit OTP, 10-min expiry. "Strict IP-based
                       Google           rate limiting on the /api/auth/otp request
                                        endpoint (e.g., max 3 requests per 15
                       Supabase Auth +  minutes) to prevent SMS bombing fraud"?
                       SMS

Magic Link             Supabase Auth    Passwordless email -- 15-min expiry
Guest Checkout         N/A
                                        No account needed -- tracked by email +
                                        order number

6.2 JWT Token Architecture

    · Access Token: 15-minute expiry -- stored in memory ONLY (never localStorage)
    · Refresh Token: 7-day expiry -- httpOnly Secure SameSite=Strict cookie
    · Token rotation on every use -- prevents replay attacks
    · Next.js Middleware validates JWT on every /account/* and /admin/* request

6.3 RBAC -- 5 Roles & Permission Matrix

Action                 Customer         Editor  Manager  Admin  SuperAdmin
Browse / shop          Yes              Yes     Yes      Yes    Yes
Write reviews          Yes              Yes     Yes      Yes    Yes
Publish blog posts     No               Yes     Yes      Yes    Yes
Edit homepage banners  No               Yes     Yes      Yes    Yes
Add/edit products      No               No      Yes      Yes    Yes
Manage inventory/SKUs  No               No      Yes      Yes    Yes
Process orders + NDR   No               No      Yes      Yes    Yes
Create coupons         No               No      Yes      Yes    Yes
Initiate refunds       No               No      No       Yes    Yes
Manage loyalty/gift cards No  No  No  Yes  Yes

Change user roles  No         No  No  No   Yes

Access audit logs  No         No  No  No   Yes

System settings/API keys No   No  No  No   Yes
7. State Management -- Zustand

7.1 Critical: Next.js Hydration Fix

  CRITICAL TECHNICAL REQUIREMENT -- Must implement before any store uses
 localStorage persistence.

 The Problem: Next.js renders pages on the server first. localStorage does not exist on the
 server.
 Using Zustand with persist(localStorage) causes a Hydration Mismatch Error -- the site
 CRASHES on load.

 The Fix: Implement a custom useStore hook that delays rendering persisted Zustand state
 until the
 client-side component has mounted. Pattern:

 const useStore = <T, F>(store: (callback: (state: T) => unknown) => unknown, callback:
 (state: T) => F) => {

   const result = store(callback) as F;
   const [data, setData] = useState<F>();
   useEffect(() => { setData(result); }, [result]);
   return data;
 };

 Use this hook everywhere persisted store state is rendered in a component.
 Claude Prompt Note: When building any Zustand store with localStorage, reference this fix.

7.2 The 8 Zustand Stores

Store             State Fields                              Key Actions
useUserStore      user, isLoggedIn, role, addresses,
useCartStore      loyaltyPoints, tier                       setUser, clearUser,
                                                            updateProfile, addAddress,
useWishlistStore  items[], totalItems, totalPrice, coupon,  updateLoyaltyPoints
                  giftCard, discount, giftNote, occasion
                                                            addItem, removeItem,
                  items[], count                            updateQty, applyCoupon,
                                                            applyGiftCard, clearCart,
                                                            setGiftNote

                                                            addToWishlist,
                                                            removeFromWishlist,
                                                            syncToServer, isWishlisted
useCheckoutStore    address, delivery, payment,           setAddress, setDelivery,
                    gstBreakdown, step, orderId,          setGSTBreakdown,
                    isProcessing                          nextStep, prevStep, reset

useProductStore     filters{price,category,mood,fragrance}, setFilter, clearFilters,

                    sort, view, searchQuery, page         setSort, setView, setSearch,

                                                          setPage

useSearchStore      query, results[], isOpen, isLoading,  setQuery, setResults,
                    history[], aiSuggestions[]            openSearch, clearHistory,
                                                          setAISuggestions

useUIStore          isMiniCartOpen, isMenuOpen,           openMiniCart, toggleMenu,
                    toasts[], activeModal, bannerData     addToast, removeToast,
                                                          openModal

useNotificationStore notifications[], unreadCount         addNotification, markRead,
                                                          markAllRead, clearAll

7.3 Cart Persistence Logic

Scenario            Behavior
Guest adds to cart
Guest logs in       Zustand + localStorage -- no login required, survives page
Checkout initiated  refresh
Payment confirmed
Gift card applied   Guest cart merged with server cart -- duplicates have quantities
                    combined

                    15-minute stock reservation triggered -- released on payment
                    fail or timeout

                    Cart cleared from Zustand + localStorage + Supabase,
                    inventory decremented

                    Gift card balance validated via API  partial deduction 
                    remaining tracked
8. Database Schema (PostgreSQL -- Supabase)

8.1 Schema Overview

 All tables: id (UUID PK), created_at, updated_at auto-managed by Supabase
 Row-Level Security (RLS) enabled on every table
 GST fields added per Indian law -- HSN code + CGST/SGST/IGST amounts
 Idempotency keys stored on orders -- prevents double-processing of webhooks

8.2 Users & Addresses

Table      Column           Type            Description

users      id               UUID PK         Supabase Auth user ID

users      email            VARCHAR         Primary login identity
                            UNIQUE

users      role             ENUM            customer|editor|manager|admin|super_admin

users      phone            VARCHAR(20) For OTP login

users      loyalty_points INTEGER           Current loyalty point balance
                                 DEFAULT 0

users      loyalty_tier ENUM                bronze|silver|gold|platinum

users      referral_code VARCHAR            Auto-generated unique referral code per user
                                 UNIQUE

users      birthday         DATE            For birthday email campaign (optional)

addresses user_id           UUID FK         References users.id

addresses  full_name,       Various         Standard Indian address fields
           phone, line1,
           line2, city,
           state,
           pincode

addresses is_default        BOOLEAN         Default delivery address

8.3 Products, Variants & GST Fields

Table          Column                Type     Description
products                             VARCHAR
               name, slug,                    Display name, URL slug, base
               base_sku                       SKU (e.g. SAM-CAN-001)
products  hsn_code             VARCHAR(10)  GST required -- e.g. '3406' for
products                                                candles
products
products  gst_rate             INTEGER       GST rate -- 12 or 18 (percent).
products                                    Candles = 12%
products
products  price, sale_price    DECIMAL(10,2) Prices include GST (MRP model)
products
variants  category_id,         UUID FK      Category and collection
variants  collection_id                     assignment
variants
variants  status               ENUM         active|draft|archived|out_of_stock

          is_featured          BOOLEAN      Appears on homepage featured
                                            section

          weight_grams         INTEGER      For Shiprocket shipping rate
                                            calculation

          seo_title,           VARCHAR      Max 70 and 160 chars
          seo_description                   respectively

          sku                  VARCHAR      e.g. SAM-CAN-001-180G -- DB

                               UNIQUE       unique constraint

          price, stock,        DECIMAL/INT  Variant price, current stock, alert
                                            threshold (default 5)
          low_stock_threshold

          vessel_type,         ENUM /       glass|ceramic|terracotta | 100g,
          size_label           VARCHAR      140g, 180g

          barcode              VARCHAR(100) EAN-13 for label printing

8.4 Orders -- GST & Idempotency Fields

Table Column                 Type           Description
orders order_number          VARCHAR        e.g. SAM-2025-0001
                             UNIQUE
orders status                ENUM           pending|confirmed|processing|packed|shipped|deliver
orders payment_status        ENUM           pending|paid|failed|refunded
orders idempotency_key       VARCHAR         Razorpay payment_id stored here -- prevents dupl
                             UNIQUE         processing
orders    subtotal,                         Financial breakdown
          discount_amount,   DECIMAL
          shipping_amount,
          total_amount

orders cgst_amount           DECIMAL(10,2)  GST required -- CGST portion (intra-state)
orders sgst_amount               DECIMAL(10,2)  GST required -- SGST portion (intra-state)

orders igst_amount               DECIMAL(10,2)  GST required -- IGST (inter-state orders)

orders gift_note, gift_recipient, TEXT/VARCHAR Gift message data from cart
            gift_occasion

orders razorpay_order_id,        VARCHAR     Razorpay references
            razorpay_payment_id

orders shiprocket_order_id,      VARCHAR     Shiprocket references
            awb_number

orders ndr_status                ENUM nullable null|delivery_failed|re_attempt|rto -- for NDR manage

orders loyalty_points_earned, INTEGER        Points awarded and redeemed on this order
            loyalty_points_used

orders gift_card_id,             UUID FK /   Gift card redemption on this order

         gift_card_amount_used DECIMAL

8.5 Supporting Tables -- New in v3.0

Table                 Key Columns & Purpose

audit_logs            id, user_id, action (e.g. 'price_changed'), entity_type, entity_id, before_data JSONB, a
                      ip_address, user_agent, created_at -- full admin action trail

gift_cards            id, code VARCHAR UNIQUE, balance DECIMAL, original_amount, purchaser_user_id
                      expiry_date, is_active, used_amount, created_at

loyalty_transactions  id, user_id, order_id FK nullable, type (earn|redeem|expire|bonus), points_change, po
                      created_at

referral_codes        id, code UNIQUE (= users.referral_code), owner_user_id, referral_count, total_discou

referral_uses         id, referral_code_id FK, referred_user_id, order_id FK, discount_amount, created_at --
                      successful referral

instagram_gallery     id, image_url (Cloudinary), caption TEXT, link_url, is_featured, sort_order, created_at
                      replaces live embed

homepage_banners      id, slot_key
                      (hero|announcement|brand_story|campaign_left|campaign_right|testimonial|newslette
                      heading, subtext, image_url, cta_text, cta_url, bg_color, is_active, updated_at, update

reviews               id, product_id, user_id, rating(1-5), title, comment, images TEXT[], video_url, is_verifie
                      is_approved, helpful_count, admin_reply, replied_at

wholesale_customers id, company_name, contact_name, email, phone, gstin, moq INTEGER, custom_price
                                (pending|approved|suspended), approved_by, approved_at

performance_audits    id, audit_date, lighthouse_score, lcp_ms, cls_score, fcp_ms, broken_links_count, mis
                      low_stock_count, notes TEXT, run_by
coupons     id, code, type (percent|fixed), value, min_order, max_uses, used_count, user_id nulla
blogs       auto_apply BOOLEAN
cart
newsletter  id, title, slug, content, cover_image_url, author_id, status (draft|scheduled|published),
            seo_description, tags TEXT[], categories TEXT[]

            id, user_id nullable, session_id (guests), product_id, variant_id, quantity, added_at, la
            last_activity_at used by pg_cron for abandoned cart detection

            id, email, source, is_active, subscribed_at, unsubscribed_at, tags TEXT[] (for segmen
9. Product & SKU Management

9.1 Product Categories & GST HSN Codes

Category          SKU Prefix  HSN Code  GST Rate
Candles           SAM-CAN     3406
                                        12% -- confirmed for scented candles
Wax Melts         SAM-WMT     3406      in India
Room Sprays       SAM-RSP     3307
                                        12%
Bundles           SAM-BND     3406
Gift Sets         SAM-GFT     3406      18% -- room fresheners attract higher
                                        GST

                                        12% (majority component rule)

                                        12%

 IMPORTANT: HSN codes and GST rates above are based on standard classification.
Samorah should

confirm these with their Chartered Accountant before going live. Wrong HSN = invalid tax
invoice.

9.2 SKU Format & Examples

Category     SKU Format       Examples
                              SAM-CAN-001-100G-GL | SAM-CAN-002-100G-GL
Candle 100g  SAM-CAN-[NUM]-   SAM-CAN-001-140G-CE
Glass        100G-GL          SAM-CAN-001-180G-TE
                              SAM-WMT-001-50G
Candle 140g  SAM-CAN-[NUM]-   SAM-RSP-001-200ML
Ceramic      140G-CE          SAM-BND-001

Candle 180g  SAM-CAN-[NUM]-
Terracotta   180G-TE

Wax Melt     SAM-WMT-[NUM]-
50g          50G

Room Spray   SAM-RSP-[NUM]-
200ml        200ML

Bundle       SAM-BND-[NUM]

9.3 Product Attributes for Filtering

Attribute         Values
Fragrance Family  Floral · Woody · Fresh · Dessert/Gourmand · Spicy · Oriental
Mood             Calm · Warm · Festive · Fresh · Romantic · Cozy
Vessel Material  Glass · Ceramic · Terracotta
Burn Time        35hr · 45hr · 55hr · 65hr
Tags (badges)    Bestseller · New Arrival · Limited · Seasonal · Staff Pick
HSN Code         Per category -- required for invoice
10. Inventory Management

10.1 Core Features

Feature              Specification
Real-time Stock
Stock Reservation    Tracked per variant SKU. Decremented atomically on Razorpay
Low Stock Alert      payment.captured webhook
Backorder
Bundle Stock         15-minute hold on checkout initiation -- Supabase pg_cron
CSV Bulk Update      releases expired reservations
Return Restock
Audit Trail          Admin email (Resend) when stock hits low_stock_threshold
                     (default 5). Also shown in dashboard widget.

                     Per-product allow_backorder flag -- shows 'Ships in 7­10 days' at
                     checkout if enabled

                     Bundle availability = minimum stock of all 3 components. Alert
                     fires on any component hitting threshold.

                     Upload CSV (variant_sku + new_stock)  validation report 
                     preview  confirm (atomic transaction)

                     Admin confirms return  stock restored  inventory_log entry
                     (change_type: return)

                     inventory_logs: date | variant_id | change_type | qty_change |
                     qty_after | note | admin_id

10.2 Inventory Admin Panel Screen

Widget               Content
Summary Cards
Low Stock Table      Total active SKUs | In-stock | Low-stock | Out-of-stock

Stock Movements Log  SKU | Product | Variant | Current Stock | Threshold | Last Restock
                     | Restock Now button
Bulk Restock Tool
                     Filter by: Date | SKU | Change Type | Admin. Columns: Date |
Export Inventory     SKU | Change Type | Qty Change | Qty After | Note

                     Upload CSV  validation errors highlighted  preview all
                     changes  one-click confirm

                     CSV: SKU | Name | Variant | Price | Stock | Threshold | HSN |
                     GST Rate
11. Admin Panel -- Full Specification

11.1 Overview

 URL: samorah.in/admin -- protected by Next.js Middleware (role: editor+)
 Stack: Next.js App Router + Shadcn UI + TanStack Table + Recharts
 Layout: Left sidebar + topbar + main area -- responsive, mobile-friendly

11.2 Dashboard      Content
                    Today's revenue | vs yesterday % | vs last week -- green/red
 Widget             delta
 Revenue Card       Total orders today | Pending | Needs packing
                    Low stock count | Out-of-stock count | 'Requires attention' link
 Orders Card
 Inventory Alert     New: Orders with delivery_failed status needing admin action
 NDR Alert          30-day line chart -- Recharts, hover for daily values
 Revenue Chart      Last 10 orders: Order# | Customer | Amount | Status | Quick
 Recent Orders      update
                    Inline restock shortcut table
 Low Stock Table    Add Product | Create Coupon | View NDRs | Send Newsletter
 Quick Actions

11.3 Product Management (6-Step Form)

Step Name           Fields

1  Basic Info       Name, slug (auto), category, collection, price, sale_price,
                    HSN code, GST rate, weight, status
2  Variants
                    Add/remove rows: variant_name, SKU, price, stock,
3  Images           vessel_type, size_label, barcode, is_active

4  Fragrance Notes  Cloudinary drag-drop upload, reorder, set primary, add alt
                    text (required)
5  SEO
                    Top / Heart / Base -- tag-style input, multiple notes per layer
6  Preview
                    seo_title (70 char count), seo_description (160 char count),
                    SERP snippet preview

                    Live render of product card and product page hero
11.4 Order Management + Tax Invoice

Feature             Specification
Order List
Order Detail        Order# | Customer | Date | Items | Amount | GST | Payment
Tax Invoice PDF     Status | Order Status | Actions

Status Update       Items + images, delivery address, payment ref, Razorpay ID,
Shiprocket          Shiprocket AWB, order timeline, gift note
Refund
Internal Notes       Must be a legal 'Tax Invoice' -- includes: seller GSTIN, buyer
NDR Tab             name/address, HSN per line item, taxable value, CGST/SGST or
                    IGST, invoice number, invoice date

                    Dropdown change  automated Resend email per transition

                    Create shipment  assign courier  AWB  print label 
                    schedule pickup

                    Razorpay refund (full/partial)  restock if returned  refund email

                    Admin-only timestamped notes -- not visible to customer

                     New: Dedicated NDR view -- delivery_failed orders | 'Instruct
                    Re-attempt' button | 'Accept RTO' button

11.5 Coupon Management

Feature             Specification
Create Coupon
Usage Analytics     Code | Type (% or ) | Value | Min order | Max uses | User-specific
Welcome Coupon      | Product restriction | Expiry | First-order-only | Auto-apply flag
Referral Coupons
                    Redemptions | Total discount given | Revenue from coupon users
                    | Who used it

                    Auto-generated first-order coupon in welcome email -- %
                    configurable in Settings

                    Auto-generated when referral link leads to first purchase -- 100
                    off by default

11.6 Gift Card Management

Feature             Specification
Generate Gift Card
                    Admin creates: amount, expiry, recipient email (sends branded
Customer Purchase   delivery email)

                    Customer buys gift card on /gift-cards -- Razorpay payment 
                    code generated  delivery email sent
Redemption            Applied at cart -- code validated  balance checked  partial
Gift Card List        deduction tracked

                      Code | Amount | Balance | Purchaser | Recipient | Expiry | Status

11.7 Loyalty & Referral Management

Feature               Specification
Points Config
Tier Thresholds       Earn rate: X points per 100 spent | Redeem rate: Y points = 1
Customer Points View  -- configurable in settings
Referral Config
Manual Adjustment     Bronze: 0pts | Silver: 500pts | Gold: 1500pts | Platinum: 5000pts
                      -- configurable

                      Per customer: current balance, tier, transaction history, lifetime
                      earned

                      Referrer reward: 100 coupon | Referred reward: 100 off first
                      order -- configurable

                      Super Admin can add/deduct points manually with reason note

11.8 Review Management

Feature               Specification
Review List
Moderation Queue      Product | Rating | Customer | Date | Verified Purchase | Status
Admin Reply           (pending/approved/rejected)
Image/Video
Helpful Votes         New reviews land in pending state -- admin approves/rejects
Export Reviews        before visible on site

                      Reply field per review -- displayed publicly below customer review

                      Customers can upload images (Cloudinary) and video URL with
                      reviews

                      Customers mark reviews as helpful -- sort by most helpful in
                      product page

                      CSV export for external analysis or Klaviyo segmentation

11.9 Blog / Journal Management

Feature               Specification
Rich Editor
                      MDX / Sanity rich text -- image upload, embed product cards,
                      headings, tables, code blocks
Draft / Schedule    Save as draft | Schedule publish date + time | Publish immediately
SEO Fields          | Unpublish
Campaign Tags
                    SEO title | Meta desc | Custom slug | OG image | Tags |
                    Categories

                    Tag posts as: Diwali | Christmas | Valentine | Mother's Day -- for
                    email campaign linking

11.10 SEO, Media Library & Analytics

Section             Key Features
SEO Manager
                    Default meta template | Sitemap download | Robots.txt editor |
Media Library       Redirect manager (301/302) | SEO audit (missing meta, no-alt
Analytics           images, broken links)

                    Cloudinary drag-drop | Search by filename | Alt text editor | Usage
                    tracking (prevents deleting in-use images)

                    Sales report | Product performance | Customer insights | Coupon
                    performance | Inventory report | GA4 embed

11.11 Settings -- Super Admin Only

Setting Group       Options
Store
Tax / GST           Name | Logo | Currency INR | Timezone IST | Email sender | GST
Payments            number | Registered address
Shipping
Email Templates     Store GSTIN | Default state (for CGST/SGST vs IGST logic) | Tax-
Loyalty / Referral  inclusive pricing toggle
Backup
Audit Logs          Razorpay Key ID (masked) | Payment methods on/off | COD
                    enable | Test mode toggle

                    Shiprocket credentials | Free shipping threshold | Pickup address |
                    NDR auto-retry settings

                    Edit all 15 email templates from admin -- no code changes
                    required

                    Points earn rate | Redeem rate | Tier thresholds | Referral reward
                    amounts

                    Manual trigger: DB export | Products CSV | Orders CSV | Last
                    backup timestamp

                    Full log: timestamp | user | action | entity | before JSONB | after
                    JSONB | IP
12. Payment Integration -- Razorpay

12.1 Supported Payment Methods

Method       Details                India Coverage
UPI                                 #1 India payment -- 70%+ digital payments
             GPay, PhonePe,
RuPay Cards  Paytm, BHIM, UPI       Government-promoted, very common
Cards        QR                     Domestic + international

Net Banking  Debit + credit, RuPay  Preferred for high-value orders
Wallets      on UPI                 Common among younger buyers
EMI                                 Increases AOV on bundles
             Visa, Mastercard,
COD          AmEx -- debit +        Trust-building for first-time buyers
             credit

             50+ banks: SBI,
             HDFC, ICICI, Axis

             Paytm, PhonePe,
             Amazon Pay

             No-cost EMI --
             3/6/9/12 months on
             cards

             Cash on delivery --
             pincode-based via
             Shiprocket

12.2 Payment Flow

    1. Customer clicks 'Place Order'  Next.js API: POST /api/razorpay/create-order
    2. Razorpay order created with amount (paise), currency INR, receipt ID -- stored

         in DB
    3. Razorpay checkout overlay opens -- pre-filled name, email, phone
    4. Customer pays -- Razorpay returns payment_id, order_id, signature to frontend
    5. Frontend sends all 3 to POST /api/razorpay/verify
    6. API verifies HMAC SHA256(order_id + '|' + payment_id) using key_secret
    7. Signature valid  order updated  inventory decremented  Shiprocket

         triggered  email sent

12.3 Critical: Webhook Idempotency
 CRITICAL: Razorpay and Shiprocket will sometimes send the SAME webhook event
TWICE due to network retries.

The Problem: If your handler decrements inventory on every payment.captured event,
a duplicate webhook will deduct stock TWICE -- causing phantom inventory loss.

The Fix -- implement in /api/razorpay/webhook:
1. On receiving payment.captured, extract razorpay_payment_id
2. Check: SELECT id FROM orders WHERE idempotency_key = razorpay_payment_id
3. If row exists  order already processed  return 200 OK immediately (do nothing else)
4. If no row  this is the first processing  proceed with inventory, shipping, email
5. Set orders.idempotency_key = razorpay_payment_id BEFORE triggering downstream
actions

Same pattern applies to Shiprocket webhook status updates.

12.4 Webhook Events

Event             System Action (after idempotency check)
payment.captured
                  Order  paid, inventory decremented, GST calculated, Shiprocket
payment.failed    order created, confirmation + invoice email

refund.created    Order  failed, reserved stock released, failure email, customer
refund.processed  shown retry option

                  Log refund, order  refunded, refund initiated email

                  Refund status updated, inventory restocked if return, refund
                  complete email
13. Shipping Integration -- Shiprocket + NDR
Management

13.1 Core Integration Flow

    8. Payment confirmed  POST /v1/external/orders/create to Shiprocket
    9. shiprocket_order_id stored  Admin assigns courier (or auto-assign)
    10. AWB generated  orders.awb_number stored  'Shipped' email triggered
    11. Pickup scheduled  Shiprocket webhook sends status updates
    12. Real-time tracking: Supabase updated on each webhook  /account/orders/[id]

         shows timeline

13.2 Critical: NDR Management (Non-Delivery Reports)

  HIGH RISK IN INDIA: A significant percentage of COD orders result in RTO (Return to
 Origin)
 because the customer is unavailable, rejects the package, or the address is incorrect.

 Without NDR management, these failed deliveries go unnoticed and result in:
 - Lost revenue (product shipped but not delivered, not returned quickly)
 - Increased RTO rate (hurts Shiprocket service rating)
 - Customer dissatisfaction (no communication)

 Required Admin Panel Feature -- NDR Tab in Orders section:
 - Dedicated view: all orders where ndr_status = 'delivery_failed'
 - Columns: Order# | Customer | AWB | Courier | Failure Reason | Failure Date | Action
 - 'Instruct Re-attempt' button  calls Shiprocket NDR API to schedule re-delivery
 - 'Accept RTO' button  marks order for return, triggers refund flow
 - Shiprocket NDR webhook updates orders.ndr_status automatically

13.3 Shipping Features

Feature          Description
Rate Calculator
Multi-courier    Real-time rate at checkout -- pincode + package weight from
NDR Management   variants

                 Auto-select best courier: Blue Dart, Delhivery, DTDC, Ecom
                 Express

                 Admin panel NDR tab -- re-attempt or RTO per failed delivery
Tracking             Branded tracking page at samorah.in/track/[awb] or embedded in
                     account
Cancellation
COD Reconciliation   Before pickup: cancel  restock  Razorpay refund  email

                     COD remittance tracking -- Shiprocket reports deposit date

13.4 Shipping Rules

Rule                 Config
Free Shipping
Standard Delivery    Above 1,000 -- configurable in Admin  Settings  Shipping
Express Delivery
                     5­7 business days -- auto-selected best rate
COD Availability
                     2­3 days -- Blue Dart / Delhivery express -- premium rate
                     passed to customer

                     Pincode-based from Shiprocket -- shown/hidden dynamically at
                     checkout
14. Email System & Marketing Automation

14.1 Technology

 Primary: Resend + React Email -- transactional emails (free: 3,000/month)
 Marketing sequences: Resend Broadcasts -- or Brevo free tier (300 emails/day)
 Scheduled triggers: Supabase pg_cron sweeps cart table hourly for abandoned carts
 All templates editable from Admin  Settings  Email Templates (no code changes)

14.2 Transactional Email Templates (15)

Email               Trigger                 Key Content
Welcome             Registration
                                            Brand welcome + first-order coupon +
Email Verification  Register / OTP          explore collections CTA
OTP                 request
Password Reset      Forgot password         6-digit OTP, 10-min expiry, resend link

Order Confirmed     payment.captured        Secure link -- 30-min expiry, branded
                                            button
Order Packed        Status  packed
Order Shipped       AWB generated           Order# | items with images | GST
                                            breakdown | delivery estimate | Tax Invoice
Delivered           Status  delivered       PDF attachment

Review Request      3 days after delivered  Packed and ready, expected dispatch date

Refund Initiated    Refund created          AWB# | Courier | Live tracking link |
                                            Estimated delivery
Gift Card Delivery  Gift card purchased
                                            Thank you | Write a review CTA | Candle
Loyalty Points      Order delivered         care reminder
Earned
Tier Upgrade        Tier threshold          Product image | One-click star rating |
                    crossed                 Review form link
Newsletter Welcome  Newsletter signup
                                            Amount | Timeline 5­7 days | Order
                                            reference

                                            Gift card code | Balance | Expiry | How to
                                            redeem

                                            Points earned | New balance | Tier status |
                                            Redeem CTA

                                            New tier name (Gold!) | Benefits | Next tier
                                            milestone

                                            Brand story | Best sellers | Unsubscribe link
Low Stock Alert   Stock hits threshold  Admin email: SKU | Product | Variant |
NDR Notification                        Current count
                  Shiprocket NDR
                  webhook               To customer: delivery failed notice | contact
                                        / re-attempt CTA

14.3 Marketing Automation Sequences

Abandoned Cart Sequence (pg_cron sweeps hourly)

Email #  Trigger          Content

Email 1  1 hour after     Subject: 'Your candles are waiting' -- cart items with
         abandon          images, soft reminder, no discount

Email 2  24 hours after   Subject: 'Still thinking about us?' -- cart items,
                          fragrance story excerpt, no discount

Email 3  72 hours after   Subject: 'A small gift for you' -- cart items + 10% off
                          coupon auto-generated, expires in 48h

Mechanism: Supabase pg_cron runs every hour: SELECT carts WHERE
last_activity_at < NOW()-INTERVAL '1 hour' AND NOT EXISTS (order placed). Triggers
Resend API for each matching cart.

Welcome Sequence (new registrations)

Email #  Delay            Content

Email 1  Immediate        Welcome + first-order coupon (WELCOME10 or
                          WELCOME20)

Email 2  Day 3            Brand story -- 'Why we make candles' -- editorial
                          narrative

Email 3  Day 7            'Meet the Chapters' -- introduce Vol. I­IV with shop
                          links

Post-Purchase Sequence

Email #  Delay            Content

Email 1  Order confirmed  Confirmation + Tax Invoice PDF

Email 2  3 days post-     Review request -- product image, star rating, review
         deliver          link

Email 3  30 days post-    Replenishment nudge -- 'Your candle may be running
         deliver          low' + reorder CTA + recommendations
Festival Campaign Schedule

Campaign           Timing           Content Focus

Diwali Collection  3 weeks before   Festival-themed candles, gift sets, bundle
Christmas          Diwali           offers, free shipping

                   Dec 1­25         Festive chapter, gift cards, corporate gifting
                                    CTA
Valentine's Day    Feb 1­14
                                    Romantic fragrance family, bundle builder
Mother's Day       1 week before    feature, gift wrap option

Volume Release     New collection   Gift curation, gift card feature, personalized
Birthday Campaign  launch           message option

                   Day of birthday  Pre-launch teaser  launch day announcement
                                     restock alert

                                    Surprise gift: bonus loyalty points or exclusive
                                    coupon
15. Loyalty System & Referral Program

15.1 Loyalty Points System

Parameter           Default Value (configurable in Admin Settings)
Earn Rate           10 points per 100 spent (configurable)
Redeem Rate         100 points = 10 off (configurable)
Points on Signup    50 bonus points for creating account
Points Expiry       1 year from earn date -- expires if not used
Review Bonus        25 points for approved product review
Birthday Bonus      100 points auto-credited on birthday (if date provided)

15.2 Loyalty Tiers

Tier      Points            Benefits                  Badge Color
          Required
Bronze                      Standard earn rate        Warm tan (#9C826B)
Silver    0­499                                       Silver (#A8A8A8)
                            1.2x earn rate + early
          500­1499          access to new             Gold (#C8A951)
                            collections
Gold      1500­4999                                   Platinum (#818181)
                            1.5x earn rate + free
Platinum  5000+             standard shipping on all
                            orders

                            2x earn rate + free
                            express shipping +
                            exclusive limited
                            releases

15.3 Referral Program

Component           Specification
Referral Code
Share Mechanism     Every user gets a unique referral_code (e.g. SARA100) -- shown
Referrer Reward     in /account dashboard

                    Copy link button: samorah.in?ref=SARA100 | WhatsApp share |
                    Email share

                    100 coupon auto-generated when referred user completes first
                    order
Referred Reward  100 off first order -- applied automatically via ref= URL
Tracking         parameter
Admin View
                 referral_uses table: tracks who referred whom, which order,
                 discount amount

                 Referral leaderboard: top referrers by count and revenue
                 generated

15.4 Customer Account -- Loyalty Dashboard (/account/loyalty)

    · Current points balance (large, prominent display)
    · Current tier badge + progress bar to next tier
    · Points transaction history: date, type (earn/redeem/bonus), amount, order link
    · Redemption widget: enter points to redeem  converts to  discount  apply to

         cart
    · Your referral link with copy button and WhatsApp share
    · Referral history: friends referred, date, reward earned
16. Gift Cards & Gift Messages

16.1 Gift Card System

Feature           Specification
Purchase
                  Customer goes to /gift-cards  selects amount (500 / 1000 /
Code Format       2000 / custom)  Razorpay payment  code generated 
Balance Tracking  delivery email to recipient
Expiry
Application       SAM-GC-[8 random chars] -- e.g. SAM-GC-X7K2M9PT
Admin
Recipient Email   Partial redemption supported -- remaining balance preserved until
                  expiry

                  12 months from purchase date -- shown in delivery email

                  Applied at cart -- code field  validated  balance deducted 
                  remaining tracked

                  Admin can manually generate gift cards (e.g. for customer service
                  resolution)

                  Branded email: gift card code, amount, expiry, personal message
                  from sender, redeem CTA

16.2 Gift Messages (at Checkout)

Field             Specification
Gift Note
                  Free text, max 200 chars -- printed on packing slip, shown in
Recipient Name    order detail
Occasion
                  Optional -- 'To: [name]' printed on packing slip
Gift Wrap
Packing Slip      Dropdown: Birthday | Anniversary | Diwali | Christmas | Mother's
                  Day | Just Because | Other

                  Phase 2 -- checkbox for branded Samorah box (+99)

                  When gift note present: packing slip shows 'Gift Order' header,
                  excludes pricing, shows gift note prominently
17. Homepage Banner Manager & Instagram Gallery
Admin

17.1 Why a Banner Manager

 Without a Banner Manager, every content change on the homepage requires a developer.
 With this system, Editors can update hero headlines, campaign blocks, testimonials,
 and seasonal content in 2 minutes -- without touching code or calling a developer.
 This is role: editor+ in the admin panel -- no Super Admin required.

17.2 Homepage Banner Slots

Slot Key             Role      Editable Fields
                     Required
announcement                   text, link_url, bg_color, is_active
hero                 Editor+   heading, subtext, cta_text, cta_url, image_url,
                               is_active
                     Editor+   heading, copy_text, cta_text, cta_url, image_url
                               label, title, subtext, cta_text, cta_url, image_url
brand_story          Editor+   label, title, subtext, cta_text, cta_url, image_url
campaign_left        Editor+   quote_text, attribution
campaign_right       Editor+   headline, subtext
testimonial          Editor+   quote_text
newsletter_headline  Editor+
footer_quote         Editor+

17.3 Banner Manager Admin Screen

    · URL: /admin/banners
    · Left panel: List of all slots with current preview and last updated timestamp
    · Right panel: Editing form for selected slot -- image upload via Cloudinary
    · Live preview button: see changes before publishing
    · Publish button: updates homepage_banners table, ISR revalidation triggered for

         homepage
    · Change history: who updated what and when -- via audit_logs

17.4 Instagram Gallery Admin
WHY: Embedding Instagram's live feed requires a third-party API key (costs 2,000+/month)
and breaks regularly when Instagram changes their API.

SOLUTION: Admin-managed gallery table. Editors manually upload curated lifestyle images
to the instagram_gallery table. These are displayed in the homepage atmosphere grid.
Images are pre-curated, always available, and require no external API.

Feature        Specification
Upload
Caption        Drag-drop image upload to Cloudinary  auto-resized to 1:1 grid
Link URL
               Optional caption text -- displayed on hover
Sort Order
Featured Flag  Optional link when image clicked -- can point to product,
               collection, or Instagram post
Grid Style
               Drag to reorder -- determines grid layout
Admin URL
               Mark top 9 images as featured -- only featured images shown on
               homepage

               Alternating sizes on homepage -- 3 large + 6 small in magazine
               layout

               /admin/instagram-gallery
18. Event Tracking Architecture (GA4 + Meta Pixel)

18.1 GA4 Custom Events

GA4 Event Name           Trigger               Parameters
view_item                Product page load     item_id (SKU), item_name,
                                               item_category, price, currency (INR)
add_to_cart              Add to Cart click     item_id, item_name, item_variant (size),
remove_from_cart                               price, quantity
view_cart                Remove from cart      item_id, item_name, price, quantity
begin_checkout           Cart page open        cart_value, item_count, has_coupon
add_shipping_info        Proceed to            cart_value, coupon, item_count
                         checkout
add_payment_info         Delivery step         shipping_tier (standard/express),
purchase                                       shipping_cost
                         Payment step          payment_type (upi/card/cod/wallet)
search                   Order confirmed       transaction_id, value, tax (GST total),
view_item_list                                 shipping, currency, items[]
select_item              Search query          search_term, result_count
                         submit
add_to_wishlist          Collection / shop     item_list_name (collection name), items[]
review_submitted         page
newsletter_signup        Click product from    item_list_name, item_id, item_position
bundle_started           list
bundle_completed         Wishlist heart click  item_id, item_name, price
                         Review form submit    item_id, rating
coupon_applied           Newsletter form       source (homepage/product/checkout)
gift_card_applied        submit
loyalty_points_redeemed  Bundle builder        vessel_filter selected
                         opened
                         Bundle added to       item_ids (3 candles), total_value, savings
                         cart
                         Coupon code           coupon_code, discount_amount
                         success
                         Gift card redeemed    gift_card_amount
                         Points applied at     points_used, discount_value
                         cart
referral_link_shared  Share referral  channel (whatsapp/copy/email)
                      clicked

18.2 Meta Pixel Events

Meta Event            Maps To

ViewContent           view_item -- for product retargeting ads

AddToCart             add_to_cart -- for cart abandonment retargeting

InitiateCheckout      begin_checkout -- for checkout drop-off campaigns

Purchase              purchase -- for ROAS calculation and lookalike audiences

CompleteRegistration Account registration -- for acquisition campaigns

18.3 Microsoft Clarity (Heatmaps)

    · Session recordings to understand user behavior on product pages and checkout
    · Click heatmaps -- identify high-engagement vs ignored sections
    · Scroll depth -- see how far users read on collection pages and blog posts
    · Rage click and dead click detection -- identify UX friction points
    · Free tool -- no cost, no setup required beyond adding script tag
19. Backup Strategy & Disaster Recovery

19.1 Backup Schedule

Frequency  What             Method             Retention
Daily
Daily      Supabase         Supabase Cloud     7 days (free), 30 days (Pro)
Weekly     database (auto)  built-in
Weekly
Monthly    Admin-triggered Admin  Settings  Stored in Supabase Storage
Monthly
Monthly    full DB dump     Backup  Trigger
Monthly
           Cloudinary media Cloudinary backup  Keep last 4 weeks

           library          download

           GitHub code      Auto via CI/CD     Git history permanent
           push             (every deploy)

           Products CSV     Admin  Products  Keep 6 months
           export           Export CSV

           Customers CSV Admin  Customers Keep 6 months

           export            Export CSV

           Orders CSV       Admin  Orders      Keep 12 months (GST records)
           export           Export CSV

           Reviews, Blogs, Admin  respective Keep 6 months

           Coupons CSV      sections  Export

19.2 Disaster Recovery

Scenario               Recovery Procedure
Database corruption
Accidental data        Supabase restores from last daily backup -- RTO < 30 minutes
deletion
Vercel deployment      Restore from Supabase point-in-time recovery -- select
failure                timestamp before deletion
Cloudinary image loss
                       Vercel auto-rollback to last stable deployment -- instant, no
Domain issue           manual action needed

Recovery Time          Re-upload from local copies (Samorah must keep original images
Objective              locally)
Recovery Point
Objective              GoDaddy DNS records documented -- re-point to Vercel in < 1
                       hour

                       < 30 minutes for any failure scenario (database, deployment,
                       domain)

                       < 24 hours -- maximum data loss = 1 day of transactions
19.3 Admin Backup Screen

    · URL: /admin/settings  Backup section
    · Buttons: 'Export Database' | 'Export Products CSV' | 'Export Orders CSV' |

         'Export Customers CSV'
    · Last backup timestamps displayed for each type
    · Supabase auto-backup status indicator (green = active, red = check Supabase

         dashboard)
    · Documentation link: step-by-step recovery instructions stored in admin docs
20. Audit Logs

20.1 What Gets Logged

Category           Action               Before / After Data
Products           Price changed        Who | When | Old price | New price
Products           Stock adjusted       Who | When | Old stock | New stock | Reason
Products           Status changed       Who | When | Old status | New status
                   (draftactive)
Orders             Status updated       Who | When | Old status | New status
Orders             Refund initiated     Who | When | Amount | Razorpay refund ID
Coupons            Created / paused /   Who | When | Full coupon config
                   deleted
Users              Role changed         Who changed | Who was changed | Old role |
                                        New role
Users              Account suspended    Who | When | Reason
Banners            Homepage section     Who | When | Slot | Old content | New content
                   updated
Settings           Any settings change  Who | When | Setting key | Old value | New
                                        value
Gift Cards         Manually generated   Who | When | Amount | Recipient
Loyalty            Manual point         Who adjusted | Customer | Points change |
                   adjustment           Reason
Blog               Published /          Who | When | Post slug
                   unpublished

20.2 Audit Log Schema

Table: audit_logs

Column             Type                 Notes
                                        Auto-generated
id                 UUID PK              Admin who performed the action
                                        e.g. 'price_changed', 'order_refunded',
user_id            UUID FK              'role_changed'
                                        e.g. 'product', 'order', 'user', 'coupon'
action             VARCHAR(100)         ID of the affected record

entity_type        VARCHAR(50)
entity_id          UUID
before_data  JSONB        State before the change -- full record snapshot
after_data   JSONB        State after the change -- full record snapshot
ip_address   VARCHAR(45)  Admin's IP -- for security monitoring
user_agent   TEXT         Browser/OS -- for security monitoring
created_at   TIMESTAMP    Auto-set by Supabase

20.3 Audit Log Admin Screen

    · URL: /admin/audit-logs -- Super Admin only
    · Filters: Date range | User (who acted) | Action type | Entity type
    · Expandable rows: click to see full before/after JSON diff highlighted
    · Export to CSV for compliance records
    · Cannot delete audit logs -- immutable records
21. Monthly Performance Audit

21.1 Audit Checklist

Category     Metric              Target / Action
SEO          Broken links        0 broken links -- fix any 404s with 301 redirects
                                 in admin
SEO          Missing metadata    0 products without seo_title and seo_description
SEO                              0 product images without alt_text
SEO          Missing alt text    Review GA4 Behavior  404 report -- redirect all
Performance                      Target: >90 on mobile + desktop
             404 pages
Performance                      Target: <2.5 seconds
             Lighthouse
Performance  Performance         Target: <0.1

Performance  Core Web Vitals --  Target: <1.8 seconds
             LCP
Inventory                        Review and restock before stockout
Inventory    Core Web Vitals --  Products with 0 sales in 60 days -- consider
             CLS                 promotions
                                 Ensure top 10 SKUs always in stock
             Core Web Vitals --  GA4 -- which collection/product pages drive most
             FCP                 sessions
                                 Sessions  Add to Cart  Checkout 
             Low stock SKUs      Purchase funnel
                                 Resend dashboard -- open rate target >35% for
             Dead inventory      transactional
                                 Target: <70% -- check abandoned cart email
Inventory    Best sellers        sequence performance
Marketing    Top pages           Target: <5% -- high NDR hurts Shiprocket
                                 service rating
Marketing    Conversion rate

Marketing    Email open rates

Marketing    Cart abandonment
Marketing    rate

             NDR rate

21.2 Audit Log in Admin

    · URL: /admin/performance-audits
    · Monthly audit results stored in performance_audits table -- historical tracking
· Lighthouse scores can be pasted manually or triggered via Vercel integration
· Broken link report generated by admin utility (crawls all sitemap URLs)
22. Review System -- Enhanced

22.1 Customer-Facing Review Features

Feature         Specification
Write Review    Available only after delivery confirmed (is_verified_purchase =
                true) -- prevents fake reviews
Rating          1­5 star scale -- required field
Review Title    Optional short title, max 100 chars
Review Body     Required, min 50 chars, max 1000 chars
Image Upload    Up to 3 images -- Cloudinary upload, shown in review card
Video URL       Optional YouTube / Reel link -- embedded in review
Verified Badge  Green 'Verified Purchase' badge if is_verified_purchase = true
Helpful Votes   'Was this helpful?' Yes/No -- increments helpful_count per review
Sort Options    Most helpful | Most recent | Highest rated | Lowest rated
Admin Reply     Displayed below customer review with 'Samorah Response' label

22.2 Review Flow & Moderation

    13. Customer writes review  submitted  status: pending
    14. Admin sees pending reviews in moderation queue (/admin/reviews)
    15. Admin approves  status: approved  visible on product page immediately
    16. Admin replies  reply stored in admin_reply field  displayed publicly
    17. Review request email sent 3 days after delivery -- one-click star rating in email
    18. Approved reviews used in structured data (JSON-LD) for SEO aggregate rating
23. SEO, Performance & Security

23.1 SEO Implementation

Feature           Implementation
Dynamic Meta
Structured Data   Next.js 15 generateMetadata() -- title, description, canonical, OG,
GST Schema        Twitter per page
Sitemap
Robots.txt        JSON-LD: Product (with aggregateRating), BreadcrumbList,
Target Score      Organization, BlogPosting

                  Product JSON-LD includes price excluding tax for Google Shopping
                  compatibility

                  Auto-generated sitemap.xml -- products, collections, blog posts,
                  static pages

                  Block: /admin, /cart, /checkout, /account. Allow: everything else

                  Lighthouse: Performance >90, SEO >95, Best Practices >95,
                  Accessibility >90

23.2 Performance Techniques

Technique         Detail
ISR
                  Product pages re-generated every 60s -- fast + fresh without SSR
Image             overhead

Font              next/image + Cloudinary CDN -- WebP/AVIF auto-serve, blur
Lazy loading      placeholder
pg_cron jobs
                  next/font -- self-hosted Google Fonts, preloaded, no FOUT

                  Below-fold images, heavy components, third-party scripts

                  Abandon cart sweeps run in DB -- no server resources used on the
                  Node side

23.3 Security Layers

Layer                 Implementation
HTTPS
Webhook Security      Auto-managed Vercel SSL -- all HTTPHTTPS enforced

Auth Tokens           Razorpay: HMAC SHA256 verify | Shiprocket: shared secret
                      header | + idempotency check

                      Access token in memory only | Refresh in httpOnly Secure
                      SameSite=Strict cookie
CSRF                SameSite=Strict cookies | CSRF token on all state-changing
XSS                 requests
SQL Injection
Rate Limiting       React auto-escapes JSX | Content-Security-Policy header | Never
                    dangerouslySetInnerHTML

                    Supabase parameterized queries only -- zero raw SQL string
                    concatenation

                    Vercel Edge rate limiting on auth, checkout, contact form, coupon
                    apply endpoints. Strict IP-based rate limiting on the /api/auth/otp
                    request endpoint (e.g., max 3 requests per 15 minutes) to prevent
                    SMS bombing fraud"

DPDP Compliance     India Data Protection Act -- consent on signup, data minimization,
GST Record Keeping  right to deletion

                    Orders and invoice data retained 7 years -- required by Indian tax
                    law
24. Critical Technical Edge Cases & Fixes

 This section documents 5 critical technical issues that WILL cause bugs or crashes if not
 addressed.
 Reference this section when prompting Claude for each affected phase.

24.1 Next.js + Zustand Hydration Mismatch (Affects Phase 6)

 Problem: Next.js renders on server first. localStorage doesn't exist on server.
 Result: Zustand with persist(localStorage) throws Hydration Mismatch Error -- site
 CRASHES on load.

 Fix: Use custom useStore hook in ALL components that render persisted store data:

 const useStore = <T, F>(
   store: (callback: (state: T) => unknown) => unknown,
   callback: (state: T) => F

 ) => {
   const result = store(callback) as F;
   const [data, setData] = useState<F>();
   useEffect(() => { setData(result); }, [result]);
   return data;

 };

 Usage: const cart = useStore(useCartStore, (state) => state.items);
 This delays rendering persisted state until component mounts on client.

24.2 Razorpay Webhook Idempotency (Affects Phase 12)

 Problem: Razorpay sends the same webhook event multiple times due to network retries.
 Result: Inventory decremented twice -- phantom stock loss.

 Fix: In /api/razorpay/webhook handler:
 1. Extract razorpay_payment_id from event payload
 2. SELECT * FROM orders WHERE idempotency_key = razorpay_payment_id
 3. If found  return 200 immediately (already processed)
 4. If not found  process normally (set idempotency_key BEFORE downstream actions)
24.3 Shiprocket NDR Management (Affects Phase 13)

 Problem: COD order returns (RTO) in India are 15­30% of orders if addresses are wrong.
 Without NDR tracking, these pile up invisibly -- lost revenue and poor service rating.

 Fix: Shiprocket webhook sends NDR events  update orders.ndr_status.
 Admin panel must have dedicated NDR tab (see Section 13.2 for full spec).
 Without this, Samorah will lose significant revenue to unmanaged returns.

24.4 Abandoned Cart Trigger (Affects Phase 14)

 Problem: Next.js has no built-in background timers. You cannot set setTimeout(2 hours) on a
 server.
 If you try to track abandonment from the frontend, users closing the browser kills all timers.

 Fix: Use Supabase pg_cron (server-side cron jobs in PostgreSQL):
 1. Cart table has last_activity_at TIMESTAMP field
 2. pg_cron job runs every hour:

    SELECT * FROM cart WHERE last_activity_at < NOW() - INTERVAL '1 hour'
    AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = cart.user_id AND
 created_at > cart.last_activity_at)
 3. For each matching cart  call Resend API  send abandoned cart email
 4. pg_cron is enabled in Supabase via: CREATE EXTENSION pg_cron;

24.5 GST Calculation Logic (Affects Phase 12 + Invoice)

 Problem: Indian GST depends on whether the order is intra-state or inter-state.
 - If customer state = seller state: charge CGST (half rate) + SGST (half rate)
 - If customer state != seller state: charge IGST (full rate)

 For candles (HSN 3406, 12% GST):
 - Intra-state: CGST = 6% + SGST = 6%
 - Inter-state: IGST = 12%

 Fix: In checkout API, compare customer address state with settings.store_state.
 Calculate cgst_amount, sgst_amount OR igst_amount accordingly.
 Store all three on orders table -- zero out the unused fields.
 Tax Invoice PDF must display the correct split per Indian GST law.
25. Indian Legal & Tax Compliance

25.1 GST Requirements

 As a registered GST business, Samorah must issue legally valid Tax Invoices.
 A regular 'receipt' or 'order confirmation' is NOT sufficient under Indian law.
 Non-compliance attracts penalties from the GST department.

25.2 Mandatory Tax Invoice Fields

Field                 Requirement
Invoice Title         Must say 'TAX INVOICE' -- not 'Receipt' or 'Order Confirmation'
Invoice Number        Sequential unique number -- e.g. SAM/2025-26/0001
Invoice Date          Date of supply (payment date)
Seller GSTIN          Samorah's GSTIN -- mandatory
Seller Address        Registered business address
Buyer Name + Address  Customer's delivery address
HSN Code per item     Each line item must show HSN code (e.g. 3406 for candles)
Taxable Value         Price before GST for each item
CGST / SGST or IGST   Tax amount per item and total -- intra vs inter-state split
Total with GST        Total amount including all taxes
Payment Method        UPI / Card / Net Banking / COD

25.3 Other Legal Requirements

Requirement           Implementation
Privacy Policy
                      DPDP-compliant -- data collected, how used, user rights, contact
Terms & Conditions    -- linked in footer
Return Policy
                      Indian governing law clause, dispute resolution, product liability
Shipping Policy
Cookie Consent        Eligibility, non-returnable items, damaged goods process, refund
                      timelines

                      Delivery timelines, free shipping conditions, COD availability

                      Cookie consent banner -- DPDP Act requires explicit consent for
                      analytics cookies
Data Retention  Order/invoice data: 7 years (GST law) | User data: delete on
GSTIN Display   request (DPDP)

                Seller's GSTIN displayed in footer and on all invoices
26. User Scenario Document (USD) -- 40 Real-World
Flows

 WHY THIS EXISTS: Claude should build according to user journeys, not pages.
 Each scenario below is a complete workflow that drives what code needs to be built.
 Reference these scenarios when prompting Claude for each phase.
 A feature that isn't in any scenario should be questioned -- is it really needed?

26.1 Customer Flows -- 15 Scenarios

# Scenario               Complete Flow

C1 Guest first visit     Google search  Homepage (hero, chapters)  Collection
                         page  Product page (fragrance notes)  Add to cart (mini
                         cart opens)  Guest checkout  Razorpay UPI  Order
                         confirmed  Email sent

C2 Registered user full  Login (Google)  Wishlist a product  Browse  Cart 
         journey         Apply coupon WELCOME20  Saved address  Shiprocket
                         rate displayed  Razorpay card  Order confirmed  Track
                         in /account/orders

C3 Bundle purchase       Homepage  Bundle Builder page  Filter by Ceramic 
                         Select 3 candles  Composition tray fills  Savings
                         displayed  Add to cart  Checkout  Pay  Bundle
                         shipped

C4 Coupon application    Cart  Coupon field  Enter DIWALI25  API validates 
                         Discount applied  Total updates  Checkout  Pay

C5 Gift card purchase & Go to /gift-cards  Select 1000  Pay via Razorpay  Gift

use                      card email sent to recipient  Recipient uses code at cart 

                         Balance deducted  Remaining balance preserved

C6 Gift order placement Cart  'This is a gift' checkbox  Gift note field  Recipient
                                         name  Occasion: Birthday  Checkout  Packing slip
                                         shows gift note, hides pricing

C7 Loyalty points        Login  Account  Loyalty section  500 points balance 
         redemption      Cart  'Redeem 200 points'  20 discount  Checkout 
                         Points deducted  Remaining balance: 300

C8 Referral program      Login  Account  Copy referral link  Share via WhatsApp
                          Friend clicks link  ref= param captured  Friend
                         registers  First purchase  Referrer gets 100 coupon
                         email  Friend gets 100 off applied

C9 Payment failure +     Checkout  Razorpay overlay  UPI timeout  Payment
         retry           failed  payment.failed webhook  Stock reservation
C10 COD order            released  Failure email sent  Customer shown 'Retry
                         Payment'  New Razorpay order created  Retry succeeds
C11 Abandoned cart
         recovery        Checkout  Delivery: COD available for pincode  Select
                         COD  Review  Place Order  Order status: confirmed 
C12 Order cancellation   Shiprocket COD order created  Delivered  COD collected
         (pre-ship)       payment_status: paid

C13 Return request       Add to cart  Close browser  1hr: Email 1 'Your candles
         (post-deliver)  wait'  No action  24hr: Email 2  No action  72hr:
                         Email 3 with 10% off coupon  Customer returns  Coupon
C14 Product review       applied  Checkout

C15 Out of stock         Order placed  Customer wants to cancel 
         notification    /account/orders/[id]  Cancel Order button (before pickup) 
                         Shiprocket order cancelled  Razorpay refund initiated 
                         Stock restored  Refund email sent

                         Delivered  Customer reports broken candle via contact form
                          Admin opens ticket  Admin initiates Razorpay refund 
                         Stock optionally restocked  Refund email sent with timeline

                         Delivered  3 days later: Review request email  Click
                         'Write Review'  Rate 5 stars  Add title + comment + photo
                          Submit  Pending status  Admin approves  Review
                         visible on product page  25 loyalty points credited

                         Product page  Variant out of stock  'Notify Me' button 
                         Enter email  Stock restored  Auto email: 'Back in stock!'
                          Customer clicks  Purchases

26.2 Admin / Operations Flows -- 15 Scenarios

# Scenario               Complete Flow

A1 Add new candle        Admin  Products  Add Product  Step 1: name, slug,
         product         category Vol.I, price, HSN 3406, GST 12%, weight  Step 2:
                         3 variants (100g/140g/180g, SKUs auto-generated)  Step 3:
                         Upload 4 images (Cloudinary) + alt texts  Step 4:
                         Top/Heart/Base notes  Step 5: SEO  Step 6: Preview 
                         Publish  Live in <60s (ISR)

A2 Bulk product upload Admin  Products  CSV Import  Download template 

(10­30 products)         Fill product data  Upload  System shows validation report

                         (errors highlighted per row)  Fix errors  Re-upload 

                         Preview all 25 imports  Confirm  SKUs auto-generated 

                         All active

A3 Change product        Admin  Products  Edit [product]  Change price from
         price           599 to 649  Save  Audit log: user_id | action:
                         price_changed | before: {price: 599} | after: {price: 649}  ISR
                         revalidation triggered
A4 Process incoming    Order notification  Dashboard new order  Open order 
         order         Verify payment (Razorpay paid)  Print packing slip  Pack
                        Update status: Packed  Admin: Create Shiprocket
A5 Handle NDR (failed  Shipment  Assign Delhivery  AWB generated  Print
         delivery)     label  Update: Shipped  'Shipped' email sent
                       automatically
A6 Handle RTO (return
         to origin)    Shiprocket NDR webhook  orders.ndr_status =
                       delivery_failed  NDR Alert on dashboard  Admin 
A7 Inventory restock   Orders  NDR Tab  See: SAM-2025-0042 | Blue Dart |
                       'Address not found'  Call customer  Correct address 
A8 Initiate customer   Click 'Instruct Re-attempt'  Shiprocket re-attempts
         refund
                       NDR tab  Order shows 3 failed attempts  Click 'Accept
A9 Create Diwali       RTO'  Shiprocket marks for return  When returned: Admin
         campaign      confirms receipt  Inventory restocked (if product intact) 
                       Razorpay refund if COD not collected
A10 Create and launch
         coupon        Dashboard: Low Stock Alert (SAM-CAN-001-180G = 3 units)
                        Inventory  Adjust Stock  Add 50 units  Reason: 'New
A11 Publish blog post  batch received'  inventory_log entry created  Alert cleared

A12 Update homepage    Orders  Find order  Verify complaint  Click 'Initiate
         banner        Refund'  Enter amount (full/partial)  Reason  Confirm
                        Razorpay refund API called  orders.payment_status =
A13 Manage wholesale   refunded  Refund email sent  Audit log entry
         inquiry
                       Banners  Edit 'hero' slot  Upload Diwali image 
                       'Illuminate Your Diwali' headline  'Shop Diwali Edit' CTA 
                       Save  Homepage hero updates live  Blog: Write Diwali
                       collection story  SEO  Publish  Email: Create Diwali
                       campaign email  Send to newsletter list

                       Admin  Coupons  Create  Code: DIWALI25  Type:
                       25% off  Min order: 500  Max uses: 500  Expiry: Oct
                       31  First order only: No  Active  Copy code  Share in
                       email campaign

                       Admin  Blog  New Post  Title: 'Vol. I: The Dessert
                       Chapter Story'  Rich editor: write content  Insert product
                       cards (Kashmiri Chai, Modak)  Upload cover image  SEO
                       title + description  Tags: vol-1, dessert  Schedule:
                       tomorrow 10am  Published automatically

                       Admin  Banners  Click 'hero' slot  Update heading:
                       'New: Vol. IV -- Nature Chapter'  Upload new hero image
                        CTA: 'Explore Now'  Save  Homepage revalidated 
                       Live in <60s -- no developer needed

                       Wholesale form submitted  wholesale_customers table
                       entry (status: pending)  Admin reviews  Approves: status
                       = approved, custom_price_tier set  Account created 
                       Wholesale pricing applies at checkout
A14 Monthly performance Admin  Performance Audits  New Audit  Run

audit                      Lighthouse (paste scores)  Check broken links report 

                           Review low stock  Check email open rates  Check NDR

                           rate  Log all results  Download action items list

A15 Monthly backup         Admin  Settings  Backup  Export Database  Export
                           Products CSV  Export Orders CSV (for GST records) 
                           Export Customers CSV  Upload to secure cloud storage 
                           Log backup completion date

26.3 Marketing & Security Flows -- 10 Scenarios

# Scenario                 Complete Flow

M1 New collection          Pre-launch: Banner Manager teaser hero  Blog draft:
        launch             collection story  Newsletter teaser  Launch day: Publish
                           products  Publish blog  Update hero banner  Send
                           launch email  Monitor GA4 events (view_item_list surge)

M2 Newsletter campaign Admin  Newsletter  Select segment (all active subscribers)
                                         Choose template  Customize subject + content 
                                        Preview  Send test to admin email  Schedule: next
                                        Tuesday 10am  Send  Monitor Resend dashboard for
                                        open/click rates

M3 Festival email          3 weeks before: Segment newsletter list  Create campaign:
        campaign (Diwali)  subject 'Light up Diwali with Samorah'  Products: festival
                           candles + bundles + gift sets  CTA: 'Shop Diwali Edit' with
                           DIWALI25 coupon  Schedule  Send  Track conversions
                           in GA4

M4 Birthday campaign       pg_cron daily: SELECT users WHERE birthday = TODAY 
        automation         For each user: Send birthday email with 100 bonus points 
                           loyalty_transactions entry: type=bonus, points=100  User
                           receives points notification

M5 AI search (Phase 2)     Customer types 'cozy warm vanilla candle'  AI embedding
                           (OpenAI) converts to vector  Semantic search against
                           product embeddings  Returns: Kashmiri Chai, Gajar Halwa
                           Delight  Displayed with fragrance notes highlighted

S1 Forgot password         Login page  Forgot password  Enter email  Reset email
                           sent via Resend  Click link (30-min expiry)  New password
                           form  Password updated  Login  Success

S2 OTP login               Login page  OTP tab  Phone number  6-digit SMS OTP
                           sent  Enter OTP  Verified  JWT issued  Logged in

S3 Role change (Super      Super Admin  Customers  Find user  Change role to
        Admin)             Editor  Save  Audit log: role_changed | before: customer |
                           after: editor  User now has blog + banner access
S4 Duplicate webhook   Razorpay sends payment.captured  System processes:
        attempt        inventory-=1, Shiprocket created, email sent  Razorpay
                       resends same event (network retry)  API checks:
S5 Price change audit  idempotency_key exists  Return 200 immediately  Nothing
        trail          happens twice

                       Manager changes candle price from 599  699  Audit log
                       records: user_id | action: price_changed | entity: product |
                       before: {price: 599} | after: {price: 699} | ip_address |
                       timestamp  Super Admin can review anytime
27. Claude Prompting Strategy -- How to Build Phase by
Phase

27.1 The Three Rules

 Rule 1: NEVER give Claude this entire BRD and ask it to 'build the website'.
        Claude will lose context and hallucinate after ~8,000 tokens.

 Rule 2: ALWAYS start each phase with a fresh context prompt referencing this BRD.
        Upload the BRD PDF and reference specific section numbers.

 Rule 3: NEVER ask Claude to build an entire page. Always ask for one file at a time.
        'Build the ProductGallery component'  then  'Wire it to Supabase'.

27.2 Session Startup Prompt (Use at Start of Every Session)

 Say this exactly at the start of every Claude session:
 "This is the SAMORAH ecommerce project. Platform: Next.js 15 + Supabase + Tailwind +
 Shadcn + Zustand + Razorpay + Shiprocket + Resend. I have a BRD document. Today we
 are working on Phase [N]: [Phase Name]. I will give you one task at a time. Do not write code
 until I give you the specific task."

27.3 Phase-by-Phase Prompt Templates

Phase Name   Claude Prompt Template

3  Setup     'Referring to SAMORAH BRD Section 3, generate the complete
             folder structure and install all dependencies. Create:
4  Database  package.json, tsconfig.json, next.config.ts with security
             headers, and globals.css with all design token CSS variables
5  Auth      from Section 4.3.'

             'Referring to SAMORAH BRD Sections 8.2­8.5, generate the
             complete Supabase SQL migration file with ALL tables, foreign
             keys, ENUM types, RLS policies, and indexes. Include the
             audit_logs, gift_cards, loyalty_transactions, referral_codes,
             instagram_gallery, homepage_banners tables from Section 8.5.'

             'Build the Supabase Auth integration for SAMORAH. Create: 1)
             AuthProvider component, 2) useAuth hook, 3) Register form
             with email verification, 4) Login form with Google OAuth and
             OTP, 5) Next.js middleware for route protection. Reference
             Section 6 RBAC -- protect /admin routes for role: editor+.'
6   State             'Create all 8 Zustand stores from SAMORAH BRD Section 7.
                      CRITICAL: Implement the hydration-safe useStore hook from
                      Section 24.1 before creating any store with localStorage
                      persistence. Start with useCartStore and useUserStore.'

12  Razorpay          'Build the Razorpay integration for SAMORAH following Section
                      12. CRITICAL: The webhook handler at /api/razorpay/webhook
                      must implement idempotency checking as specified in Section
                      24.2 -- check orders.idempotency_key before processing any
                      payment.captured event.'

13  Shipping          'Build the Shiprocket integration from SAMORAH BRD Section
                      13. Include: 1) Rate calculator at checkout, 2) Order creation on
                      payment.captured, 3) AWB generation, 4) NDR webhook
                      handler that updates orders.ndr_status. Also build the admin
                      NDR Tab component (Section 13.2).'

14  Email             'Build the email system from SAMORAH BRD Section 14. Start
                      with these 5 transactional templates using React Email: 1)
                      Order Confirmed (include Tax Invoice PDF attachment per
                      Section 25.2), 2) Order Shipped, 3) Abandoned Cart Email 1, 4)
                      Welcome, 5) Low Stock Alert. Use Resend API.'

15  Admin Panel       'Build the Admin Panel Dashboard from Section 11.2. Include:

                      Revenue card, Orders card, Inventory Alert card, NDR Alert

                      widget, 30-day revenue chart (Recharts), Recent Orders table

                      (TanStack Table), Low Stock inline table, Quick Actions bar.'

16  Inventory         'Build the Inventory Management module from SAMORAH BRD
                      Section 10. Include: 1) Inventory dashboard screen, 2) Stock
                      adjustment form with audit log entry, 3) Low stock email trigger
                      via Resend, 4) CSV bulk upload with validation preview.'

25  GST               'Implement GST calculation logic from SAMORAH BRD Section
                      25.4. Build: 1) Function: calculateGST(cartItems,
                      customerState, storeState) that returns cgst/sgst or igst
                      amounts, 2) Update checkout API to store tax amounts, 3) Tax
                      Invoice PDF generator with all fields from Section 25.2.'

27.4 One File at a Time -- Product Page Example

Step Prompt           Output

1   Gallery first     'Build only the ProductGallery component -- image
                      thumbnails, main image, zoom on hover, mobile swipe. No
2   Variant selector  data fetching yet. Use the 1:1 image ratio from Section 4.4.'

                      'Build the VariantSelector component -- vessel type buttons
                      (Glass/Ceramic/Terracotta), size buttons (100g/140g/180g),
                      price update on selection, out-of-stock disabling. Props:
                      variants[], onSelect.'
3  Wire to data    'Now wire ProductGallery and VariantSelector to Supabase.
                   Create getProduct(slug) service function that fetches
4  Add to cart     products JOIN variants JOIN product_images JOIN
                   fragrance_notes. Make this a server component using Next.js
5  GA4 events      fetch with ISR revalidate: 60.'

                   'Add the AddToCart button to the product page. On click: call
                   useCartStore.addItem() with selected variant. Also add
                   AddToWishlist button using useWishlistStore. Remember:
                   use the hydration-safe useStore hook from Section 24.1.'

                   'Add GA4 event tracking to the product page following
                   Section 18.1: fire view_item on page load, add_to_cart on
                   cart add, add_to_wishlist on wishlist add. Parameters must
                   include item_id (SKU), item_name, price, currency: INR.'

27.5 Three Supporting Documents (Future)

Document           Purpose                           When to Create
                                                     Before Phase 8 (Homepage) -- define
PRD (Product       Features with acceptance          done criteria for each feature
Requirements       criteria -- 'when is this done?'
Doc)                                                 Before Phase 11 (Cart) -- ensure all
                   40­50 user workflows              payment flows are covered
USD (User          (Section 26 is the foundation)    Before Phase 18 (Deployment) -- for
Scenario Doc)                                        handoff to any developer
                   Database ERD, API
SAD (System        endpoints list, security
Architecture Doc)  diagram, deployment diagram
28. Deployment, Timeline & Cost

28.1 Environment Architecture

Environment    URL                 Branch
Development    localhost:3000      feature/* branches -- hot reload
Staging        staging.samorah.in  develop branch -- auto-deploy on merge
Production     samorah.in          main branch -- zero-downtime deploy

28.2 Updated Phase Timeline (27 Phases)

Ph Phase         Key Deliverables                 Week           Depends
                                                                 --
1  Branding      Typography, tokens, spacing,     Wk 1           Ph 1
                 animation system                                Ph 2
                                                                 Ph 3
2  Design System Buttons, inputs, cards, drawer,  Wk 1­2         Ph 4
                                                                 Ph 5
                 modal, toast                                    Ph 4
                                                                 Ph 7
3  Folder Setup  Next.js 15, TypeScript, Tailwind, Wk 2          Ph 7
                                                                 Ph 7
                 Supabase client, pg_cron                        Ph 6
                                                                 Ph 11
4  Database      All 20+ tables, RLS policies, GST Wk 2­3        Ph 12
                 fields, audit_logs

5  Authentication Register, login, OTP, Google    Wk 3

                 OAuth, RBAC middleware

6  State (Zustand) 8 stores + hydration-safe      Wk 3­4

                 useStore hook

7  Product Engine Products, variants, SKU system, Wk 4­5

                 categories, collections

8  Homepage      12 sections + Banner Manager     Wk 5
                 integration

9  Collection    Editorial layout, product grid,  Wk 5­6
                 filters
   Pages

10 Product Page  12 sections including reviews,   Wk 6
                 fragrance notes, GA4 events

11 Cart + Checkout Cart with gift features, GST-aware Wk 7
                                    checkout, coupon, gift card

12 Razorpay      Order creation, webhook +        Wk 7­8
                 idempotency, GST calculation

13 Shiprocket    Order sync, AWB, NDR webhook, Wk 8
                 NDR admin tab
14 Email System     15 templates + abandoned cart       Wk 8­9   Ph 12
                    (pg_cron) + festival sequences               Ph 7
15 Admin Panel                                          Wk 9­11
                    Dashboard, products, orders                  Ph 15
16 Inventory Mgmt   (NDR tab), inventory, coupons,      Wk 11    Ph 5
                    reviews                                      Ph 8
17 Loyalty +                                            Wk 11­   Ph 12
          Referral  SKUs, stock, alerts, CSV import,    12
                    audit trail                         Wk 12    Ph 8
18 Banner                                                        Ph 8
          Manager   Points system, tiers, referral      Wk 12    Ph 10
                    codes, gift cards, account UI                Ph 15
19 GST + Tax                                            Wk 12­   Ph 23
          Invoice   Homepage Banner Manager +           13       Ph 24
                    Instagram Gallery Admin             Wk 13    Ph 25
20 SEO + Blog                                                    Ph 26
                    GST calculation,                    Wk 13
21 Event Tracking   CGST/SGST/IGST, PDF Tax                      --
                    Invoice generation                  Wk 13
22 Review System
                    Dynamic metadata, sitemap,          Wk 13­
23 Backup + Audit   schema, Sanity CMS blog             14
                                                        Wk 14
24 Security +       All GA4 events, Meta Pixel
          Testing   events, Microsoft Clarity           Wk 14

25 Deployment       Moderation, images, helpful votes,  Wk 14­
                    admin reply                         15
26 Product Upload
                    Audit logs, backup admin screen,    14­16
27 Launch QA        export CSVs                         wks

MVP TOTAL           Rate limiting, CSRF, Jest unit
                    tests, Playwright E2E

                    Vercel production, CI/CD, domain
                    DNS, monitoring

                    Upload 10­30 initial products with
                    all metadata

                    Full device testing, payment test,
                    Shiprocket test, GST invoice
                    review

                    Complete luxury ecommerce with
                    admin, inventory, loyalty, GST

28.3 Monthly Infrastructure Cost

Service  Plan at Launch           Cost/Month            Upgrade Trigger
Vercel   Hobby (free)             0                     When >100GB bandwidth
Supabase        Free tier  0                    When >500MB DB or 2GB
                                                storage
Cloudinary      Free tier  0                    When >25GB storage
Resend                                          When >3,000 emails/month
Razorpay        Free tier  0                    No monthly fee ever
Shiprocket                                      No monthly fee
GoDaddy domain  Pay-per-transaction 2% per txn  Annual renewal
TOTAL                                           vs 2,500­8,000 on Shopify
                Pay-per-shipment Per order

                Annual     ~65/mo

                --         65­500/mo
