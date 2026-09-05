# RazorGrowth

RazorGrowth is an AI-powered merchant growth system that turns historical transaction data into evidence-backed growth opportunities and executes approved campaigns through Razorpay Payment Links with cryptographic webhook verification.

---

## The Problem

Every growing merchant faces the same fundamental challenge:
- **Buried Revenue**: Merchants already have hundreds or thousands of paying customers and transaction records, but valuable cross-sell, upsell, and reactivation opportunities remain buried in raw database tables.
- **Manual Analysis Paralysis**: Manually identifying product affinity correlations, calculating attach rates, and filtering eligible customer cohorts requires dedicated data science resources most merchants lack.
- **Disconnected Execution**: Even when an opportunity is spotted, turning insights into actual revenue requires cumbersome manual outreach, disconnected spreadsheets, and error-prone payment link generation.
- **Autonomous Financial Risk**: Unbounded AI agents that autonomously charge cards or execute financial transactions create severe liability and trust risks for merchants.

RazorGrowth solves this by creating a **closed, bounded revenue loop** that connects deterministic revenue intelligence with safe, human-approved Razorpay payment execution.

---

## What RazorGrowth Does

RazorGrowth sits directly on top of a merchant's existing commerce and payment infrastructure. It is **NOT** a storefront replacement, CRM, or generic analytics dashboard. Instead, it answers one merchant question:

> *"Where can I make more money from the customers and products I already have?"*

```mermaid
flowchart LR
    Rev[1. Transaction Data] --> Intel[2. Growth Intelligence]
    Intel --> Opp[3. Opportunity & Evidence]
    Opp --> Aud[4. Eligible Customers]
    Aud --> Plan[5. AI Growth Planner]
    Plan --> Gate{6. Merchant Approval Gate}
    Gate -->|Explicit Approval| Link[7. Razorpay Payment Link]
    Link --> Pay[8. Customer Payment]
    Pay --> Hook[9. Verified Webhook]
    Hook --> Exec[10. Realized Revenue & Audit]
```

1. **Transaction Data**: Ingests historical orders, products, and customer purchase histories.
2. **Growth Intelligence**: Calculates deterministic cross-sell affinities, empirical attach rates, and co-purchase counts.
3. **Opportunity & Evidence**: Surfaces ranked growth opportunities backed by empirical order evidence.
4. **Eligible Audience**: Filters customer cohorts down to buyers who purchased the source product but have never bought the target product.
5. **AI Growth Planner**: Synthesizes customer segments, formulates campaign strategy, and drafts gated `GrowthAction` records.
6. **Merchant Approval Gate**: Holds all actions in `PENDING_APPROVAL` status until an authorized merchant explicitly approves them.
7. **Razorpay Payment Link**: Calls the Razorpay API using encrypted merchant credentials and authoritative database pricing to generate an authenticated Payment Link.
8. **Customer Payment**: Customers receive links and pay securely via Razorpay's native checkout.
9. **Verified Webhook**: Ingests `payment_link.paid` webhook events with HMAC-SHA256 signature verification and idempotency safeguards.
10. **Realized Revenue & Audit Trail**: Atomically marks the action `EXECUTED`, updates Realized Revenue, and commits an immutable multi-tenant audit trail.

---

## Core Features

