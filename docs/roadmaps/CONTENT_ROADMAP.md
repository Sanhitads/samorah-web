# Samorah Content & Contact — Roadmap

**Scope:** the customer-facing content pages served by the existing **Pages CMS** (`cms_pages` / `cmsService` /
`LegalPage` / `ContentManager`), and the Contact module built on top of it. Governing rule throughout:
**extend the existing CMS, Settings, and Operations infrastructure — never build a parallel system.**

## Governing Principles
- **Single CMS.** All content pages live in `cms_pages` and render through the shared `LegalPage` shell; edits
  go through `ContentManager` (draft / schedule / publish / revisions / audit). No page-specific CMS.
- **Single source for contact info.** Email / phone / WhatsApp / studio address / business hours are read from
  `siteSettingsService` (`site_settings.support`). Pages resolve tokens (`{{supportEmail}}`, `{{studioAddress}}`,
  `{{businessHours}}`) server-side — never a duplicated copy.
- **Reuse Operations.** New-enquiry alerts fire through the existing `emitNotification` engine — no new
  notification system.
- **Additive, no redesign.** Existing routes (`/shipping`, `/returns`) are extended in place, not replaced with
  parallel pages.

## Content Pages Status
| Page | Route | Status | Commit |
|---|---|---|---|
| Privacy Policy | `/privacy` | **Committed · Frozen** | `70ac23a` |
| Terms & Conditions | `/terms` | **Committed · Frozen** | `fb1a21d` |
| Returns & Refund Policy | `/returns-policy` | **Committed · Frozen** | `20821c4` |
| Shipping Policy | `/shipping` *(existing route)* | **Committed · Frozen** | `2b171fc` |
| FAQ | `/faq` | **Committed · Frozen** | `fcaac8a` |
| Contact | `/contact` | **Committed · Frozen** | `e13a6cf` |
| Product Care | `/product-care` *(existing route)* | **Committed · Frozen** | `e74f633` |
| Behind Samorah | `/the-people-behind-samorah` | **Committed · Frozen** | this commit |

---

## Phase C3 — Behind Samorah

**Status: Approved · Committed · Frozen. LAUNCH READY.**

A quiet editorial "people" page (Trudon / Aesop / Kinfolk register) on the **same Pages CMS** and the
Product Care rendering pattern. Answers one question — *who quietly shapes Samorah* — not the brand
story (that is Our Story). No new CMS, editor framework, route, or database schema.

### Includes
- ✓ Editorial renderer (`PeopleContent`) — optional hero image, **person Feature** blocks (asymmetric
  image left / right / wide), an auto-expanding **card grid** (3 / 2 / 1 columns), **image breaks**
  (overlay + gradient fallback), **dividers**, and centred **statements / pull-quotes**
- ✓ **Role-as-content hierarchy** — each `person` section's `displayStyle` (**feature / card /
  highlight**, plus the hidden toggle) sets its weight, so contributors are added, reordered,
  reweighted or hidden **entirely in the CMS** (no code): perfumer, ceramic artist, photographer,
  packaging designer, etc.
- ✓ CMS editor (`/admin/content/the-people-behind-samorah`) — reuses the ContentManager editorial
  editor: Type (person / image break / statement / divider), displayStyle, role / name / story /
  optional quote, Media Library portrait, layout, ratio, hero image, and move / duplicate / hide /
  delete; faithful side-by-side live preview
- ✓ Images via the platform `AssetImage` atom (responsive Cloudinary `srcSet`, blur-up, lazy,
  CLS-safe); **delete-protected** in the Media Library (mediaId in `sections` / `form_config`)
- ✓ SEO (title / description / canonical / OG) + **Breadcrumb** JSON-LD; semantic headings;
  responsive (features stack image-first, grid collapses to one column on mobile)

### Additive fields *(reference)*
`variant: "person"`, `displayStyle`, `quote` — optional, in the existing `sections` JSONB. The hero
image lives in the existing `form_config` JSONB (`{ heroImage }`). **No migration.** Text-only pages
and Product Care are unaffected.

### Future Enhancements *(post-launch, roadmap-controlled)*
- Highlight cards (larger featured grid card) — supported, unused in the seed
- Per-person detail links; sub-teams / departments as additional grids

---

## Phase C2 — Product Care Editorial Experience

**Status: Approved · Committed · Frozen. LAUNCH READY.**

A premium editorial page (Trudon / Santa Maria Novella rhythm — alternating image/text, generous
whitespace, large photography) on the **same Pages CMS** as the policy pages. No new CMS, editor
framework, route, or database schema.

### Includes
- ✓ Editorial renderer (`ProductCareContent`) — hero, alternating **left / right / center / wide**
  image blocks, **overlay** image breaks (with editorial fallback when no image), **accordions**
  (reusing `FaqAccordion`), movement **dividers** and centred **statements**
