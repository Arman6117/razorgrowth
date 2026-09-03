/**
 * RazorGrowth - GrowthAction Public API & Compatibility Facade
 *
 * This module acts as the authoritative public entry point for all GrowthAction
 * domain capabilities, providing 100% backward-compatible re-exports from
 * focused, single-responsibility submodules:
 *
 * - types.ts: Domain interfaces, Zod parameter schemas, and type definitions
 * - errors.ts: Typed domain errors preserving backward-compatible error strings
 * - state-machine.ts: Centralized lifecycle rules, assertions, and status predicates
 * - eligibility.ts: Customer cross-sell eligibility checks
 * - duplicate-check.ts: Duplicate in-flight & completed action verification
 * - validation.ts: Shared merchant, opportunity, product & pricing guardrails
 * - create.ts: Single & bulk GrowthAction creation
 * - approve.ts: Single & bulk GrowthAction approval
 * - execute.ts: Execution, retry, and Razorpay payment link orchestration
 * - reject.ts: Merchant rejection of growth actions
 * - resend.ts: Razorpay payment link notification resend
 * - queries.ts: GrowthAction lookup and list queries
 */

// Types, Interfaces & Zod Schemas
export * from "./types";

// Domain Errors
export * from "./errors";

// State Machine Predicates & Assertions
export * from "./state-machine";

// Eligibility Verification
export * from "./eligibility";

// Duplicate Checking
export * from "./duplicate-check";

// Shared Domain Validation
export * from "./validation";

// Creation (Single & Bulk)
export * from "./create";

// Approval (Single & Bulk)
export * from "./approve";

// Execution & Retry Orchestration
export * from "./execute";

// Rejection
export * from "./reject";

// Payment Link Resend
export * from "./resend";

// Queries
export * from "./queries";
