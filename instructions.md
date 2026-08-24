# RazorGrowth — Project Instructions

## 1. Project Goal

RazorGrowth is a Razorpay Buildathon 2026 project for the **AI Growth & Agentic Commerce** track.

The goal is to build an AI-powered merchant growth system that:

1. Analyzes merchant transaction/product data.
2. Identifies revenue opportunities.
3. Explains why an opportunity exists.
4. Identifies eligible customers.
5. Estimates potential revenue.
6. Requires merchant approval before financial actions.
7. Executes approved actions through Razorpay test-mode APIs.
8. Handles failures gracefully.
9. Records an auditable trail of important actions.

The project must demonstrate real engineering depth, not just an LLM chatbot.

---

# 2. Core Product Concept

### RazorGrowth

A merchant growth agent that discovers opportunities such as:

> "Customers who purchased Product A have a strong historical tendency to purchase Product B, but X eligible customers have not purchased Product B."

The system should turn this insight into a controlled merchant action.

High-level flow:

Merchant Data
    ↓
Analytics Engine
    ↓
Revenue Opportunity
    ↓
AI Explanation / Recommendation
    ↓
Policy & Guardrails
    ↓
Merchant Approval
    ↓
Razorpay Test-Mode Action
    ↓
Webhook / Result
    ↓
Audit Trail

---

# 3. Current Technology Stack

- Next.js
- React
- TypeScript
- PostgreSQL
- Supabase
- Prisma 7
- Razorpay Test Mode
- AI/LLM agent integration
- Tailwind CSS
- shadcn/ui

Use the existing stack.

Do not introduce another database or ORM unless explicitly requested.

---

# 4. Database Rules

Prisma is the source of truth for database models.

Do NOT create duplicate handwritten database types when Prisma-generated types can be used.

Do NOT modify the Prisma schema casually.

Before changing the schema:

1. Determine whether the existing schema already supports the requirement.
2. Prefer extending existing models over creating redundant models.
3. Explain why a schema change is necessary.

Use Prisma for database access.

Use parameterized/database-safe queries.

---

# 5. Existing Analytics Engine

The cross-sell analytics engine already exists at:

`lib/analytics/cross-sell.ts`

It currently:

- Retrieves paid orders.
- Builds product → customer relationships.
- Builds product-pair → customer relationships.
- Calculates directional cross-sell rates.
- Identifies eligible customers.
- Calculates estimated revenue opportunities.
- Resolves product names/prices.
- Sorts opportunities by expected revenue.

Current opportunity concept:

```ts
{
  sourceProductId,
  targetProductId,
  sourceCustomers,
  customersTogether,
  eligibleCustomerCount,
  eligibleCustomerIds,
  crossSellRate,
  expectedRevenue
}

Do not redesign this engine unless explicitly requested.

Do not hardcode product relationships.

The analytics must be derived from transaction data.

6. Revenue Estimation

Current MVP formula:

expectedRevenue =
eligibleCustomerCount
× targetProductPrice
× crossSellRate

This is an ESTIMATE, not guaranteed revenue.

UI copy should use terms such as:

Estimated opportunity
Estimated revenue
Potential revenue

Never represent estimated revenue as actual revenue.

7. AI Architecture

The AI should NOT independently invent financial calculations.

The AI should use deterministic backend tools.

Preferred architecture:

LLM
 ↓
Tool selection
 ↓
Validated backend function
 ↓
Deterministic result
 ↓
LLM explanation

Examples of future tools:

analyze_sales()
find_cross_sell_opportunities()
get_eligible_customers()
estimate_revenue()
create_campaign()
request_approval()
create_payment_action()

The backend remains authoritative for:

customer eligibility
prices
revenue calculations
limits
permissions
payment actions
payment status
8. Financial Safety

This is a critical requirement.

No LLM should directly perform an unrestricted financial action.

Financial actions must follow:

AI recommendation
      ↓
Validation
      ↓
Policy / Guardrails
      ↓
Merchant approval
      ↓
Razorpay action

Every money-related action must be:

Explainable
Bounded
Gated
Auditable

Never allow the model to bypass approval or policy checks.

9. Guardrails

The system should eventually support rules such as:

Merchant approval required.
Maximum discount.
Maximum campaign amount.
Eligible customer requirement.
Minimum confidence / sample size.
Valid target product.
Valid price.
No duplicate action for the same customer/opportunity.
No execution if the opportunity is stale.

Guardrails must be implemented server-side.

Do not rely on prompts alone for financial safety.

10. Razorpay Integration

Razorpay API capabilities MUST be verified using official Razorpay documentation.

Never invent:

endpoints
request fields
response fields
webhook events
authentication mechanisms
payment behavior

Before implementing a Razorpay integration, verify the current official documentation.

Use Razorpay TEST MODE for the buildathon.

The final demo must show a genuine Razorpay test-mode workflow where possible.

11. Webhooks

Payment state must not be trusted solely from the frontend.

The backend should process Razorpay webhook events.

Webhook handling should include:

signature verification
event validation
idempotency
database state update
audit event

Never mark a payment as successful merely because the frontend says it succeeded.

12. Audit Trail

Important actions should produce audit events.

Examples:

Opportunity detected
AI recommendation generated
Policy evaluated
Merchant approval requested
Merchant approved
Payment action created
Razorpay API called
Razorpay response received
Webhook received
Payment succeeded
Payment failed
Retry attempted
Action cancelled

Audit records should contain enough information to answer:

What happened?
Why did it happen?
Who/what initiated it?
What action was taken?
What was the result?

Do not store secrets in audit logs.

13. Failure Handling

The project MUST demonstrate at least one graceful failure.

Possible example:

Razorpay action
      ↓
API failure
      ↓
Action marked failed
      ↓
Retry / recovery path
      ↓
Merchant informed
      ↓
Audit event recorded

Never silently swallow payment/API failures.

Errors should be:

logged appropriately
represented in application state
visible to the merchant when relevant
recoverable where appropriate
14. Agent Boundaries

The AI agent may:

analyze opportunities
explain trends
recommend actions
select tools
prepare an action for approval

The AI agent must NOT:

bypass authorization
bypass merchant approval
modify financial records directly
invent payment results
determine payment success without verified backend state
fabricate Razorpay API capabilities
fabricate business metrics
15. Development Workflow

We have a limited buildathon deadline.

Prioritize:

Razorpay integration
Guardrails
Approval workflow
Webhooks
Audit trail
AI agent
Core dashboard
UX polish

Do not spend excessive time perfecting secondary analytics while critical Razorpay functionality is incomplete.

16. AI Coding Agent Rules

When modifying the project:

Before coding
Inspect existing files.
Understand existing architecture.
Reuse existing utilities/components.
Do not recreate existing functionality.
While coding
Make the smallest reasonable change.
Do not rewrite unrelated files.
Do not introduce unnecessary dependencies.
Do not change architecture without justification.
Do not silently modify database models.
After coding

Run appropriate validation:

npm run typecheck
npm run lint

Run relevant tests/scripts.

Report:

files changed
what changed
validation performed
failures encountered
17. Antigravity / Claude Code Division of Work

AI coding agents can handle:

repetitive UI code
boilerplate
seed data
CRUD scaffolding
repetitive TypeScript
component generation
test scaffolding
formatting

Important engineering decisions should be reviewed manually.

The developer should understand:

database schema
analytics logic
API architecture
Razorpay integration
guardrails
approval flow
webhooks
idempotency
agent tool architecture
failure handling

Do not generate large amounts of unexplained code merely to finish faster.

18. No Hallucination Rule

If a requirement, API capability, schema field, or external behavior is unknown:

DO NOT GUESS.

Instead:

Inspect the repository.
Check official documentation.
State the uncertainty.
Ask for clarification if necessary.

Especially applies to Razorpay APIs.

19. Current Milestones

Completed:

 Next.js application
 Supabase PostgreSQL
 Prisma 7 setup
 Prisma generated client
 Seed data
 Cross-sell analytics
 Eligible customer calculation
 Estimated revenue calculation

Next:

 Verify Razorpay test-mode payment flow
 Razorpay integration
 Guardrail/policy engine
 Merchant approval workflow
 Payment execution
 Webhook handling
 Idempotency
 Audit trail
 Failure handling
 AI agent/tool calling
 Merchant dashboard
 End-to-end demo
 Deployment
 README
 Demo video
 Final submission
20. Definition of Done

A feature is not considered complete merely because it compiles.

For important features, verify:

Implementation
    ↓
Typecheck
    ↓
Runtime test
    ↓
Error case
    ↓
Integration behavior

The final RazorGrowth demo should show a complete journey:

Merchant
   ↓
Revenue opportunity discovered
   ↓
AI explains opportunity
   ↓
Merchant reviews recommendation
   ↓
Guardrails validate action
   ↓
Merchant approves
   ↓
Razorpay test-mode action executes
   ↓
Webhook confirms result
   ↓
Audit trail records everything

The project should feel like a small but credible merchant-growth product, not a chatbot attached to a dashboard.


## One addition I'd make

Put a small pointer in `AGENTS.md` too:

```md
# Project Instructions

Read `instructions.md` before making changes to this project.

The instructions in `instructions.md` define the project's architecture, safety bounda