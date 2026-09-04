# RazorGrowth — AI Growth & Agentic Commerce Engine

RazorGrowth is an intelligent merchant growth and agentic commerce platform built for the **AI Growth & Agentic Commerce** track. It discovers hidden revenue opportunities from merchant transaction graphs, formulates high-impact growth actions, safeguards financial execution through strict merchant approval workflows, and exposes a hardened, machine-readable catalog surface for external AI buyers.

---

## 1. System Architecture & Boundaries

The platform strictly separates authenticated private merchant operations from public AI buyer discovery:

```
                    MERCHANT DASHBOARD
                         |
                    authenticated
                         |
                         v
                  PRIVATE APIs
                         |
                  Merchant Data
                         |
          +--------------+--------------+
          |                             |
          v                             v
   PUBLIC AI CATALOG              INTERNAL AI TOOLS
      read-only                  merchant-scoped
          |                             |
          v                             v
   EXTERNAL AI BUYER          Growth Intelligence
          |                    Growth Planner
          v
 PRODUCT DISCOVERY
          |
          v
 BOUNDED PURCHASE INTENT
          |
          v
 EXISTING PAYMENT SAFETY
```

### End-to-End Agentic Commerce Journey

```
Merchant's Existing Store
        |
        v
RazorGrowth
        |
        v
Public Machine-Readable Catalog
        |
        v
External AI Buyer Discovery
        |
        v
Bounded Purchase Intent
        |
        v
Existing Payment Safety Boundary
```

---

## 2. Safe Public AI Buyer Catalog Surface

External autonomous AI agents and shopping buyers require machine-readable product discovery without holding merchant dashboard sessions. RazorGrowth provides a safe, unauthenticated, read-only public catalog endpoint:

### Route
```http
GET /api/ai/catalog/public
```

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | string | Optional* | Merchant store URL-safe slug (e.g. `phase5-store-alpha`) |
| `merchantId` | string | Optional* | Merchant cuid identifier |
| `merchant` | string | Optional* | Unified merchant identifier (resolves by slug or ID) |
| `includeJsonLd` | boolean | Optional | Include Schema.org `Product` JSON-LD (default: `true`) |

*\* At least one merchant identifier (`slug`, `merchantId`, or `merchant`) must be provided.*

### Strict Allowlist Public Response
The public catalog response returns only safe, authoritative discovery data:

```json
{
  "success": true,
  "merchant": {
    "name": "Phase5 Store Alpha",
    "currency": "INR",
    "slug": "phase5-store-alpha"
  },
  "totalProducts": 3,
  "products": [
    {
      "id": "cuid_product_1",
      "name": "Ultra Laptop Sleeve 15",
      "description": "Padded protective sleeve designed for 15 inch laptops",
      "category": "Accessories",
      "price": 1500,
      "currency": "INR",
      "active": true,
      "jsonLd": {
        "@context": "https://schema.org/",
        "@type": "Product",
        "identifier": "cuid_product_1",
        "name": "Ultra Laptop Sleeve 15",
        "description": "Padded protective sleeve designed for 15 inch laptops",
        "category": "Accessories",
        "offers": {
          "@type": "Offer",
          "price": 1500,
          "priceCurrency": "INR"
        }
      }
    }
  ]
}
```

---

## 3. Data Protection & Sensitive Boundaries

The public catalog surface is strictly allowlisted at the database query boundary (`Prisma.product.findMany` with explicit field selection).

### Guaranteed Exclusions
Public catalog access **NEVER** grants access to or exposes:
- **Customer Data**: No `Customer`, `customerId`, customer email, customer name, or customer PII.
- **Order Data**: No `Order`, `OrderItem`, historical order details, or totals.
- **Growth Actions & Opportunities**: No `GrowthAction`, `Opportunity`, revenue projections, or attach rates.
- **Audit Trails**: Zero `AuditEvent` records or event logs.
- **Credentials & Authentication**: No `RazorpayConnection`, `keyId`, `encryptedKeySecret`, webhook secrets, `passwordHash`, sessions, or API tokens.
- **Operational Metadata**: No internal AI readiness scores, operational formulas, or dashboard metrics.
- **Internal Merchant IDs**: Raw database `Merchant.id` and private merchant emails are never leaked in the merchant summary.
- **Inactive Inventory**: Inactive products (`active: false`) are strictly filtered out at the query level.

---

## 4. Grounded Machine Readability (Schema.org JSON-LD)

To guarantee machine readability across diverse AI buyer agents:
- Product JSON-LD is generated using a shared, canonical builder without logic drift.
- **No Hallucinated Schema Properties**: Properties are mapped 1:1 from authoritative PostgreSQL records (`Product.name`, `Product.description`, `Product.price`, `Merchant.currency`).
- **No Fabricated Availability / Inventory**: Availability is not synthesized or inferred from boolean `active`. Synthetic properties like `aggregateRating`, `review`, `inventory`, `shippingDetails`, or fake discounts are strictly excluded unless supported authoritatively by the database.

---

## 5. Authoritative Pricing & Payment Safety Boundary

RazorGrowth enforces a strict conceptual and financial separation:
```
DISCOVERY != PURCHASE INTENT != PAYMENT
```

1. **Authoritative Price**:
   - Product pricing displayed in public catalogs and referenced in purchase intents strictly originates from PostgreSQL `Product.price`.
   - LLMs or AI agents never become the source of financial truth.

2. **Bounded Purchase Intent**:
   - Creating a purchase intent (`POST /api/ai/purchase-intent`) produces a bounded, unconfirmed intent record (`READY_FOR_CONFIRMATION`).
   - It **never** charges a customer, deducts funds, creates payments, or invokes Razorpay payment link APIs automatically.

3. **Human / Buyer Confirmation**:
   - Financial execution strictly requires explicit buyer confirmation through Razorpay native payment links and test-mode checkout.
   - All state transitions remain auditable, idempotent, and protected by webhook cryptographic signatures.

---

## 6. Discoverability Notice

A public machine-readable catalog makes merchant products discoverable and structured for external AI buyer crawlers and agents. It provides standardized machine-readability; it does not constitute a guarantee that third-party AI platforms will surface or rank specific products.

---

## 7. Verification & Testing

```bash
# Run type checking
npm run typecheck

# Run Next.js production build
npm run build

# Run Node.js test suites
npx tsx --test "test/*.test.ts"
```