- ✓ Two chapters — Candle Care → a full-width chapter transition → Room Fragrance Care
- ✓ CMS editor (`/admin/content/product-care`) — per-section **Type** (editorial / overlay / accordion
  / statement / divider), step / small-heading / title / body, image (Media Library picker), alt,
  caption, layout, ratio, overlay text-alignment, **move / duplicate / hide / delete**; side-by-side
  live preview
- ✓ Non-destructive type switching (explicit `variant`); hidden-section toggle
- ✓ Images via the platform `AssetImage` atom — responsive Cloudinary `srcSet`, blur-up LQIP, lazy
  loading, CLS-safe reserved aspect-ratio; **delete-protected** in the Media Library via the existing
  `getMediaUsage` reverse lookup (references released on removal)
- ✓ SEO (title / description / canonical / OG) + **Breadcrumb** JSON-LD; semantic headings; responsive

### Additive section fields *(reference)*
`step`, `label`, `image{mediaId,url,alt,caption,focal}`, `layout`, `ratio`, `variant`, `align`, `hidden`
— all optional, stored in the existing `cms_pages.sections` JSONB (**no migration**). Text-only policy
pages never set them and are unaffected.

### Boundary
Internally named **Product Care** (holds candles, room sprays and future ranges). No schema change, no
migration, no new CMS system — the five section types render every composition.

### Future Enhancements *(post-launch, roadmap-controlled)*
- Care FAQ as a dedicated in-page chapter (optional)
- Video overlays; per-breakpoint art-directed crops
- Additional product-family chapters (wax melts, gift sets)

---

## Phase C1 — Contact Module

**Status: Approved · Committed · Frozen (`e13a6cf`). LAUNCH READY.**

A complete Contact experience delivered on the existing content-page CMS and the existing Operations
infrastructure — no new page framework, CMS, notification system, or publish flow.

### Includes
- ✓ Customer Contact page (`/contact`, CMS-driven, shared LegalPage shell)
- ✓ CMS editor (fixed-block Contact mode in `ContentManager`)
- ✓ Live preview (renders the real page shell + `ContactContent`)
- ✓ Customer enquiry form (labelled, accessible fields + char counter)
- ✓ Validation (shared zod `contactSchema`, client + server)
- ✓ Rate limiting (reuses `lib/rateLimit`)
- ✓ Honeypot (silent-accept spam trap)
- ✓ Operations notification (via existing `emitNotification`)
- ✓ Customer Enquiries module (Admin → Operations: list + detail)
- ✓ Timeline (`contact_enquiry_events`)
- ✓ Assignment (assign-to-me / unassign + internal notes)
- ✓ CSV export (reuses `data.export` capability)
- ✓ SEO (title / description / canonical / OG)
- ✓ JSON-LD (`ContactPage`)
- ✓ Responsive
- ✓ Accessibility (labels, `aria-invalid` focus management, keyboard)

### Single-Source & Reuse *(reference — documentation only)*

**Module OWNS**
- Contact page content (a `cms_pages` row + `form_config` JSONB)
- Enquiry datastore (`contact_enquiries` + `contact_enquiry_events`) and its status machine
- The Customer Enquiries admin workflow (list / detail / status / assign / notes / export)

**Module CONSUMES** *(reads existing outputs — never owns their truth)*
- `siteSettingsService` — contact methods, hours, studio address, social (single source)
- `emitNotification` (notificationCenterService) — new-enquiry Operations alert
- `lib/rateLimit`, checkout `fieldErrors(zod)` — request throttling + validation surfacing
- `cmsService` / `ContentManager` / `LegalPage` — content storage, editing, rendering
- Auth capabilities (`enquiries.manage`, `data.export`), `requireStaff` / `requireCapability`

**Module does NOT OWN** *(live in their own systems; Contact only reflects/uses them)*
- Notification delivery · Site settings truth · The CMS publish/revision engine · Authentication

### Boundary
- **Enquiries are stored only.** No outbound email is sent in this phase (prepared for a future reply phase).
- **No duplicated contact data** — all contact info resolves from Site Settings.

### Deployment prerequisite
Apply migration `20260901120000_contact_enquiries.sql` to each environment and reload PostgREST's schema
cache (`NOTIFY pgrst, 'reload schema'`) before the form can store submissions.

### Future Enhancements *(Post-Launch — roadmap-controlled, each requires an approved phase)*
- Email replies (outbound, from the enquiry detail)
- Auto-acknowledgement emails to the customer on submit
- Attachments
- Spam detection (beyond honeypot + rate limit)
- Conversation threading
- Customer history (link enquiries to accounts/orders)
- WhatsApp integration

---

**The Contact module is COMPLETE FOR LAUNCH.** Future structural changes require explicit roadmap approval; no
ad-hoc additions.
