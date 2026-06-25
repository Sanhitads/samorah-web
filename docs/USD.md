# User Scenario Document (USD) v1.0 — searchable text mirror

> Auto-extracted from `docs/Samorah_USD_v1.pdf` via `pdftotext -layout` on 2026-06-25.
> The **PDF is the canonical original**; this is the greppable text mirror used
> for reference. Tables (GST / HSN / numeric) may be imperfectly aligned —
> verify exact figures against the PDF.

---

               SAMORAH

               User Scenario Document

                         USD v1.0 | 62 Complete Workflows

The single source of truth for how every user, admin, and system interacts with Samorah

Document Type  User Scenario Document (USD)
Version        1.0 -- June 2025
BRD Reference  SAMORAH BRD v3.0
Total Flows    62 scenarios across 5 categories
Primary Use    Claude prompting -- reference flow ID
               before each build task

HOW TO USE THIS DOCUMENT WITH CLAUDE

Before building any feature, tell Claude: 'Refer to SAMORAH USD flow [C3] before building
the COD checkout flow.'

Each flow defines exactly what code is needed, what DB calls are made, what emails fire,
and what edge cases must be handled.

Flows are color-coded: Green=Customer | Blue=Payment | Red=Admin |
Purple=Marketing | Amber=Security
Flow Index -- All 62 Scenarios

A. Customer Flows (C1�C22)

ID  Flow Name                   Key Feature

C1 Guest First Visit & Purchase Homepage  Product  Cart  Checkout  Razorpay

                                                             Confirmation

C2 Guest - Payment Failure +    Razorpay failure  stock release  retry
          Retry

C3 Guest - COD Order            Checkout  COD  Shiprocket  Delivered  Paid

C4 Google OAuth Login +         One-click Google  Cart merge  Purchase
          Purchase

C5 OTP Phone Login              Phone number  SMS OTP  Verified  JWT issued

C6 Forgot Password + Reset      Email  Secure link  New password  Login

C7 Email Verification (New      Register  6-digit OTP  Email verified  Access
          Account)

C8 Wishlist Add + Later         Heart click  DB save  Return visit  Buy from
          Purchase              wishlist

C9 Valid Coupon Application     Enter WELCOME20  Validate  Discount applied 
                                Checkout

C10 Coupon + Loyalty Stacking -- Attempt both  System blocks  Clear error message
          REJECTED

C11 Loyalty Points Earn (Post   Order delivered  Points credited  Email  Balance
          Purchase)             update

C12 Loyalty Points Redeem at    Select points  Discount applied  Points deducted
          Checkout

C13 Tier Upgrade (Bronze        500 points crossed  Tier badge updated  Upgrade
          Silver)               email

C14 Gift Card Purchase + Delivery Buy 1000 card  Razorpay  Code emailed to

                                                            recipient

C15 Gift Card Partial Redemption Apply code  600 balance  400 used  200

                                                            remains

C16 Bundle Builder -- 3 Candle  Vessel filter  Pick 3  Tray fills  Savings  Cart
          Composition

C17 Referral Link Share +       Copy link  Share  Friend buys  100 coupon
          Referrer Reward       earned

C18 New User Uses Referral      ref= URL  Code captured  100 off applied at first
          Code                  checkout
C19 Abandoned Cart -- Full 3-     pg_cron  1hr email  24hr email  72hr email with
          Email Sequence          coupon

C20 Back-in-Stock Notification    Out of stock  'Notify Me'  Restock  Auto email 
                                  Purchase
C21 Backorder Purchase
                                  allow_backorder=true  'Ships 7�10 days' shown 
C22 Gift Order with Gift Note +   Order placed
          Occasion
                                  Gift toggle  Note + recipient + Birthday  Packing slip

B. Payment & Order Flows (P1�P12)

ID  Flow Name                     Key Feature

P1 Successful UPI Payment (Full Frontend verify + Webhook as source of truth
          Server Flow)

P2  Card Payment with No-Cost EMI selection  Razorpay  Order placed  EMI

    EMI                           tracked

P3 Net Banking Payment            Bank redirect  Return  Verify  Order confirmed

P4 COD Full Lifecycle             Place  Pack  Ship  Delivered  COD collected 
                                  Reconcile

P5 Client Drop-Off -- Browser     Webhook rescues order without frontend verification
          Closed Mid-Pay

P6 Duplicate Webhook --           Second event  idempotency_key check  Blocked
          Idempotency Protection  silently

P7 15-Minute Stock Reservation Checkout start  Hold  No payment  pg_cron

    Expiry                        releases stock

P8  Order Tracking (Shipped       AWB  Shiprocket updates  DB updated  Customer

    Delivered)                    emails

P9 Order Cancellation Pre-        Cancel request  Shiprocket cancel  Restock 
          Shipment                Razorpay refund

P10 Return Request Post-Delivery Complaint  Admin initiates  Refund  Optional

                                                            restock

P11 GST Invoice -- Intra-State    Customer in Samorah's state  CGST 6% + SGST 6% =
          (CGST + SGST)           12%

P12 GST Invoice -- Inter-State    Customer in different state  IGST 12%  Tax invoice
          (IGST)                  PDF

C. Admin & Operations Flows (A1�A18)
ID  Flow Name                   Key Feature

A1 Add New Candle Product (6- Name  Variants  Images  Notes  SEO  Publish

    Step Form)                   Live <60s

A2 Bulk CSV Product Upload      Template  Fill  Upload  Validate  Preview 
          (10�30 Products)      Confirm

A3 Product Price Change + Audit Edit price  Save  Audit: before/after JSONB logged
          Log

A4 Archive Product (Soft Delete) Archive  Hidden from store  Reviews/orders

                                                            preserved

A5 Process Incoming Order       New order  Print packing slip  Pack  Status:
          (Pack  Ship)          Packed

A6 Create Shiprocket Shipment Packed  Create shipment  Assign courier  AWB 

    + Label                     Print label

A7 NDR -- Instruct Re-attempt delivery_failed  Admin reviews  Calls customer 

    Delivery                    Re-attempt

A8 NDR -- Accept RTO (Return 3 failed attempts  Accept RTO  Restock  Refund
          to Origin)

A9 Inventory Manual Restock     Low stock alert  Adjust stock  Reason note  Audit
                                log

A10 Bulk CSV Inventory Update   Upload variant_sku + new_stock CSV  Validate 
                                Preview  Apply

A11 Create and Launch Coupon    Code  Type  Value  Rules  Active  Share in
                                campaign

A12 Generate Gift Card (Admin)  Amount  Recipient  Generate code  Send branded
                                email

A13 Loyalty Points Manual       Customer  Admin adjusts  Reason  Transaction
          Adjustment            logged

A14 Publish Blog Post with SEO + Write  SEO fields  Schedule for 10am  Auto-

    Schedule                    published

A15 Update Homepage Banner      Admin Banners  Edit hero slot  Save  ISR triggers
          (No Code)              Live

A16 Instagram Gallery Update    Upload lifestyle images  Set featured 9  Reorder 
                                Save

A17 Wholesale Customer          Form submitted  Admin reviews  Approve  Pricing
          Approval              tier set

A18 Admin Role Change + Audit   Super Admin  Find user  Change role  Audit log
                                entry

D. Marketing & Automation Flows (M1�M12)
ID   Flow Name                   Key Feature
M1   New Collection Launch
M2   Campaign                    Teaser  Products live  Blog  Banner  Email 
M3   Diwali Festival Campaign    GA4 spike
M4
M5   Birthday Campaign (pg_cron  Segment list  Create campaign  DIWALI25 coupon
M6   Daily)                       Schedule  Send
M7   Newsletter Campaign Send
M8                               pg_cron finds birthdays  100 bonus points credited 
M9   Abandoned Cart Email        Email
M10  Sequence
M11  Post-Purchase Review        Segment  Template  Preview test  Schedule 
M12  Request                     Open rate monitor
     Welcome Email Sequence
                                 pg_cron hourly  1hr  24hr  72hr with coupon 
     Low Stock Alert Email       Purchase
     (Admin)
     Back-in-Stock Campaign      Delivered  Day 3: review email  Day 30:
                                 replenishment nudge
     Referral Reward Email
     Trigger                     Register  Immediate  Day 3 brand story  Day 7
     Tier Upgrade Notification   chapters

     Search Analytics -- Zero    Stock hits threshold  pg_cron  Resend admin alert
     Result Query                email

                                 Restock  notify_me subscribers email  Track clicks
                                  Conversions

                                 Referred user first order  Referrer gets coupon email
                                 auto

                                 Points cross threshold  Tier updated  Upgrade email
                                 + perks

                                 Customer types unknown term  0 results 
                                 search_logs entry

E. Security & Edge Case Flows (S1�S8)

ID   Flow Name                   Key Feature

S1 Coupon + Loyalty Point        Both applied  API rejects  Clear UI error  One
          Stacking -- Blocked    allowed

S2   Browser Close Mid-Payment Frontend never calls /verify  Webhook fires  Order

     -- Webhook Rescue           saved

S3   Duplicate Razorpay Webhook Same payment_id received twice  idempotency check

     -- Silent Block              200 OK

S4   Stock Reservation Timeout   Checkout started  No payment  pg_cron releases 

     (15 min)                    Back in stock

S5   Unauthorized Admin Access Customer hits /admin  Middleware JWT check  403

     Attempt                     redirect
S6  Rate Limiting -- Brute Force 5 failed logins  Rate limiter  429 response  15min

    Login                    lockout

S7  Webhook Log -- Razorpay  Failed webhook  webhook_logs entry  Admin can

    Error Debug              inspect payload

S8  Product Recommendations  View Kashmiri Chai  related_products from same

    -- Fragrance Family      fragrance family
SECTION A -- Customer Flows (C1�C22)

C1    Guest First Visit & Purchase

      Customer Flow -- Homepage to Order Confirmed

Actor          Guest User (no account)  Trigger                 Arrives on samorah.in from
Preconditions                                                   Google/Instagram/Direct

               No account, no saved cart, no saved addresses