- **Transaction-Backed Growth Intelligence**: Deterministic cross-sell, upsell, and reactivation analytics derived directly from historical order graphs.
- **Evidence-Backed Opportunity Analysis**: Every opportunity displays clear empirical evidence: source customer count, co-purchases, attach rates, and expected revenue.
- **Deterministic Customer Eligibility**: Backend-enforced eligibility predicates ensure customers who already own a target product or have active actions are never targeted twice.
- **Agentic Growth Planning**: AI-driven campaign formulation that drafts structured, customer-specific growth actions with personalized pitch contexts.
- **Human Approval Boundary**: Strict state machine prevents autonomous financial execution. Actions cannot advance to payment link generation without explicit merchant approval.
- **Razorpay Payment Link Execution**: Authenticated dispatch to Razorpay API with authoritative database pricing, recipient metadata, and embedded reconciliation notes.
- **Payment Link Notification Delivery**: Native delivery via Razorpay email notification channels with support for safe resends.
- **Cryptographic Webhook Verification**: Production-grade HMAC-SHA256 signature verification for incoming Razorpay webhooks.
- **Webhook Idempotency & Concurrency Safety**: Guaranteed exactly-once execution using PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) and duplicate event detection.
- **Realized Revenue Tracking**: Strict financial accounting separating hypothetical pipeline value from actual captured revenue.
- **Multi-Actor Audit Trail**: Chronological event ledger recording every lifecycle transition with timestamps and explicit actor badges (`AGENT`, `MERCHANT`, `SYSTEM`, `RAZORPAY`).
- **AI Buyer Readiness & Public Catalog**: Public, read-only machine-readable catalog surfacing grounded Schema.org `Product` JSON-LD for autonomous AI shopping agents.
- **Bounded Purchase-Intent**: External AI agents can discover products and express purchase intent (`READY_FOR_CONFIRMATION`), but cannot trigger automatic charges.
- **Multi-Tenant Isolation**: Complete row-level and session-level isolation ensuring merchants can never access, analyze, or execute actions against another tenant's data.
- **Credential Encryption**: AES-256-GCM encryption for stored merchant Razorpay Key Secrets with automatic secret redaction in all logs and error messages.
- **Resilient AI Provider Orchestration**: Seamless dual-provider routing between Google Gemini (`gemini-2.5-flash`) and OpenRouter (`liquid/lfm-2.5-2.6b:free`) with automatic quota fallback.

---

## The AI + Human Control Model