Step  Action (Who Does        System Response                   DB / API Call
  1   What)
  2   Browser opens           ISR homepage loads <1.5s.         GET / (ISR cached)
  3   samorah.in              Hero, announcement bar,
  4                           chapter slider rendered. Framer   --
  5   Hovers over SHOP in     Motion fade-in plays.             GET /collections/dessert-
  6   mega menu                                                 chapter
                              Mega menu slides open --
  7   Clicks 'Vol. I --       candle categories + campaign      GET /shop/kashmiri-chai
  8   Dessert Chapter'        image + chapters list.
                                                                useCartStore -- variant
      Clicks 'Kashmiri Chai'  Collection editorial page loads.  state
      product card            Hero  Featured Kashmiri Chai      cartStore.addItem() +
                               Supporting grid (Modak,          localStorage
      Selects '180g           Gajar Halwa).
      Ceramic' variant                                          GET /cart (CSR)
                              Product page loads (SSG).
      Clicks 'Add to Cart'    Gallery, fragrance pyramid,       GET /checkout
                              variant selector, Add to Cart
      Clicks mini cart        visible.
      'View Cart'
                              Price updates to 649. In-stock
      Clicks 'Proceed to      badge shown. 'Add to Cart'
      Checkout'               button activates.

                              Mini cart opens (useUIStore).
                              Item added to Zustand
                              cartStore + persisted to
                              localStorage. Toast: 'Added to
                              cart'.

                              Cart page: 1 item, 649
                              subtotal. Coupon field shown.
                              Gift note option shown.
                              Shipping estimate shown.

                              Guest checkout: email +
                              delivery address form. No login
                              required.
9 Enters email + Delhi Shiprocket pincode API checks POST

address (pincode           serviceability. Returns:         /api/shiprocket/pincode-
110001)                    Standard 60, Express 120,        check

                           COD: Available.

10 Selects Standard        Delivery cost added. Order       checkoutStore.setDelivery()
        Delivery           total: 649 + 60 = 709. GST
                           shown (IGST 12% = 69.75
                           included in price).

11 Clicks 'Proceed to      Review screen: items, address, --
        Payment'           total breakdown, GST
                           breakdown. 'Place Order' CTA.

12 Clicks 'Place Order'    POST /api/razorpay/create-       POST Razorpay API +
                           order  Razorpay order            INSERT orders
                           created (70900 paise). orders
                           row: status=pending,
                           payment_status=pending.

13 Razorpay overlay        Customer authorizes payment      Razorpay SDK
        opens -- selects   in GPay app.
        GPay UPI

14 Payment deducted        Razorpay sends                   POST
        from bank          payment.captured webhook to      /api/razorpay/webhook
                           /api/razorpay/webhook (server-
                           to-server).

15 Webhook:                API: SELECT * FROM orders        SELECT orders WHERE
        idempotency check  WHERE idempotency_key =          idempotency_key
                           payment_id  No match 
                           Process.

16 Webhook: update         orders.status = confirmed,       UPDATE orders + UPDATE
        order              payment_status = paid,           variants
                           idempotency_key =
                           payment_id. Inventory:
                           variants.stock -= 1.

17 Webhook: Shiprocket POST Shiprocket                      POST Shiprocket API

order created              /orders/create.

                           shiprocket_order_id stored.

18 Webhook: Tax            IGST calculated. Invoice PDF: generateInvoicePDF()
        Invoice PDF        TAX INVOICE, SAM/2025-
        generated          26/0001, HSN 3406, IGST 12%.

19 Webhook: Resend         'Order Confirmed' email: items,  POST Resend API
        email sent         709 total, Tax Invoice PDF
                           attached, estimated delivery.

20 Frontend: /verify       POST /api/razorpay/verify        HMAC verify + GET order
        called (redirect)  HMAC verify succeeds 
                         Redirects to
                         /checkout/success/[orderId].

21 Customer sees order Order number SAM-2025-0001. GET /checkout/success/[id]

confirmation page        Estimated delivery 5�7 days.

                         Invoice download link.

                         'Continue Shopping' CTA.

Error / Edge Case        Handling

Customer closes browser  Webhook fires regardless. Order is saved, inventory
after paying but before  decremented, email sent. Customer can find order at /account
/verify                  with email lookup.

UPI payment times out    Razorpay sends payment.failed webhook  order status =
                         failed  stock reservation released  failure email  retry
                         CTA on page.

Shiprocket pincode not   Checkout: 'Delivery not available to this pincode' message.
serviceable              Customer can update address.

Duplicate webhook        idempotency_key already exists  200 OK returned
received                 immediately  no duplicate processing.

 Claude Build Note:

Build in this sequence: (1) cartStore with localStorage + hydration-safe useStore hook, (2)
/api/razorpay/create-order route, (3) /api/razorpay/webhook with idempotency check FIRST
before inventory/email logic, (4) confirmation page that reads order from DB (not from
frontend state).
C2    Guest -- Payment Failure + Retry

      Customer Flow -- Handling Razorpay Failures

Actor          Guest User      Trigger                              Customer's UPI payment
Preconditions                                                       fails or times out

               Cart with items, checkout address filled, Razorpay order created

Step  Action (Who Does         System Response                      DB / API Call
  1   What)
                               Razorpay order created, stock        orders.status = pending
      Customer is on           reservation active (15-min hold
      Razorpay overlay         started).                            POST
                                                                    /api/razorpay/webhook
2 UPI app shows                Razorpay sends payment.failed        (failed event)
       'Payment Failed' or     webhook to                           UPDATE orders + release
       times out               /api/razorpay/webhook.               reservation

3 Webhook processes            orders.status = failed,              POST Resend API
       failure                 payment_status = failed. Stock
                               reservation released                 Razorpay SDK
4 Failure email sent           (variants.stock back to original).
                                                                    POST /api/razorpay/create-
5 Frontend: Razorpay           Resend: 'Payment                     order (new)
       overlay shows error     unsuccessful' email with order
                               total and 'Try Again' CTA link.      payment.captured webhook
6 Customer clicks                                                   fires
       'Retry'                 Customer sees 'Payment
                               Failed' in overlay. Razorpay         Standard C1 confirmation
7 Customer selects             overlay has built-in retry.          flow
       different method (e.g.
       Card)                   New Razorpay order created
                               (new razorpay_order_id).
8 New order confirmed          Previous failed order remains
                               with status=failed.

                               Completes payment
                               successfully.

                               New order row (SAM-2025-
                               0002 if original failed). Inventory
                               decremented. Email sent.

Error / Edge Case              Handling

Customer retries 3 times       Each attempt creates a new Razorpay order. All failed orders
and all fail                   remain in DB with status=failed for records.
Bank debits but Razorpay  This is a Razorpay settlement issue. payment.captured
shows failure             webhook will fire when confirmed. Idempotency check
                          protects.

Customer leaves without   Cart remains in localStorage (guest). Next visit cart is restored
retrying                  automatically.

 Claude Build Note:

Ensure payment.failed webhook releases the stock_reservations row or sets quantity=0.
Never leave stock held indefinitely after failure. The pg_cron job (every 15 min) is the safety
net for any reservations where webhook was missed.
C3    Guest -- COD Order (Cash on Delivery)

      Customer Flow -- COD Full Lifecycle

Actor          Guest User                  Trigger           Customer selects Cash on
Preconditions                                                Delivery at checkout

               Pincode is COD-serviceable per Shiprocket API

Step  Action (Who Does     System Response                    DB / API Call
  1   What)
  2   Pincode check at     POST /api/shiprocket/pincode-      Shiprocket pincode API
  3   checkout             check returns COD: Available.      --
      Customer selects
  4   COD at payment step  No Razorpay overlay. Order         INSERT orders (COD type)
                           summary shown. 'Place Order
  5   Customer clicks      (COD)' button.                     POST Resend API
  6   'Place Order (COD)'
  7                        orders row: status=confirmed,      Admin order list
      Order confirmation   payment_status=pending
  8   email sent           (COD). No Razorpay order_id        UPDATE orders.status =
  9                        needed.                            packed
      Admin sees new                                          POST Shiprocket API
 10   COD order in         'Order Confirmed (COD)' email:     (COD)
      dashboard            items, total, delivery estimate,
      Admin packs order    'Pay 709 to courier on             UPDATE + Resend
                           delivery'.
      Admin creates                                           Shiprocket webhook 
      Shiprocket COD       Orders list shows COD badge.       UPDATE
      shipment             No Razorpay payment ID.
                                                              Admin  Orders  COD
      Order shipped        Status updated to packed.
                           Packing slip printed -- shows
      Courier delivers --  COD amount clearly.
      customer pays cash
                           POST Shiprocket with
      COD reconciliation   payment_method: COD. AWB
                           generated. Shipping label
                           printed.

                           Status  shipped. 'Order
                           Shipped' email sent with AWB
                           tracking link.

                           Shiprocket tracking 
                           delivered.
                           orders.payment_status = paid
                           (COD collected).

                           Shiprocket shows COD
                           remittance in their dashboard.
                         Admin marks payment
                         received.

Error / Edge Case        Handling

Customer refuses delivery Shiprocket sends NDR webhook. ndr_status = delivery_failed.

(common in India)        Admin sees in NDR tab. Must call customer.

Customer unavailable --  Same NDR flow. Admin can instruct re-attempt or accept
delivery failed          RTO.

COD order cancelled      Admin cancels Shiprocket order. Stock restored. No refund
before pickup            needed (no payment made).

 Claude Build Note:

COD orders should skip Razorpay entirely. The checkout API route needs a branch: if
payment_method === 'cod'  skip Razorpay order creation  insert order directly with
payment_status = pending_cod. Make sure packing slips for COD clearly show the 'Collect
[amount] from customer' instruction.
C9  Valid Coupon Application

    Customer Flow -- Coupon Code Validation & Discount

Actor          Registered or Guest  Trigger                 Customer enters coupon
Preconditions  Customer                                     code WELCOME20 in cart

               Cart has items totaling 649. WELCOME20 exists: 20% off, min order
               500, max 100 uses, expires Dec 31, is_active=true

Step Action (Who Does     System Response                   DB / API Call
          What)
                          Real-time input -- no API call --
  1 Customer enters       yet. 'Apply' button shown.
          'WELCOME20' in
          coupon field    POST /api/coupons/apply: {        POST /api/coupons/apply
                          code: 'WELCOME20',                SELECT coupons WHERE
  2 Customer clicks       cart_total: 649, user_id: null }  code
          'Apply'
                          1) Exists? Yes. 2) Active? Yes.   Client-side calc
  3 API validates coupon  3) Expired? No. 4) Min order      cartStore.applyCoupon()
                          met? Yes (649>500). 5) Usage
  4 Discount calculated   limit? 45/100 used. 6) User       --
                          already used? No. 7) First-       UPDATE coupons +
  5 cartStore updated     order-only? No. All pass.         INSERT order

  6 Customer proceeds     20% of 649 = 129.80. New
          to checkout     total: 649 - 129.80 + 60
                          shipping = 579.20
  7 Order placed and
          paid            coupon: { code:'WELCOME20',
                          discount: 129.80 }. UI updates:
                          crossed-out original price,
                          green discount line, new total.

                          Coupon applied through
                          checkout. Discount stored in
                          checkoutStore.

                          On payment.captured webhook:
                          coupons.used_count += 1.
                          Discount stored in
                          orders.discount_amount.

Error / Edge Case         Handling
Coupon doesn't exist
                          API returns error: 'Invalid coupon code'. UI shows red error
Coupon expired            under field.

                          API returns: 'This coupon has expired.' UI error shown.
Minimum order not met  API returns: 'Minimum order of 500 required.' (with the
                       amount shown)

Usage limit reached    API returns: 'This coupon is no longer available.'

Customer already used this If single-use or user-specific coupon, API returns: 'You have

coupon                 already used this coupon.'

 Claude Build Note:

The coupon validation API must perform ALL 7 checks atomically. Never decrement
used_count at apply time -- only on successful order completion via webhook. This prevents
count inflation if customers abandon after applying.
C10 Coupon + Loyalty Points -- Stacking BLOCKED

               Customer Flow -- Discount Stacking Rules Enforced

 DISCOUNT STACKING RULE -- Must be enforced at API level:
RULE 1: Only ONE coupon code can be applied per order. A second code replaces the first.
RULE 2: Coupons CANNOT be combined with Loyalty Point redemptions.
RULE 3: Gift Card codes are EXEMPT from this rule -- they can be combined with either
coupons OR loyalty points.
Rationale: Prevents zero/negative order totals. Gift cards are pre-paid currency, not
discounts.

Actor  Registered Customer     Trigger                            Customer tries to apply
                                                                  WELCOME20 coupon
                                                                  AFTER already having 500
                                                                  loyalty points queued for
                                                                  redemption

Preconditions Cart: 649. loyaltyPoints queued: 500pts (=50 off). Coupon
                        WELCOME20: 20% off.

Step Action (Who Does          System Response                    DB / API Call
          What)
                               Cart shows: Subtotal 649.          --
  1 Customer is on cart        'Redeem Points' section shows      GET /api/loyalty/validate
          page                 500 pts available.                 POST /api/coupons/apply

  2 Customer clicks            API: validates points balance.
          'Redeem 500 Points'  cartStore: loyalty_discount = 50.
                               UI: '50 off (500 points)' shown.
  3 Customer enters
          WELCOME20 in         POST /api/coupons/apply is
          coupon field and     called.
          clicks Apply
                               API checks: cartStore has          Server-side check
  4 API detects loyalty        loyalty_discount > 0 (or
          redemption active    checkoutStore.loyaltyPointsUsed
                               > 0). Combination rule violated.
  5 API returns stacking
          error                HTTP 409: { error:                 Error response
                               'discount_stack_conflict',
                               message: 'A coupon code
                               cannot be combined with loyalty
                               point redemptions. Please
                               choose one.' }
6 UI shows clear            Modal: 'Choose one discount:      useUIStore.openModal()
       choice modal         [Keep 50 loyalty discount] or     cartStore update
                            [Apply WELCOME20 (save            cartStore unchanged
7 Customer chooses          129.80)]'. Two buttons.
       WELCOME20
                            Loyalty points redemption
8 OR: Customer              cleared
       chooses loyalty      (cartStore.loyalty_discount = 0,
       points               loyaltyPointsUsed = 0). Coupon
                            applied. Discount = 129.80.

                            Coupon not applied. Loyalty
                            discount of 50 remains.
                            Customer proceeds.

Error / Edge Case           Handling

Customer tries to apply 2   Second code replaces first. API returns: 'Coupon
coupon codes                WELCOME20 replaced FIRST10.' Previous coupon discount
                            removed.

Customer redeems points     Checkout API must re-validate: if loyalty points redemption
on checkout but coupon      attempted, reject if coupon already applied.
was in cart

Gift card + coupon          Gift card is pre-paid currency. POST /api/gift-cards/apply can
(allowed)                   co-exist with a coupon. No stacking conflict.

Gift card + loyalty points  Same rule -- gift card does not trigger stacking check.
(allowed)

 Claude Build Note:

Enforce stacking rule in BOTH the /api/coupons/apply endpoint AND the
/api/checkout/finalize endpoint (server-side double-check). Never rely on frontend-only
enforcement. The checkout finalize must reject the order if both are present. UI modal
approach gives customers a good experience instead of a hard error.
C16 Bundle Builder -- 3 Candle Composition

               Customer Flow -- Interactive Bundle Builder

Actor          Any Customer                   Trigger  Customer opens /bundles
Preconditions                                          to build a custom candle set

               Bundle products exist in DB with bundle-eligible flag. Minimum 3 different
               candles available per vessel type.

Step  Action (Who       System Response       DB / API Call
  1   Does What)
      Customer          Bundle builder        GET /bundles (CSR)
  2   opens /bundles    loads. Left: 3-slot
                        empty composition     productService.getVariantsByVessel('ceramic')
  3   Customer clicks   tray + vessel filter
      'Ceramic' vessel  buttons (Glass |      bundleStore.addItem()
  4   filter            Ceramic |
  5                     Terracotta). Right:   bundleStore.addItem()
      Customer clicks   full candle catalog.  bundleStore.addItem()
      'Add to
      Composition' on   Right panel filters:
      Kashmiri Chai     only ceramic-vessel
                        variants shown.
      Customer clicks   Each card: candle
      'Add to           name, scent notes
      Composition' on   (Bergamot � Neroli),
      Modak             price, 'Add to
      Customer clicks   Composition' button.
      'Add to
      Composition' on   Left tray: '1/3
      Gajar Halwa       Selected | 2 more
      Delight           candles required'.
                        Kashmiri Chai
                        appears in tray slot
                        1. Button on right 
                        'Added' (muted, not
                        clickable again).

                        Left tray: '2/3
                        Selected | Ready to
                        Add to Cart'.

                        Left tray: '3/3
                        Selected | Curated
                        Bundle Ready
                        (italic)'. ALL
                        remaining 'Add to
                        Composition'
                                buttons 
                                'Composition
                                Complete' (muted).
                                Savings shown.

6 Savings                       Regular Value:       Client calculation

displayed in tray 1,947. Bundle

                                Price: 1,497.

                                Bundle Saving:

                                450. 'Add Bundle

                                to Cart' button

                                active.

7 Customer clicks Bundle added as                    cartStore.addBundle()

'Add Bundle to SINGLE cart item

Cart'                           with 3 sub-items.

                                Bundle SKU: SAM-

                                BND-[auto].

                                Discount stored.

                                Mini cart opens.

8 Customer                      Bundle treated as    Checkout flow same as C1
       proceeds to              one line item in
       checkout                 checkout. Tax
                                applies at 12% on
                                bundle total.
                                Shiprocket weight =
                                sum of 3 candles.

Error / Edge Case               Handling

One component candle            'Add to Composition' button for that candle shows 'Out of
goes out of stock mid-          Stock'. If already in tray, warning shown: 'Kashmiri Chai is no
session                         longer available. Please replace.'

Customer tries to select        Prevented -- once added to tray, the button state changes to
same candle twice               'Added'. DB constraint on bundle line items prevents duplicate
                                product_id.

Customer changes vessel         Warning modal: 'Changing vessel filter will clear your current
filter after partial selection  composition. Continue?' Two buttons: Yes (clear) / No (keep).

 Claude Build Note:

Bundle builder needs its own Zustand bundleStore (separate from cartStore) to manage the
composition state. When 'Add Bundle to Cart' is clicked, create one cart item with a nested
items array in the variant data. The checkout API must expand this for Shiprocket (uses
combined weight) and inventory (decrements each component SKU individually).
C19 Abandoned Cart -- Full 3-Email Sequence

               Customer Flow -- pg_cron Automated Recovery

Actor          Guest or Registered  Trigger                      Customer adds to cart but
Preconditions  Customer                                          does not complete
                                                                 checkout

               Cart table has row with last_activity_at timestamp. No order placed in the
               session.

Trigger Mechanism (pg_cron -- runs every hour):

SELECT c.session_id, c.user_id, c.items, u.email FROM cart c LEFT JOIN
users u ON c.user_id = u.id WHERE c.last_activity_at < NOW() - INTERVAL '1
hour' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id
AND o.created_at > c.last_activity_at) AND c.abandoned_email_1_sent =
false;

Step Action (Who Does           System Response                  DB / API Call
          What)
                                cart.last_activity_at = NOW().   INSERT/UPDATE cart row
  1 Hour 0: Customer            Zustand cartStore +              --
          adds Kashmiri Chai    localStorage.                    pg_cron query
          to cart                                                POST Resend API
                                No order created. cart row
  2 Customer closes             remains.                         pg_cron query
          browser without                                        POST Resend API
          buying                Query finds cart.
                                abandoned_email_1_sent =
  3 Hour 1: pg_cron runs        false  triggers Email 1.
          -- detects
          abandonment           Subject: 'Your candles are
                                waiting for you '. Content:
  4 Email 1 sent: 'Your         product image, name, scent
          candles are waiting'  notes, price. Soft emotional
                                tone. No discount. CTA: 'Return
  5 Hour 24: pg_cron            to Cart'.
          runs again            cart.abandoned_email_1_sent
                                = true.
  6 Email 2 sent: 'Still
          thinking about us?'   cart.abandoned_email_2_sent
                                = false  triggers Email 2.

                                Subject: 'Still thinking about
                                us?'. Content: candle story
                                excerpt, fragrance note
                                description. No discount. CTA:
                                'Complete Your Order'.
                           cart.abandoned_email_2_sent
                           = true.