RazorGrowth enforces a strict, architectural **Human-in-the-Loop** boundary. This separation is enforced in the **backend state machine and database transactions**, not merely in the user interface.

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS AI BOUNDARY                   │
│                                                             │
│  [ Transaction Data ] ──> [ Affinity Analytics ]            │
│  [ Target Audience ]  ──> [ Plan Campaign ]                 │
│  [ Create Draft ]     ──> [ Status: PENDING_APPROVAL ]      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ⛔ HARD ARCHITECTURAL GATEWAY ⛔
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    EXPLICIT MERCHANT CONTROL                │
│                                                             │
│  [ Merchant Reviews Draft ] ──> [ Clicks Approve & Send ]   │
│  [ Backend Validates Actor ]──> [ Status: APPROVED ]        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    PAYMENT EXECUTION LAYER                  │
│                                                             │
│  [ Razorpay Payment Link ]  ──> [ Status: EXECUTING ]       │
│  [ Customer Checkout ]      ──> [ Razorpay Webhook ]        │
│  [ Verified Signature ]     ──> [ Status: EXECUTED ]        │
│  [ Increments Realized Revenue ]                            │
└─────────────────────────────────────────────────────────────┘
```

### What AI CAN Do:
- Analyze historical orders and compute statistical attach rates.
- Identify unexploited cross-sell, upsell, and reactivation affinities.
- Filter customer cohorts through backend eligibility rules.
- Recommend campaign strategies and personalized outreach copy.
- Prepare `GrowthAction` records in `PENDING_APPROVAL` status.

### What AI CANNOT Do:
- **AI CANNOT approve GrowthActions**. The `approveGrowthAction` function is strictly excluded from LLM tool definitions.
- **AI CANNOT directly generate Razorpay Payment Links**. Payment links can only be dispatched after an action is in `APPROVED` status.
- **AI CANNOT charge customers or deduct funds**. All payments require the customer to complete Razorpay's hosted checkout.

### Merchant Authority:
- The merchant retains sole authority to review eligible customers, inspect pricing, and approve campaigns.
- Only after explicit approval does RazorGrowth call Razorpay to issue the payment link.
- Only after a cryptographically verified `payment_link.paid` webhook does the action become `EXECUTED` and count toward Realized Revenue.

---

## Revenue Loop: Pipeline Value vs. Realized Revenue

RazorGrowth maintains absolute financial clarity between potential opportunity value and verified merchant earnings:

$$\text{Pipeline Value} = \text{Eligible Audience} \times \text{Authoritative DB Price} \times \text{Historical Attach Rate}$$

$$\text{Realized Revenue} = \sum_{\text{action} \in \text{EXECUTED}} \text{action.parameters.amountInRupees}$$

- **Pipeline Value** represents the estimated commercial upside based strictly on historical co-purchase patterns and authoritative database product prices. It is a planning benchmark, never booked income.
- **Realized Revenue** represents actual money collected from completed customer payments. It **only** increments when a verified Razorpay webhook confirms payment settlement for an approved action. Active links in `EXECUTING` status do not increase Realized Revenue.

---

## Architecture

```mermaid
graph TD
    subgraph Commerce Layer
        Merchant[Merchant Store / Data]
        RZP[Razorpay Platform]
    end

    subgraph RazorGrowth Platform
        subgraph Ingestion & Auth
            Proxy[Next.js Edge Proxy]
            Auth[Session & Tenant Isolation]
            DB[(PostgreSQL + Prisma)]
        end

        subgraph Growth Engine
            Analytics[Deterministic Analytics Engine]
            AIOrch[AI Provider Orchestrator\nGemini + OpenRouter Fallback]
            StateMachine[GrowthAction State Machine\nPENDING_APPROVAL ➔ APPROVED ➔ EXECUTING ➔ EXECUTED]
            AuditLog[Immutable Audit Trail]
        end

        subgraph Agentic Commerce
            AICatalog[AI Buyer Readiness\nSchema.org JSON-LD Catalog]
            PurchaseIntent[Bounded Purchase Intent API]
        end
    end

    Merchant -->|Sync Orders & Products| Proxy
    Proxy --> Auth
    Auth --> DB
    DB --> Analytics
    Analytics --> AIOrch
    AIOrch -->|Prepare Draft| StateMachine
    StateMachine -->|Record Event| AuditLog
    
    Merchant -->|Explicit Approval| StateMachine
    StateMachine -->|Dispatch Link| RZP
    RZP -->|Payment Link| Customer[End Customer]
    Customer -->|Pays Link| RZP
    RZP -->|Webhook: payment_link.paid| Proxy
    Proxy -->|Verify HMAC & Idempotency| StateMachine
    StateMachine -->|Increment Realized Revenue| DB

    ExternalAI[External AI Shopping Agent] -->|Discover Products| AICatalog
    AICatalog --> DB
    ExternalAI -->|Submit Intent| PurchaseIntent
    PurchaseIntent -->|READY_FOR_CONFIRMATION| DB
```

---

## Safety & Financial Controls

| Safety Control | Implementation & Enforcement | Source Reference |
|---|---|---|
| **Authoritative Pricing** | Target product prices are strictly resolved from PostgreSQL `Product.price`. Client overrides, LLM suggestions, or URL parameter prices are discarded. | [`lib/actions/validation.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/actions/validation.ts) |
| **Financial Units** | Razorpay transactions strictly operate in integer paise (`Math.round(price * 100)`). UI and accounting operate in integer rupees. Zero floating-point drift. | [`lib/razorpay/payment-links.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/razorpay/payment-links.ts) |
| **Tenant Isolation** | Every database operation enforces `where: { merchantId }`. Cross-tenant record access is blocked at the ORM query boundary. | All `lib/actions/*.ts` |
| **Encrypted Credentials** | Merchant Razorpay Key Secrets are stored encrypted using AES-256-GCM (`iv:tag:ciphertext`). Secrets are never logged or returned to frontend clients. | [`lib/crypto/encryption.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/crypto/encryption.ts) |
| **Secret Sanitization** | `sanitizeSecrets` automatically redacts known credentials, key secrets, and authorization tokens from error messages and diagnostic traces. | [`lib/razorpay/client.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/razorpay/client.ts) |
| **PostgreSQL Advisory Locks** | Concurrency safety for action creation and approval uses transactional advisory locks (`pg_advisory_xact_lock`), eliminating race conditions. | [`lib/actions/create.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/actions/create.ts) |
| **Double-Spend Prevention** | Customers who have completed and paid for an action are prevented from receiving duplicate active actions or duplicate charges. | [`lib/actions/duplicate-check.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/actions/duplicate-check.ts) |
| **Webhook Cryptography** | Incoming webhooks verify the `X-Razorpay-Signature` header using HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`. | [`app/api/webhooks/razorpay/route.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/app/api/webhooks/razorpay/route.ts) |
| **Webhook Idempotency** | Duplicate webhook deliveries are checked against persisted `PAYMENT_LINK_PAID` audit events, returning HTTP 200 without duplicate state transitions. | [`lib/razorpay/webhooks.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/razorpay/webhooks.ts) |
| **Bounded Purchase Intent** | The external AI Buyer purchase-intent API creates records in `READY_FOR_CONFIRMATION` status; it never triggers charges or creates payment links. | [`lib/buyer/ai-catalog.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/buyer/ai-catalog.ts) |

---

## Demo Walkthrough (5-Minute Evaluation Guide)

Follow this sequence for the optimal live demo:

### 1. Open Dashboard & Revenue Snapshot
- Log in to the merchant dashboard using the Demo Credentials.
- Observe the **Revenue Intelligence Header**: Total Historical Revenue, Pipeline Opportunity Value, and verified Realized Revenue.

### 2. Inspect Recommended Opportunity: `Mechanical Keyboard → 4K Monitor`
- Scroll to the Opportunity Section and select **`Mechanical Keyboard → 4K Monitor`**.
- **Why this opportunity**: Target product price is **₹18,000**, well within Razorpay Test Mode's ₹50,000 transaction threshold.
- Point to the empirical evidence: **38.5% Attach Rate**, **89 historical co-purchases**, and **122 eligible customers** who purchased the keyboard but not the monitor.

### 3. Review Eligible Customer Audience
- Click **"Target Buyers"** or open the customer drawer.
- Notice how customer eligibility is pre-filtered by backend order validation.

### 4. Prepare Growth Action (AI Planning)
- Click **"Prepare Action"** for an eligible customer.
- Observe that the action is created in **`PENDING_APPROVAL`** status.
- *Point out to judges: Zero payment links have been created. Zero customer outreach has occurred. The AI has only prepared a draft.*

### 5. Explicit Merchant Approval & Link Dispatch
- Open the action detail modal.
- Click **"Approve & Send Payment Link"**.
- Watch the action transition from `PENDING_APPROVAL` $\to$ `APPROVED` $\to$ `EXECUTING`.
- A real Razorpay Payment Link (`plink_...`, `https://rzp.io/...`) is created with the authoritative price of ₹18,000.
- *Point out: Realized Revenue remains unchanged while the link is merely active.*

### 6. Simulate Payment & Webhook Settlement
- Use the in-app **"Simulate Payment"** trigger (or send a `payment_link.paid` webhook payload).
- Observe the live update:
  - Action status advances to **`EXECUTED`**.
  - **Realized Revenue increases by exactly +₹18,000**.
  - Open the **Audit Trail** to show the complete cryptographic proof: `AGENT` (Created) $\to$ `MERCHANT` (Approved) $\to$ `SYSTEM` (Link Generated) $\to$ `RAZORPAY` (Paid).

### 7. AI Buyer Readiness & Public Catalog Surface
- Navigate to the **AI Buyer Readiness** section.
- View the readiness score and inspect the live public catalog endpoint:  
  `GET /api/ai/catalog/public?slug=technova-store`
- Demonstrate that external AI agents can crawl Schema.org JSON-LD without receiving sensitive merchant or customer data.

---

## Demo Credentials

> [!NOTE]
> The repository includes pre-configured, isolated test data for buildathon evaluation.

- **URL**: `http://localhost:3000/login`
- **Merchant Email**: `merchant@technova.demo`
- **Merchant Password**: `Demo1234!`
- **Store Name**: TechNova Store
- **Default Currency**: INR (₹)

*(Multi-tenant isolation counter-merchant: `merchant@technova.dem` / Acme Electronics)*

---

## AI Buyer Readiness & Agentic Commerce

RazorGrowth enables merchants to participate in the emerging agentic commerce economy where autonomous AI shopping agents discover and buy products on behalf of consumers.

### Public Read-Only Discovery Endpoint
```http
GET /api/ai/catalog/public?slug={merchantSlug}
GET /api/ai/catalog/public?merchantId={merchantId}
```

### Strict Allowlist Protection
The public catalog query strictly allowlists product attributes and **never** exposes:
- Customer records, emails, or PII.
- Historical orders, order items, or customer spending.
- Merchant credentials, Razorpay secrets, or session tokens.
- Internal AI readiness scores, revenue targets, or attach rates.
- Inactive products (`active: false` items are filtered at query level).

### Schema.org JSON-LD Standardization
Every product entry includes grounded Schema.org `Product` JSON-LD with authoritative names, descriptions, categories, and prices. No fake availability or synthetic review scores are hallucinated.

### Bounded Purchase Intent
External agents can submit purchase intents via `POST /api/ai/purchase-intent`. The backend validates product availability and creates a record in `READY_FOR_CONFIRMATION` status. It **never charges cards or initiates payment without buyer confirmation**.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React Server Components)
- **Frontend**: [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Base UI](https://base-ui.com/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/), [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Payment Infrastructure**: [Razorpay APIs](https://razorpay.com/docs/) (Payment Links, Webhooks, Customers, Orders)
- **AI & Agent Orchestration**: [Vercel AI SDK](https://sdk.vercel.ai/), [Google Gemini Flash 2.5](https://ai.google.dev/), [OpenRouter API](https://openrouter.ai/)
- **Validation**: [Zod](https://zod.dev/) (Runtime schema enforcement for external APIs and domain inputs)
- **Security & Cryptography**: Native Node.js `crypto` (AES-256-GCM credential encryption, HMAC-SHA256 signature verification)

---

## Project Structure

```
razorgrowth/
├── app/                                # Next.js App Router
│   ├── page.tsx                        # Dashboard composition shell
│   ├── login/ & signup/                # Merchant authentication pages
│   └── api/                            # Backend REST endpoints
│       ├── growth/analyze/             # Deterministic opportunity analysis
│       ├── growth/plan/                # AI agentic campaign planning
│       ├── growth-actions/             # GrowthAction lifecycle management
│       │   ├── [id]/approve/           # Explicit merchant approval gate
│       │   ├── [id]/execute/           # Razorpay Payment Link execution
│       │   ├── [id]/resend/            # Native link notification resend
│       │   └── [id]/simulate-payment/  # Demo payment link simulation
│       ├── webhooks/razorpay/          # Cryptographic webhook handler
│       ├── ai/catalog/public/          # Read-only Schema.org AI buyer catalog
│       ├── ai/purchase-intent/         # Bounded AI agent purchase intent
│       └── razorpay/connect/ & sync/   # Merchant credentials & data sync
├── components/dashboard/               # Modular dashboard UI
│   ├── shell/                          # Dashboard navigation & layout
│   ├── sections/                       # Opportunity hero, metrics, catalog
│   ├── drawers/                        # Target buyers & campaign planner
│   └── modals/                         # Action detail & execution modals
├── lib/                                # Core Domain & Infrastructure Modules
│   ├── actions/                        # GrowthAction domain engine
│   │   ├── state-machine.ts            # PENDING_APPROVAL -> APPROVED -> EXECUTING -> EXECUTED
│   │   ├── create.ts                   # Gated creation with PostgreSQL advisory locks
│   │   ├── approve.ts                  # Merchant approval transition
│   │   ├── execute.ts                  # Razorpay link creation orchestration
│   │   ├── eligibility.ts              # Historical customer order eligibility checks
│   │   └── duplicate-check.ts          # In-flight & completed action deduplication
│   ├── analytics/                      # Deterministic transaction analytics
│   │   └── cross-sell.ts               # Product pair co-purchase & attach rate math
│   ├── agent/                          # AI agent & LLM orchestrator
│   │   ├── orchestrator.ts             # Primary / fallback execution flow
│   │   ├── providers.ts                # Gemini and OpenRouter provider configs
│   │   └── tools.ts                    # LLM tools (strictly excludes financial execution)
│   ├── razorpay/                       # Razorpay integration client
│   │   ├── client.ts                   # HTTP client with secret redaction
│   │   ├── payment-links.ts            # Payment link creation & demo quota fallback
│   │   ├── webhooks.ts                 # HMAC verification & idempotent processing
│   │   └── schemas.ts                  # Zod validation schemas for Razorpay payloads
│   ├── buyer/                          # Agentic commerce & buyer catalog
│   │   └── ai-catalog.ts               # Schema.org JSON-LD generation & readiness scoring
│   ├── crypto/                         # AES-256-GCM credential encryption
│   └── prisma.ts                       # Shared Prisma database client
├── prisma/                             # Database schema & migrations
│   ├── schema.prisma                   # PostgreSQL relational data model
│   └── seed.ts                         # Deterministic merchant, product & order seed
└── test/                               # Comprehensive Automated Test Suites
    ├── phase2b.test.ts                 # Payment link delivery & revenue loop
    ├── phase3.test.ts                  # Deterministic analytics & opportunity discovery
    ├── phase4.test.ts                  # Agentic growth planner & approval boundary
    ├── phase5.test.ts                  # AI buyer readiness & public catalog
    ├── phase5-1.test.ts                # Public catalog identity & input hardening
    ├── webhook-payment-integrity.test.ts # Webhook signature & idempotency
    ├── growth-action-concurrency.test.ts # Advisory lock state transition races
    ├── growth-action-creation-race.test.ts # Duplicate creation race protection
    ├── growth-action-parameters-validation.test.ts # Zod parameter schemas
    ├── razorpay-client-validation.test.ts # Error normalization & secret redaction
    └── ai-provider-orchestrator.test.ts  # Dual-provider LLM fallback
```

---

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- PostgreSQL database (or Supabase / Neon connection)
- npm or pnpm

### 1. Clone & Install
```bash
git clone https://github.com/Arman6117/razorgrowth.git
cd razorgrowth
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:

```env
# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"

# Razorpay Test Credentials
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# Security & Encryption (32-byte key for AES-256-GCM credential storage)
RAZORPAY_CREDENTIAL_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
AUTH_SECRET="your-session-auth-secret"

# AI Provider Configuration (Google Gemini + OpenRouter Fallback)
GEMINI_API_KEY="AIzaSy..."
OPENROUTER_API_KEY="sk-or-v1-..."
AGENT_PROVIDER="google"
AGENT_MODEL="gemini-2.5-flash"
AGENT_FALLBACK_PROVIDER="openrouter"
AGENT_FALLBACK_MODEL="liquid/lfm-2.5-2.6b:free"
```

### 3. Initialize Database & Seed
```bash
# Push schema to database
npx prisma db push

# Seed deterministic demo data (TechNova Store, 48 products, 500 customers, 900 orders)
npx tsx prisma/seed.ts
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign in using the Demo Credentials.

---

## Testing & Verification

RazorGrowth is backed by **11 comprehensive automated test suites** covering every critical architectural boundary:

```bash
# Run type check (0 errors)
npm run typecheck

# Run production build
npm run build

# Run all 11 automated test suites (131 total tests)
npx tsx --test "test/*.test.ts"
```

### Verified Test Areas:
- **Tenant Isolation**: Guarantees Merchant A cannot view, analyze, or execute actions against Merchant B's data (`phase3.test.ts`, `phase4.test.ts`, `phase5.test.ts`).
- **GrowthAction Lifecycle**: Strict state machine assertions (`PENDING_APPROVAL` $\to$ `APPROVED` $\to$ `EXECUTING` $\to$ `EXECUTED`) (`growth-action-concurrency.test.ts`).
- **Concurrency & Races**: PostgreSQL advisory locks verified under simultaneous parallel creation and approval requests (`growth-action-creation-race.test.ts`).
- **Webhook Integrity & Idempotency**: Cryptographic HMAC verification, price matching, and exactly-once duplicate delivery protection (`webhook-payment-integrity.test.ts`).
- **Secret Redaction**: Verification that API keys and key secrets never leak in error messages or logs (`razorpay-client-validation.test.ts`).
- **AI Dual-Provider Fallback**: Automatic failover from Gemini to OpenRouter upon rate limits or upstream errors (`ai-provider-orchestrator.test.ts`).
- **AI Buyer Catalog Safety**: Read-only public catalog verified to exclude PII, orders, and credentials (`phase5-1.test.ts`).

---

## Buildathon Track: AI Growth & Agentic Commerce

RazorGrowth specifically targets the **AI Growth & Agentic Commerce** track of the Razorpay Buildathon:

1. **AI Growth**: Transforms passive transaction graphs into proactive, evidence-grounded revenue opportunities without merchant guesswork.
2. **Bounded Financial Agency**: Solves the central trust barrier of autonomous commerce by maintaining a strict, backend-enforced human approval boundary.
3. **Native Razorpay Execution**: Direct integration with Razorpay Payment Links and webhooks completes the loop from intelligence to settled revenue.
4. **Agentic Commerce Readiness**: Prepares merchants for machine-to-machine commerce with standardized Schema.org JSON-LD catalogs and safe purchase-intent handling.

---

## Demo Video

[Add 5-minute demo video link here]

---

## Repository Evaluation Guide for Judges

| Component | Code Location | Key Things to Look For |
|---|---|---|
| **Deterministic Analytics** | [`lib/analytics/cross-sell.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/analytics/cross-sell.ts) | Pure mathematical calculation of attach rates, support, and co-purchases from order items. |
| **Approval Boundary** | [`lib/actions/state-machine.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/actions/state-machine.ts) | Centralized state transition assertions preventing unauthorized execution. |
| **Concurrency & Locks** | [`lib/actions/create.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/actions/create.ts) | Transaction-level `pg_advisory_xact_lock` guaranteeing duplicate-free action creation. |
| **Payment Link Execution** | [`lib/razorpay/payment-links.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/razorpay/payment-links.ts) | Authoritative database pricing retrieval and Razorpay API dispatch. |
| **Webhook Processing** | [`lib/razorpay/webhooks.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/razorpay/webhooks.ts) | Cryptographic signature verification, amount matching, and duplicate idempotency. |
| **AI Orchestration** | [`lib/agent/orchestrator.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/agent/orchestrator.ts) | Automatic primary/fallback provider switching between Gemini and OpenRouter. |
| **AI Buyer Catalog** | [`lib/buyer/ai-catalog.ts`](file:///D:/FullStack%20Webdev/Assignments/razorgrowth/lib/buyer/ai-catalog.ts) | Schema.org JSON-LD generation with strict allowlist query boundaries. |