7 Hour 72: pg_cron         cart.abandoned_email_3_sent        pg_cron query
       runs again          = false  triggers Email 3.

8 Email 3 sent: 'A small Subject: 'We saved something POST Resend + INSERT

gift for you'              for you'. 10% discount coupon coupons

                           auto-generated (CART10-

                           [uuid], single use, 48hr expiry).

                           CTA: 'Claim 10% Off'.

                           cart.abandoned_email_3_sent

                           = true.

9 Customer clicks link Cart restored from DB (for             GET /cart

in email                   registered users) or

                           localStorage (for guests).

                           Coupon CART10-xxx pre-

                           applied.

10 Customer completes Order placed. cart row deleted. DELETE cart row on

purchase                   All abandoned_email flags          order.confirmed

                           irrelevant.

Error / Edge Case          Handling

Guest abandoned cart (no No email to send to. pg_cron skips guest carts without email.

email captured)            MITIGATION: Show 'Save cart to email' prompt in cart page.

Customer has already       pg_cron query checks: orders WHERE created_at >
purchased another product  cart.last_activity_at. If found  skip. No email sent.
in between

Customer unsubscribed      Check newsletter.is_active = false before sending abandoned
from marketing             cart emails. Still send transactional (order confirm) but not
                           marketing sequences.

Duplicate emails (pg_cron  Prevented by abandoned_email_1_sent, _2_sent, _3_sent
runs twice)                boolean flags. Each email type sent exactly once.

 Claude Build Note:

pg_cron must be enabled in Supabase: CREATE EXTENSION IF NOT EXISTS pg_cron;
Then: SELECT cron.schedule('abandoned-cart-sweep', '0 * * * *', 'SELECT
sweep_abandoned_carts()'); Create a PostgreSQL function sweep_abandoned_carts() that
handles the query and Resend API call via a Supabase Edge Function trigger.
C22 Gift Order -- Gift Note, Recipient & Occasion

               Customer Flow -- Gift Purchase Experience

Actor  Registered or Guest           Trigger                           Customer is buying a
       Customer                                                        candle as a gift for
                                                                       someone else

Preconditions Cart has items. Customer is on /cart page.

Step Action (Who Does                System Response                   DB / API Call
          What)
                                     Toggle is visible below cart      --
  1 Customer sees 'This              items. Default: OFF.              cartStore.setIsGift(true)
          is a gift' toggle in cart
                                     Gift section expands: Gift Note   cartStore.setGiftNote()
  2 Customer toggles                 (textarea), Recipient Name        --
          'This is a gift' ON        (optional), Occasion
                                     (dropdown).
  3 Customer fills gift
          note: 'Happy               Max 200 chars. Character count
          Birthday, Priya!'          shown. Stored in
                                     cartStore.giftNote.
  4 Customer selects
          Recipient: 'Priya          Stored in
          Sharma'                    cartStore.giftRecipient.

  5 Customer selects                 Dropdown: Birthday |              --
          Occasion: 'Birthday'       Anniversary | Diwali | Christmas
                                     | Mother's Day | Just Because |   --
  6 Customer proceeds                Other. Stored in
          to checkout                cartStore.giftOccasion.           INSERT orders with gift
                                                                       fields
  7 Order placed and                 Gift data passed to               Packing slip PDF template
          confirmed                  checkoutStore: { isGift: true,
                                     giftNote: '...', giftRecipient:   POST Resend API
  8 Admin prints packing             'Priya Sharma', giftOccasion:
          slip                       'Birthday' }

  9 Order confirmation               orders.gift_note,
          email                      orders.gift_recipient,
                                     orders.gift_occasion saved.

                                     Packing slip shows: 'GIFT
                                     ORDER' banner at top. Pricing
                                     HIDDEN. Gift note prominently
                                     displayed: 'Happy Birthday,
                                     Priya!' Recipient name shown.

                                     Customer's email: shows gift
                                     note. 'You sent a gift to Priya
                        Sharma (Birthday).' No gift note
                        sent to recipient (they receive
                        the physical surprise).

Error / Edge Case       Handling

Customer forgets to toggle If giftNote field is filled, system auto-treats as gift even if

gift but adds a note    toggle wasn't explicitly set.

Customer wants pricing  When isGift = true, packing slip PDF template automatically

removed from packing slip hides all pricing.

 Claude Build Note:

The packing slip PDF needs TWO templates: standard (shows pricing) and gift (hides
pricing, shows gift note prominently). The admin order detail page should show a 'GIFT
ORDER' badge prominently so warehouse staff know to use the gift packing slip template.
SECTION B -- Payment & Order Flows (P1�P12)

P5     Client Drop-Off -- Browser Closed Mid-Payment

       Payment Flow -- Webhook as Source of Truth

CRITICAL ARCHITECTURE DECISION:

The frontend /api/razorpay/verify endpoint exists ONLY to redirect the user to the
Thank You page.
ALL business logic (inventory decrement, Shiprocket, email, invoice) MUST run exclusively in
the server-to-server webhook at /api/razorpay/webhook.
Never put inventory or order update logic in /verify. That endpoint may never be called if the
browser closes.

Actor  Guest Customer         Trigger                          Customer's phone dies /
                                                               internet drops the exact
                                                               moment UPI payment is
                                                               deducted

Preconditions Payment was deducted from customer's bank. Razorpay has a
                        payment_id. Frontend never calls /verify.

Step Action (Who Does         System Response                  DB / API Call
          What)
                              Razorpay order_id created.       POST /api/razorpay/create-
  1 Customer reaches          orders.status = pending.         order
          Razorpay overlay                                     Razorpay internal
                              Success in bank. Razorpay
  2 Customer pays via         captures the payment.            --
          UPI -- bank debits  payment_id generated.
          709                                                  POST
                              Frontend is gone.                /api/razorpay/webhook
  3 Customer's phone          /api/razorpay/verify is NEVER    HMAC verify
          dies                called.
                                                               SELECT orders
  4 Razorpay sends            Server-to-server HTTP POST to
          payment.captured    /api/razorpay/webhook. This
          webhook to server   happens regardless of frontend.

  5 Webhook: HMAC             sha256(razorpay_order_id + '|'
          signature verified  + razorpay_payment_id,
                              key_secret) must match. If
  6 Webhook:                  mismatch  401, discard.
          idempotency check
                              SELECT * FROM orders
                              WHERE idempotency_key =
                               payment_id  No match 
                               proceed.

7 Webhook: Update              status = confirmed,               UPDATE orders
       order                   payment_status = paid,
                               idempotency_key =
                               payment_id.

8 Webhook: Inventory variants.stock -= 1 for the                 UPDATE variants

decremented                    ordered SKU.

9 Webhook: Shiprocket POST Shiprocket.                           POST Shiprocket API

order created                  shiprocket_order_id stored.

10 Webhook: GST                IGST/CGST/SGST stored in          generateInvoicePDF()
        calculated + invoice   orders. Tax Invoice PDF
        generated              generated.

11 Webhook: Order              Customer receives email with      POST Resend API
        confirmation email     order details and invoice. Order
        sent                   is saved.

12 Customer charges            Opens email  sees order           --
        phone next day
                               confirmation SAM-2025-0001

                                all good. They can track at

                               /account.

Error / Edge Case              Handling

Webhook also fails             Razorpay retries webhook up to 8 times over 24 hours.
(network error on              idempotency_key check ensures safe retry.
Samorah's server)

Customer contacts support Admin searches by email in Orders  finds order with
'I paid but no confirmation' payment_status=paid  resends confirmation email manually.

Frontend /verify called after  Both execute: /verify checks HMAC and reads the updated
webhook already                order  redirects to success. No double-processing because
processed                      webhook already set idempotency_key.

 Claude Build Note:

Critical implementation rule: /api/razorpay/verify should ONLY do: (1) HMAC verify, (2) read
order from DB to confirm status=paid, (3) return redirect URL. NOTHING ELSE. Put ALL side
effects (inventory, Shiprocket, email, GST) in /api/razorpay/webhook. Test this by
commenting out /verify entirely -- the order should still be fully processed.
P6  Duplicate Webhook -- Idempotency Protection

    Payment Flow -- Preventing Double Processing

Actor          System (Razorpay           Trigger           Razorpay sends
Preconditions  Samorah server)                              payment.captured
                                                            webhook, then retries
                                                            because it didn't receive a
                                                            200 response in time

               Payment is successfully captured once. orders.idempotency_key stores
               the payment_id after first processing.

Step Action (Who Does       System Response                 DB / API Call
          What)
                            payload: { payment_id:          POST
  1 First webhook           'pay_ABC123', order_id:         /api/razorpay/webhook
          received:         'order_XYZ' }
          payment.captured                                  HMAC verify
                            Valid signature confirmed.
  2 HMAC signature
          verified          SELECT * FROM orders            SELECT orders
                            WHERE idempotency_key =
  3 Idempotency check       'pay_ABC123'  0 rows. This is   Full processing + UPDATE
                            first processing.
  4 Order processed                                         HTTP 200
                            status=paid, inventory          POST
  5 Response: 200 OK        decremented, Shiprocket         /api/razorpay/webhook
          sent to Razorpay  created, email sent,
                            idempotency_key =
  6 2 hours later:          'pay_ABC123'.
          Razorpay retries
          (network issue    Razorpay marks webhook as
          earlier)          delivered successfully.

  7 HMAC signature          Same payload: { payment_id:
          verified          'pay_ABC123' }.

  8 Idempotency check       Valid again.                    HMAC verify

  9 Early return -- no      SELECT * FROM orders            SELECT orders
          processing        WHERE idempotency_key =         HTTP 200 (no side effects)
                            'pay_ABC123'  1 row found!

                            Order already processed.
                            Return 200 OK immediately. No
                            inventory change. No email. No
                            Shiprocket.
Error / Edge Case          Handling

Idempotency key not set    If server crashes between setting key and completing actions,
before downstream actions  retry will reprocess. FIX: Set idempotency_key as the FIRST
                           write, use DB transaction for all writes.

Shiprocket webhook also    Create shiprocket_webhook_logs table. Same pattern: check
needs idempotency          if tracking_id already processed.

 Claude Build Note:

Use a PostgreSQL transaction for the entire webhook processing: BEGIN; UPDATE orders
SET idempotency_key=..., status='paid' WHERE id=... AND idempotency_key IS NULL; IF
NOT FOUND  already processed, ROLLBACK, return 200; ELSE continue with
inventory/Shiprocket/email; COMMIT;
P7    Stock Reservation -- 15-Minute Hold & Expiry

      Payment Flow -- Preventing Overselling

Actor          Customer + pg_cron  Trigger    Customer begins checkout
Preconditions  System                         -- stock must be held to
                                              prevent overselling

               Variant has stock=3. Customer selects 180g Ceramic. Another customer
               may also be checking out.

Step  Action (Who Does       System Response                      DB / API Call
  1   What)
  2   Customer clicks        POST /api/checkout/reserve: {        POST
  3   'Proceed to            variant_id, quantity: 1, session_id  /api/checkout/reserve
  4   Checkout'              }                                    INSERT
  5   API creates stock                                           stock_reservations
  6   reservation            INSERT stock_reservations: {         SELECT with reservation
                             variant_id, quantity: 1,             deduction
  7   Available stock        session_id, expires_at: NOW() +
      check in product       15 min }                             --
      page
                             SELECT variants.stock -              pg_cron DELETE expired
      Customer fills         SUM(stock_reservations.quantity)
      address, selects       WHERE expires_at > NOW().            UPDATE variants
      delivery, opens        Returns: 2 available (3 minus 1
      Razorpay               held).                               --
      Payment completes
      at 16 minutes          Time passes. 14 minutes used.
      (reservation expired)
                             pg_cron runs every 5 min:
      Webhook tries to       DELETE FROM
      decrement inventory    stock_reservations WHERE
                             expires_at < NOW(). Reservation
      Order confirmed --     deleted.
      no oversell
                             UPDATE variants SET stock =
                             stock - 1 WHERE id = variant_id
                             AND stock >= 1. Returns 1 row
                              success! Stock was 3,
                             reservation expired but stock was
                             still 3.

                             Stock correctly decremented. No
                             issue even though reservation
                             expired.
8 Scenario: Stock=1, Both reserve stock_reservation. Reservation conflict

Two customers            Second customer's reservation     handling

checkout                 fails (qty check): if stock -

simultaneously           active_reservations < 1  reject

                         checkout. Second customer sees

                         'Out of stock during checkout --

                         sorry!' message.

Error / Edge Case        Handling

pg_cron doesn't run (DB  Stock reservations accumulate. FIX: Always calculate
job failure)             available = stock - active_non_expired_reservations in display
                         logic. Fallback: on checkout initiation, clear own expired
                         reservation.

Customer pays after      Payment webhook decrements stock with: UPDATE WHERE
reservation expires but  stock >= 1. If stock=0, update affects 0 rows  trigger
before another customer  oversell alert to admin.

 Claude Build Note:

Create a stock_reservations table: id, variant_id, quantity, session_id (or user_id),
expires_at, created_at. The 'available stock' shown on product pages = variants.stock -
SUM(active reservations). Never show raw stock column to frontend. This single rule
prevents all overselling scenarios.
P11 + P12 GST Calculation -- Intra-State & Inter-State

                    Payment Flow -- Indian Tax Law Compliance

GST Rules for Samorah:

Samorah's registered state: Maharashtra (example -- update to actual state in
settings.store_state)
Intra-state order (Customer in Maharashtra): CGST 6% + SGST 6% = 12% total
Inter-state order (Customer in any other state): IGST 12% total
GST is INCLUSIVE in the displayed MRP. Do not add GST on top of price -- extract it
from MRP.

Step Action (Who Does           System Response                 DB / API Call
          What)
                                Delhi  Maharashtra              settings.store_state vs
  1 Customer in Delhi           (Samorah's state)  Inter-state  delivery.state
          places order for 649   IGST applies.                  calculateGST() function
          candle
                                Taxable value = 649 / 1.12 =    generateInvoicePDF()
  2 GST extracted from          579.46. IGST = 649 -            settings.store_state match
          MRP (GST-inclusive    579.46 = 69.54. Stored:         calculateGST()
          pricing)              orders.igst_amount = 69.54,
                                cgst_amount = 0, sgst_amount    generateInvoicePDF()
  3 Tax Invoice PDF             = 0.
          generated
                                Shows: Taxable Value 579.46
  4 Customer in Mumbai          | IGST (12%) 69.54 | Total
          places same order     649. HSN: 3406.

  5 GST extracted for           Mumbai = Maharashtra =
          intra-state           Samorah's state  Intra-state
                                 CGST + SGST.
  6 Tax Invoice PDF for
          Mumbai customer       Taxable value = 579.46.
                                CGST (6%) = 34.77. SGST
                                (6%) = 34.77. Total = 649.
                                Stored: orders.cgst_amount =
                                34.77, sgst_amount = 34.77,
                                igst_amount = 0.

                                Shows: Taxable Value 579.46
                                | CGST (6%) 34.77 | SGST
                                (6%) 34.77 | Total 649. HSN:
                                3406.

Error / Edge Case               Handling

Cart has candles (12%)          Calculate GST per line item separately. Each item has its own
and room spray (18%)            hsn_code and gst_rate. Sum for invoice.
Samorah's registered state  Affects every invoice. Super Admin must set
is wrong in settings        settings.store_state correctly before first order. Admin 
                            Settings  Tax/GST  Registered State.

Customer address has no     Validation: state is required field in address form. Block
state field                 checkout if missing.

 Claude Build Note:

Build a calculateGST(lineItems, customerState, storeState) function: for each item  extract
taxable_value = price / (1 + gst_rate/100)  if customerState === storeState  cgst = igst =
taxable_value * (gst_rate/2) / 100, else  igst = taxable_value * gst_rate / 100. Store all
three columns. Tax Invoice PDF must show zero-value columns as '0.00' not blank.
SECTION C -- Admin & Operations Flows (A1�A18)

A1     Add New Candle Product -- 6-Step Form

       Admin Flow -- Product Goes Live in <60 Seconds

Actor  Manager or Admin  Trigger                       Admin opens
                                                       /admin/products/new to add
                                                       'Kashmiri Chai' candle

Preconditions Product category 'Candles' exists. Collections 'Vol. I -- Dessert Chapter'
                        exists. Cloudinary connected.

Step Action (Who Does System Response                      DB / API Call
          What)

1 Admin opens         6-step wizard renders. Progress      GET /admin/products/new

       /admin/products/new bar shows Step 1/6.

2 Step 1: Basic Info  Name: 'Kashmiri Chai'. Slug auto-    productStore.setBasicInfo()
                      generated: 'kashmiri-chai'.
                      Category: Candles. Collection: Vol.
                      I. Price: 649. Weight: 380g. HSN:
                      3406. GST: 12%. Short description.
                      Status: Draft. Tags: bestseller,
                      warm.

3 Step 2: Variants    Admin clicks 'Add Variant'. Row:     productStore.addVariant()
                      Name '100g Glass', SKU auto:
                      SAM-CAN-001-100G-GL, Price
                      449, Stock 50, Vessel: Glass,
                      Size: 100g, Barcode: (optional).
                      Adds 2 more rows: 140g Ceramic,
                      180g Terracotta. 3 variants total.

4 Step 3: Images      Drag-drop 4 images. First            Cloudinary upload +
                      Primary. Admin adds alt text:        product_images INSERT
                      'Kashmiri Chai candle in ceramic
                      vessel -- warm spiced gourmand
                      fragrance'. Images upload to
                      Cloudinary, URLs stored.

5 Step 4: Fragrance   Top notes: Bergamot, Black Tea,      fragrance_notes INSERT
       Notes          Star Anise. Heart notes: Rose,
                      Cardamom, Cinnamon. Base
                      notes: Sweet Milk, Vanilla,
                      Sandalwood.

6 Step 5: SEO         SEO Title: 'Kashmiri Chai Scented productStore.setSEO()
                      Candle -- Warm Spiced Gourmand
7 Step 6: Preview            | Samorah' (63 chars). SEO Desc:       Client render
                             'Luxury handmade scented
8 Admin clicks               candle...' (158 chars). SERP           POST /api/admin/products
        'Publish'            preview shown below inputs.            next/cache
                                                                    revalidatePath()
9 Next.js ISR                Product card preview (as it appears
        revalidation         on collection page). Basic product     GET /shop/kashmiri-chai
        triggered            hero preview. Admin satisfied.

10 Product live in <60       products.status = active. POST
        seconds              /api/admin/products.

                             revalidatePath('/shop/kashmiri-
                             chai'),
                             revalidatePath('/collections/dessert-
                             chapter'). Cache purged.

                             Customer visits /shop/kashmiri-chai
                             -- sees new product fully rendered.

Error / Edge Case            Handling

Admin tries to publish       Step 3 validation: 'Primary image requires alt text'. Cannot
without alt text on primary  advance to Step 4.
image

SKU auto-generated           DB unique constraint fires. System auto-increments: SAM-
conflicts with existing      CAN-001  SAM-CAN-002. Admin sees new SKU.

Image upload fails           Error shown in Step 3. Upload retry button. Product cannot be
(Cloudinary)                 published without at least 1 image.

Admin leaves halfway         Product saved as Draft (status: draft). Admin can resume from
through (browser closes)     Step 1 -- all filled data persisted.

 Claude Build Note:

Build the multi-step form with persistent draft state -- save to DB as status=draft after each
step using debounced auto-save. Never lose admin data on navigation. The SKU auto-
generation function should query MAX(numeric portion of SKU per category) and increment
by 1.
A2  Bulk CSV Product Upload -- 10 to 30 Products

    Admin Flow -- Initial Catalog Population

Actor          Manager or Admin  Trigger                           Admin uploads a CSV to
Preconditions                                                      add 15 initial Samorah
                                                                   candles at once

               CSV template downloaded. Products sheet filled with all required columns.
               At least 1 image URL per product in Cloudinary.

Step Action (Who Does          System Response                     DB / API Call
          What)
                               Modal opens. Step 1: Download GET /admin/products/csv-
  1 Admin clicks 'CSV
          Import' on Products  Template button.                    template
          page
                               Template has columns: name,         CSV download
  2 Admin downloads            slug, category, collection, price,
          CSV template         sale_price, weight, hsn_code,
                               gst_rate, short_description,
  3 Admin fills 15 rows in     variant_name, variant_sku,
          Excel/Google Sheets  variant_price, variant_stock,
                               vessel_type, image_url_1
  4 CSV uploaded               (primary), image_alt_1,
                               seo_title, seo_description, tags
  5 Validation report
          shown                Each row = one variant.             Local
                               Multiple rows per product (same
  6 Admin fixes errors in      name, different variant). Saves
          CSV, re-uploads      and uploads CSV.

  7 Preview shown              POST /api/admin/products/csv-       POST
          before confirming    import. File parsed with Papa       /api/admin/products/csv-
                               Parse.                              import

                               Row-by-row errors highlighted       Validation engine
                               red. Example: Row 7: 'Duplicate
                               SKU SAM-CAN-001-100G-GL'.
                               Row 12: 'Missing HSN code'.
                               Row 15: 'image_url_1 is not a
                               valid Cloudinary URL'. 3 errors,
                               12 valid rows.

                               Validation runs again. 0 errors.    POST again
                               15 valid rows (3 products � 5
                               variants).

                               Table: Product Name | Variant | Preview render
                               SKU | Price | Stock | Action. All
                             15 rows with green 'Ready'
                             badge.

8 Admin clicks 'Confirm Atomic DB transaction: INSERT DB transaction

Import'                      products, INSERT variants,

                             INSERT product_images,

                             INSERT fragrance_notes for all

                             15 rows. Rollback all on any

                             failure.

9 ISR revalidation           All new product pages and       revalidatePath() � N

triggered for all new collection pages revalidated.

products

10 Admin sees success: Products now appear in                --

'15 products imported Products list and on store.

successfully'

Error / Edge Case            Handling

Partial import fails (row 8  Entire transaction rolled back. None of the 15 imports persist.
DB error)                    Admin must fix and retry.

Image URLs not uploaded Validation fails for those rows. Admin must upload images

to Cloudinary yet            first, get Cloudinary URLs, then add to CSV.

More than 100 rows           Admin warning: 'Large imports may take up to 2 minutes. Do
uploaded                     not close this tab.'

 Claude Build Note:

The CSV import must use an atomic PostgreSQL transaction -- all-or-nothing. Use Papa
Parse on frontend for pre-validation before upload. Build the validation engine as a separate
service function (validateProductCSVRow) that tests each row against all business rules
before any DB writes.
A7     NDR -- Instruct Re-attempt Delivery

       Admin Flow -- Non-Delivery Report Management

WHY NDR MANAGEMENT IS CRITICAL FOR SAMORAH:

In India, 15�30% of COD orders fail delivery on first attempt. Without NDR tracking, these
orders:
� Sit unnoticed for days  customer gets angrier  bad reviews
� Pile up as RTOs  product returned damaged  revenue lost
� Hurt Shiprocket service rating  higher rates charged

Actor  Manager or Admin  Trigger                     Shiprocket courier fails to
                                                     deliver -- customer was
                                                     unavailable or address was
                                                     unclear

Preconditions Shiprocket sends NDR webhook. orders.ndr_status = delivery_failed.
                        Admin NDR tab shows the order.

Step   Action (Who       System Response                             DB / API Call
  1    Does What)
  2                      Shiprocket records: NDR Reason =            Shiprocket courier app
  3    Courier attempts  'Customer not available'. Timestamp
  4    delivery --       logged.                                     POST
  5    customer                                                      /api/shiprocket/webhook
  6    unavailable       POST /api/shiprocket/webhook. payload:
                         { order_id, awb, ndr_status:                UPDATE orders
       Shiprocket sends  'delivery_failed', reason:
       NDR webhook to    'customer_not_available' }                  Admin dashboard
       Samorah                                                       widget
                         UPDATE orders SET ndr_status =              GET
       Webhook           'delivery_failed', ndr_reason =             /admin/orders?tab=ndrs
       updates DB        'customer_not_available'.
                                                                     External call
       Admin             Dashboard shows: '2 orders need NDR
       dashboard: NDR    attention'. Quick action: 'View NDRs'.
       alert badge
                         Table: Order# | Customer | Phone | AWB
       Admin opens       | Courier | Failure Reason | Date | Action
       Orders  NDR       buttons (Instruct Re-attempt | Accept
       Tab               RTO)

       Admin calls       'Hi, we tried delivering your Samorah
       customer          order. Can we attempt again tomorrow?'
                         Customer: 'Yes, I'll be home.'
7 Admin clicks             Modal: delivery instructions (e.g. 'Ring  --
       'Instruct Re-
       attempt'            bell 3 times, call 5 min before'). Admin

                           clicks Confirm.

8 API calls                POST Shiprocket                           POST Shiprocket NDR

Shiprocket NDR /orders/{shiprocket_order_id}/ndr/update: API

endpoint                   { action: 're_attempt',

                           delivery_instructions: '...' }

9 orders.ndr_status = 're_attempt_scheduled'. NDR tab                UPDATE
                                                                     orders.ndr_status
updated                    shows updated status.

10 Courier re-             Delivery successful. Shiprocket           Shiprocket webhook
        attempts next      webhook: status = delivered. ndr_status
        day                cleared.

Error / Edge Case          Handling

Customer says address is   Admin updates address in Shiprocket dashboard directly.
wrong (provide new         Then instructs re-attempt with new address note.
address)

3rd re-attempt also fails  Accept RTO (flow A8). Package returns to Samorah
                           warehouse.

COD amount not collected Shiprocket tracks COD collection separately. Admin must

on re-attempt              reconcile in Shiprocket dashboard.

 Claude Build Note:

Build the NDR tab as a separate filter view in /admin/orders: ?ndr=true. The 'Instruct Re-
attempt' button must open a modal with a delivery notes field before calling Shiprocket API.
Log all NDR actions in audit_logs: { action: 'ndr_reattempt_instructed', entity: 'order',
entity_id, note }.
A10 Bulk CSV Inventory Update

               Admin Flow -- Restocking Multiple SKUs at Once

Actor          Manager or Admin  Trigger                        Admin receives new stock
Preconditions                                                   batch -- needs to update
                                                                12 SKUs simultaneously

               New stock counts known for all variants. CSV template downloaded.

Step  Action (Who Does        System Response                   DB / API Call
  1   What)
  2   Admin opens             Inventory dashboard. 'Bulk        --
  3   /admin/inventory        Update (CSV)' button in top       CSV download
  4   Downloads inventory     right.                            Local
  5   CSV template                                              POST
  6   Admin fills 12 rows in  Template columns: variant_sku,    /api/admin/inventory/bulk-
  7   spreadsheet             new_stock_quantity, note          update
      Uploads CSV             (optional)                        Validation engine
  8
  9   Validation report       Example: SAM-CAN-001-100G-        --
                              GL, 75, 'New batch Oct 2025'
      Admin fixes row 5, re-                                    DB transaction
      uploads                 POST
                              /api/admin/inventory/bulk-        Dashboard refresh
      Admin confirms          update. Papa Parse reads file.    --

      Low stock alerts        Row-by-row check: SKU exists?
      cleared                 New stock  0? Row 5: 'SKU
      Success message         SAM-CAN-999 not found'. 1
                              error, 11 valid.

                              0 errors. 12 valid rows. Preview
                              table shown: SKU | Product
                              Name | Current Stock | New
                              Stock | Change.

                              Atomic transaction: UPDATE
                              variants SET stock =
                              new_stock_quantity. INSERT
                              inventory_logs for each row:
                              change_type='restock',
                              qty_change=(new-old),
                              qty_after=new, note, admin_id.

                              For any SKU where new stock
                              > low_stock_threshold  alert
                              status cleared in dashboard.

                              '12 SKUs updated successfully.
                              Total units added: 487.'
Error / Edge Case            Handling

Admin uploads 'add X units' Two modes available: 'Set stock to' (absolute) and 'Add to

instead of 'set to X units'  stock' (relative). Admin must choose mode before upload.

                             Default: Set stock to (absolute).

SKU not found in DB          Row rejected. All other rows proceed (non-atomic per row, not
                             per batch). Admin can fix specific rows.

 Claude Build Note:

Provide two modes in the bulk upload: 'Set Stock To [value]' (replaces current stock) and
'Add To Stock [value]' (increments current stock). The inventory_log must record both old
and new values regardless of mode. This is the audit trail for GST/accounting purposes.
SECTION D -- Marketing & Automation Flows (M1�M12)

M1            New Collection Launch Campaign

              Marketing Flow -- Vol. IV Nature Chapter Launch

Actor             Editor + Admin + Marketing Trigger           Samorah is ready to launch
                  Team                                         Vol. IV -- Nature Chapter
                                                               with 4 new candles

Preconditions Products created in Admin (status: draft). Blog post drafted. Banner images
                        designed. Email list segmented.

Step Action (Who Does   System Response                        DB / API Call
          What)

1 Week -2: Teaser       Admin  Banners  Edit 'hero'            homepage_banners
       phase            slot: 'Something from Nature is        UPDATE
                        coming' + moody forest image.
                        Update announcement bar:
                        'Vol. IV -- Nature Chapter
                        launches in 14 days'. No
                        products visible yet.

2 Week -1: Pre-launch Newsletter campaign:                     Resend Broadcasts

       email            'Introducing Vol. IV -- The

                        Nature Chapter. A fragrance

                        world shaped by earth, rain,

                        and forest.' No product links

                        yet. CTA: 'Set a reminder'. open

                        rate tracked.

3 Launch day: Products Admin  Products  Select all UPDATE products.status =

       published        4 draft products  Bulk action: active + revalidatePath()

                        'Publish'. status = active. ISR

                        revalidation.

4 Launch day:           Admin  Collections  Vol. IV            UPDATE collections
       Collection page   Assign 4 new products.
       updated          Collection page now shows new
                        candles.

5 Launch day: Blog      Admin  Blog  Vol. IV story             Blog publish
       post published    Click 'Publish Now'. Sanity
                        CMS or MDX post goes live.

6 Launch day:           Admin  Banners  hero: 'Vol.            homepage_banners
       Homepage hero    IV -- Nature Chapter is here' +        UPDATE + ISR
       updated          nature candle editorial image +
                          'Explore Now' CTA 
                          /collections/nature-chapter.

7 Launch email sent       Newsletter: 'Vol. IV is live. 4  Resend Broadcasts
                          new fragrances: Forest Rain,
                          Vetiver Clay, Wild Fig, Stone &
                          Moss.' Product cards with CTA.
                          Sent to full subscriber list.

8 GA4 monitoring          Events: view_item_list           GA4 Dashboard
                          (collection page surge),
                          add_to_cart (new products),
                          purchase. Dashboard shows
                          real-time product performance.

9 Week +1: Low stock If any Vol. IV variant hits           pg_cron + Resend alert

check                     low_stock_threshold  admin

                          alert email  restock before

                          stockout.

Error / Edge Case         Handling

Blog post auto-scheduled  Sanity CMS or pg_cron scheduling failure. Admin must
but fails to publish      manually publish. Build webhook from Sanity to trigger ISR on
                          publish.

Vol. IV products          Admin must use 'Scheduled Publish' feature or keep
accidentally made active  status=draft until launch moment.
before launch day

 Claude Build Note:

The 'Scheduled Publish' feature for products is a Phase 2 addition -- implement publish_at
TIMESTAMP on products table. pg_cron sweeps: UPDATE products SET status='active'
WHERE publish_at <= NOW() AND status='draft'. Until then, admin manually publishes on
launch day.
M5    Abandoned Cart -- pg_cron Trigger Deep Dive

      Marketing Flow -- Technical Implementation

Actor          pg_cron System       Trigger       Hourly cron job identifies
Preconditions  (Supabase) + Resend                abandoned carts and
                                                  triggers email sequences

               pg_cron enabled in Supabase. Resend API configured. cart table has:
               last_activity_at, abandoned_email_1_sent, abandoned_email_2_sent,
               abandoned_email_3_sent, email (for guests).

SQL Function in Supabase (runs every hour via pg_cron):

CREATE OR REPLACE FUNCTION sweep_abandoned_carts() RETURNS void AS $$
BEGIN

   -- Email 1: 1 hour after last activity, not sent yet
   FOR cart_row IN SELECT * FROM cart WHERE last_activity_at < NOW()-'1
hour'::interval

       AND abandoned_email_1_sent = false
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = cart.user_id

          AND o.created_at > cart.last_activity_at) LOOP
       PERFORM http_post(edge_function_url, cart_row); -- triggers Resend
       UPDATE cart SET abandoned_email_1_sent=true WHERE id=cart_row.id;
   END LOOP;
   -- Repeat for Email 2 (24hr) and Email 3 (72hr + coupon auto-generate)
END; $$ LANGUAGE plpgsql;

Step  Action (Who Does           System Response                 DB / API Call
  1   What)
  2   pg_cron runs every hour    SELECT cron.schedule('0 * *     Supabase pg_cron
                                 * *', 'SELECT                   pg_cron SQL query
  3   Email 1 cohort identified  sweep_abandoned_carts()');
                                                                 Supabase Edge
  4   Supabase Edge Function     Carts with last_activity > 1hr  Function
  5   triggered                  ago, email_1 not sent, no       POST Resend API
                                 recent order. Guest carts       UPDATE cart
      Email 1 sent: 'Your        need email field populated.
      candles are waiting'
                                 For each cart: POST to Edge
      Flag set:                  Function with cart items data.
      abandoned_email_1_sent     Edge Function calls Resend
      = true                     API.

                                 Soft emotional. No discount.
                                 Product images. Return to
                                 cart CTA.

                                 Prevents Email 1 from being
                                 sent again on next cron run.
6 24hr later: pg_cron       Same logic but checks            pg_cron SQL query

identifies Email 2 cohort abandoned_email_2_sent =

                            false and last_activity > 24hr.

7 Email 2 sent: 'Still      Brand story excerpt. Product POST Resend API
       thinking?'           shown. No discount still.

8 72hr later: Email 3 with  Auto-generate coupon:            INSERT coupons +
       auto-coupon          code=CART10-[uuid],              POST Resend
                            value=10%, max_uses=1,
                            expires=NOW()+48hr. Link
                            coupon to cart session/user.

9 Customer clicks Email 3 Cart restored. Coupon              GET
                                                             /cart?coupon=CART10-
link                        CART10-xxx pre-applied in        xxx

                            cartStore. 'Special offer

                            applied' shown.

 Claude Build Note:

The Supabase Edge Function approach avoids exposing the Resend API key in the pg_cron
SQL function. pg_cron calls the Edge Function URL with a secret header (shared secret
auth). Edge Function has Resend key in env vars. This is the correct security pattern.
M12 Search Analytics -- Zero Result Queries

                Marketing Flow -- Discovering Missing Products

Actor          Customer + Admin  Trigger                      Customer searches for
Preconditions                                                 something Samorah doesn't
                                                              sell yet -- zero results
                                                              returned

               search_logs table exists with columns: query, results_count,
               clicked_product_id, user_id, session_id, created_at

Step Action (Who Does       System Response                     DB / API Call
          What)
                            useSearchStore.openSearch().        useUIStore
  1 Customer opens          Search overlay appears.             GET /api/search
          search bar                                            PostgreSQL FTS
                            Debounced query -- after
  2 Customer types 'rose    300ms pause: GET                    --
          candle'           /api/search?q=rose+candle
                                                                INSERT search_logs
  3 Search executes full-   PostgreSQL: SELECT * FROM
          text query        products WHERE                      INSERT search_logs +
                            to_tsvector(name || ' ' ||          UPDATE
  4 Zero results returned   description) @@
                            to_tsquery('rose & candle') AND     GET
  5 Zero result logged      status='active'. Result: 0 rows.    /admin/analytics/search

  6 Customer clicks         UI shows: 'No results for "rose
          'Kashmiri Chai'   candle"'. Suggestions shown:
          suggestion        'Try: Kashmiri Chai, Floral
                            Chapter'.
  7 Admin reviews
          search analytics  INSERT search_logs: { query:
          monthly           'rose candle', results_count: 0,
                            clicked_product_id: null,
                            user_id, session_id, created_at:
                            NOW() }

                            UI navigates to product.
                            INSERT search_logs: { query:
                            'rose candle', results_count: 0,
                            clicked_product_id: 'kashmiri-
                            chai-uuid' }

                            Admin  Analytics  Search
                            Insights. Table: Top zero-result
                            queries | Top clicked products |
                            Search conversion rate.
  8 Admin spots pattern 'rose candle' searched 47 times Business decision
                                           in Nov. 'oud candle' searched
                                           31 times. Both = 0 results.
                                           Decision: create these
                                           products.

 Claude Build Note:
The search_logs table is a product roadmap goldmine. Build the admin analytics view with:
(1) Top 20 zero-result queries this month, (2) Top 20 queries by volume, (3) Top 20 queries
with click-throughs. Export to CSV. Run this analysis before every new collection launch to
understand what customers want.
SECTION E -- Security & Edge Case Flows (S1�S8)

S1    Coupon + Loyalty Stacking -- API-Level Block

      Security Flow -- Discount Stacking Rule Enforcement

STACKING RULES (enforce at API, not just UI):
    Coupon Code + Loyalty Points redemption = BLOCKED
    Two coupon codes = BLOCKED (second replaces first, or show error)
    Gift Card + Coupon Code = ALLOWED (gift card is pre-paid currency)
    Gift Card + Loyalty Points = ALLOWED
    Gift Card + Gift Card = BLOCKED in "Phase 1 Limitation: Only one gift card code can be

applied per order.

Step  Action (Who Does       System Response                      DB / API Call
  1   What)
  2   Customer has 500       checkoutStore.loyaltyPointsUsed      --
  3   loyalty points queued  = 500. 50 discount applied.          POST /api/coupons/apply
  4   on checkout                                                 Server stacking check
      Customer enters        POST /api/coupons/apply.             HTTP 409
  5   SUMMER15 coupon        Coupon is valid (15% off, active,
      code                   not expired).                        Modal component
  6   API checks stacking
  7   rule                   if (request.loyaltyPointsUsed > 0    checkoutStore update
                             && couponCode !== null)              Server validation
      API returns 409        CONFLICT
      Conflict
                             { error: 'discount_stack_conflict',
      UI shows selection     message: 'Cannot combine
      modal                  coupon with loyalty points.
                             Choose one.' }
      Loyalty redemption
      cancelled              Two clear options: 'Keep 50
                             loyalty discount' vs 'Apply
      Checkout finalize --   SUMMER15 (save 97)'. User
      server double-check    picks SUMMER15.

                             checkoutStore.loyaltyPointsUsed
                             = 0. Coupon applied. Discount =
                             97.

                             POST /api/checkout/finalize
                             validates: not both coupon +
                             loyalty points. If both present (UI
                              bypass attempt)  reject order
                              with 400.

Error / Edge Case             Handling

Clever user inspects          The /api/checkout/finalize endpoint enforces the rule server-
network calls and sends       side. Cannot be bypassed via API manipulation.
both in API request

Admin creates a 'loyalty      Not in Phase 1. Coupon entity has no stackable_with_loyalty
stackable' coupon -- is that  boolean. All coupons follow the rule. Phase 2 consideration.
possible?

 Claude Build Note:

Always enforce discount rules in TWO places: (1) /api/coupons/apply for immediate
feedback, (2) /api/checkout/finalize as the authoritative gate. Never trust the frontend to
enforce business rules alone. Log any attempts to bypass stacking rules in audit_logs: {
action: 'discount_stack_attempt' }.
S7     Webhook Logs -- Debugging Razorpay Errors

       Security Flow -- Observability & Debugging

webhook_logs table schema:

id UUID | provider VARCHAR(50) | event_type VARCHAR(100) | payload JSONB |
status ENUM(received|processed|failed|duplicate) | error_message TEXT |
retry_count INTEGER | processed_at TIMESTAMP | created_at TIMESTAMP

Actor  System (Razorpay         Trigger                             A Razorpay
       webhook) + Admin                                             payment.captured webhook
                                                                    fails to fully process --
                                                                    Shiprocket API is down

Preconditions Payment has been captured. Webhook received. But Shiprocket API
                        returns 503.

Step   Action (Who Does         System Response                     DB / API Call
  1    What)
       Webhook received         POST /api/razorpay/webhook.         INSERT webhook_logs
  2                             HMAC verified. INSERT
  3    Idempotency check        webhook_logs: {                     SELECT orders
  4    passed                   provider:'razorpay',                UPDATE orders + variants
  5    Order status updated,    event_type:'payment.captured',      Shiprocket API  503
       inventory                payload:{...}, status:'received' }  UPDATE webhook_logs
  6    decremented
  7    Shiprocket API call      No duplicate. Proceed to            POST Resend API
       fails (503 Service       process.                            Edge Function retry
       Unavailable)
       Error logged             Orders updated. Inventory
                                decremented. Success so far.
       Email still sent (email
       is independent)          POST Shiprocket /orders/create
                                returns 503.
       Retry logic (3
       attempts, exponential    UPDATE webhook_logs SET
       backoff)                 status='failed',
                                error_message='Shiprocket
                                503: Service Unavailable',
                                retry_count=0.

                                Order confirmation email sent
                                despite Shiprocket failure.
                                Customer gets confirmation.

                                Supabase Edge Function
                                retries Shiprocket: 5min later 
8 On success             fail  15min  fail  60min           UPDATE webhook_logs +
9 If all retries fail    success.                           orders

                         UPDATE webhook_logs SET            Resend admin alert
                         status='processed',
                         retry_count=3. UPDATE orders
                         SET shiprocket_order_id='...'.
                         Admin dashboard: no NDR
                         alert.

                         webhook_logs.status = 'failed'
                         permanently. Admin alert email:
                         'Shiprocket sync failed for order
                         SAM-2025-0042. Manual action
                         required.' Admin creates
                         Shiprocket order manually.

Error / Edge Case        Handling

How does admin find failed Admin  /admin/webhooks: table of all webhook_logs filtered

webhooks?                by status='failed'. One-click 'Retry' button per row.

Resend email also fails  Separate Resend webhook log entry. Customer order is safe
(email service down)     in DB. Email can be resent manually from admin order detail.

Multiple webhook providers Same webhook_logs table, differentiated by provider field.

(Razorpay + Shiprocket)  Both visible in admin webhook log view.

 Claude Build Note:

Build /admin/webhooks as a read-only diagnostic tool accessible to Admin and Super Admin.
Columns: Timestamp | Provider | Event | Status | Retry Count | Error | Action (Retry button).
This screen alone will save hours of debugging when integrations fail. Every webhook
endpoint should write to webhook_logs as its FIRST action.
S8    Product Recommendations -- Fragrance Family & Related

      Security/Feature Flow -- Recommendation Engine

Actor          Customer viewing a  Trigger                     Customer is viewing
Preconditions  product page                                    Kashmiri Chai
                                                               (fragrance_family:
                                                               Dessert/Gourmand, mood:
                                                               Warm, collection: Vol. I)

               related_products table OR query-based recommendation logic
               implemented

Step  Action (Who Does      System Response                    DB / API Call
  1   What)
  2   Customer views        Page loads with 'You May Also      GET /shop/kashmiri-chai
      Kashmiri Chai         Like' section at bottom.           getRelatedProducts(product)
  3   product page
  4   Recommendation        Rule 1 (same collection,           --
  5   query executes        different product): SELECT *       --
  6                         FROM products WHERE                Client-side dedup
  7   Rule 2 (same          collection_id = 'vol-1' AND id !=  GA4 event
      fragrance family)     current_product_id LIMIT 3.        INSERT search_logs

      Rule 3 (same mood)    SELECT * FROM products
                            WHERE fragrance_family =
      Deduplicate and rank  'dessert_gourmand' AND id !=
                            current_product_id LIMIT 3.
      Rendered as product
      cards                 SELECT * FROM products
                            WHERE mood = 'warm' AND id
      Search_logs           != current_product_id LIMIT 2.
      enhancement
                            Combine results: products
                            appearing in 2+ rules ranked
                            higher. Final: max 6
                            recommendations shown.

                            Gallery-style product cards.
                            Clicking fires select_item GA4
                            event with item_list_name:
                            'recommendations'.

                            If customer searched before
                            landing here, log: { query:
                            'warm chai candle',
                            clicked_product: 'kashmiri-chai-
                            id' } -- helps improve
                            recommendations.
New Database Tables Needed  Purpose

related_products            Manual overrides: product_id,
                            related_product_id, sort_order -- set by
                            admin for editorial curation

search_logs                 query, results_count, clicked_product_id,
                            user_id, session_id, created_at

wishlists                   user_id, product_id, variant_id, created_at --
                            persistent DB-backed wishlist

stock_reservations          variant_id, quantity, session_id, expires_at
                            -- prevents overselling

webhook_logs                provider, event_type, payload, status,
                            error_message, retry_count

notifications               user_id, title, body, type, is_read, created_at
                            -- persistent notification center

 Claude Build Note:

Add these 6 tables to the Supabase migration in Phase 4 (Database). They are referenced
throughout multiple flows. The recommendations engine starts as a simple rule-based SQL
query (Phase 1). Phase 2: add ML-based collaborative filtering using order history data.
Appendix A -- 6 Missing Database Tables (Add to BRD
Phase 4)

 These tables were identified during USD creation and must be added to the Supabase
 migration.
 Reference: Add all 6 to BRD Section 8 Phase 4 migration file.

Table               Key Columns                        Why It Exists
stock_reservations
webhook_logs        variant_id, quantity, session_id,  15-minute checkout hold.
search_logs         expires_at                         Prevents overselling when 2
related_products                                       customers check out same last
wishlists                                              item simultaneously. Cleared
                                                       by pg_cron every 5 min.
notifications
                    provider, event_type, payload      Razorpay + Shiprocket
                    JSONB, status, error_message,      webhook observability. Saves
                    retry_count                        hours of debugging. Admin
                                                       /admin/webhooks screen reads
                                                       this table.

                    query, results_count,              Product discovery analytics.
                    clicked_product_id, user_id,       Zero-result queries = product
                    session_id, created_at             roadmap. Monthly analysis
                                                       drives new collection decisions.

                    product_id, related_product_id,    Powers 'You May Also Like'
                    sort_order, relation_type          section on product page. Admin
                    (same_family/same_mood/manual)     can manually curate editorial
                                                       pairings.

                    user_id, product_id, variant_id,   Zustand wishlist store already
                    created_at                         exists but needs DB
                                                       persistence for logged-in users.
                                                       Enables back-in-stock
                                                       campaigns and wishlist email
                                                       reminders.

                    user_id, title, body, type         Persistent notification center in
                    (order/loyalty/promo), is_read,    /account. Shows order updates,
                    action_url, created_at             tier upgrades, back-in-stock
                                                       alerts. Zustand state is
                                                       ephemeral -- DB makes it
                                                       persistent.
Appendix B -- 3 BRD Updates from Final Review

# Section to Update         Exact Change Required
1 BRD Section 11.5 +
                            Add stacking rule: 'Only one coupon per order. Coupons cannot
     15.1                   be combined with loyalty point redemptions. Gift cards are
2 BRD Section 12.2          exempt from this rule and may be combined with either.'

3 BRD Section 22.2          Add note: 'The /api/razorpay/verify endpoint exists solely to
     (Future Deliverables)  redirect the customer to the Thank You page. ALL business
                            logic (inventory, Shiprocket, email, GST, invoice) runs
                            exclusively in /api/razorpay/webhook. Never put order
                            processing logic in /verify.'

                            Add: 'WhatsApp API Integration via Wati or Interakt -- for OTP
                            delivery and automated Shiprocket tracking updates. Indian
                            customers expect order updates on WhatsApp. Phase 2
                            implementation after core platform is stable.'

Appendix C -- Claude Prompts for New USD Flows

Flow  Claude Prompt Template
C10
P5    'Build the coupon application API at /api/coupons/apply. Enforce stacking rule from
A7    SAMORAH USD C10: if request body contains both coupon_code and
S7    loyalty_points_used > 0, return HTTP 409 with error discount_stack_conflict. Also
P7    enforce in /api/checkout/finalize as server-side double-check.'

      'Build the Razorpay webhook handler at /api/razorpay/webhook. All business logic
      goes HERE -- not in /verify. Follow SAMORAH USD P5 exactly: 1) HMAC verify 2)
      idempotency check 3) order update 4) inventory decrement 5) Shiprocket create 6)
      GST calculate 7) invoice PDF 8) email send.'

      'Build the NDR management tab in the admin orders section. Follow SAMORAH
      USD A7: filter by orders WHERE ndr_status = delivery_failed. Show: Order# |
      Customer Phone | AWB | Reason | Date. Two action buttons: Instruct Re-attempt
      (calls Shiprocket NDR API) and Accept RTO. Log all actions in audit_logs.'

      'Create the webhook_logs table from SAMORAH USD S7 schema. Build
      /admin/webhooks screen: TanStack Table showing all logs filtered by status=failed.
      One-click Retry button per row. Also build the Edge Function retry logic with 3
      attempts at 5min, 15min, 60min intervals.'

      'Create the stock_reservations table from SAMORAH USD P7. Build the reserve-
      stock API at /api/checkout/reserve that creates a 15-minute hold. Build the pg_cron
      cleanup job that runs every 5 minutes to DELETE FROM stock_reservations
      WHERE expires_at < NOW(). Update all available-stock queries to subtract active
      reservations.'
