import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { AuditActor, GrowthActionStatus } from "@/lib/generated/prisma/enums";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface AIBuyerProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  jsonLd?: Record<string, unknown>;
}

export interface AIBuyerCatalogResponse {
  merchant: {
    id: string;
    name: string;
    currency: string;
  };
  catalogSummary: {
    totalProducts: number;
    activeProducts: number;
    readinessScore: number;
  };
  products: AIBuyerProduct[];
}

export class PublicCatalogError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PublicCatalogError";
    this.statusCode = statusCode;
  }
}

export interface AIPublicProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  active: true;
  jsonLd?: Record<string, unknown>;
}

export interface AIPublicCatalogResponse {
  success: true;
  merchant: {
    name: string;
    currency: string;
    slug: string;
  };
  totalProducts: number;
  products: AIPublicProduct[];
}

export interface PublicMerchantInfo {
  id: string;
  name: string;
  currency: string;
  slug: string;
}


export interface AIBuyerReadinessReport {
  merchantId: string;
  readinessScore: number; // 0 - 100
  totalProducts: number;
  activeProducts: number;
  productsWithDescription: number;
  productsWithCategory: number;
  productsWithValidPrice: number;
  completeProducts: number;
  needsAttentionCount: number;
  formula: string;
  checklist: {
    productNames: { complete: boolean; count: number; total: number; percentage: number };
    prices: { complete: boolean; count: number; total: number; percentage: number };
    categories: { complete: boolean; count: number; total: number; percentage: number };
    descriptions: { complete: boolean; count: number; total: number; percentage: number };
    activeInventory: { complete: boolean; count: number; total: number; percentage: number };
  };
  missingMetadataWarnings: string[];
  evaluatedAt: string;
}

export interface ProductDiscoveryMatch {
  productId: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  active: boolean;
  matchScore: number; // 0 - 1
  matchReason: string;
  whyItMatches: string[];
}

export interface ProductDiscoveryResponse {
  success: boolean;
  query: string;
  budget?: number;
  category?: string;
  matchedCount: number;
  totalCatalogCount: number;
  matches: ProductDiscoveryMatch[];
  summary: string;
  searchedAt: string;
}

export interface PurchaseIntentResponse {
  success: boolean;
  intentId: string;
  merchantId: string;
  productId: string;
  productName: string;
  description: string | null;
  category: string | null;
  authoritativePrice: number;
  amountInPaise: number;
  currency: string;
  status: "READY_FOR_CONFIRMATION";
  requiresConfirmation: true;
  paymentNotice: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AI PROVIDER CONFIGURATION (Reuse existing AI SDK setup)
// ---------------------------------------------------------------------------

function getPrimaryModelConfig() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    providerName: "google",
    model: google("gemini-2.5-flash"),
  };
}

function getFallbackModelConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const oai = createOpenAI({ apiKey });
  return {
    providerName: "openai",
    model: oai("gpt-4o-mini"),
  };
}

// ---------------------------------------------------------------------------
// 1. GET AI BUYER CATALOG
// ---------------------------------------------------------------------------

/**
 * Returns a structured, machine-readable catalog of merchant products.
 * Guarantees zero sensitive data (no passwords, sessions, keys, or customer PII).
 */
export async function getAIBuyerCatalog(
  merchantId: string,
  options?: {
    onlyActive?: boolean;
    includeJsonLd?: boolean;
    recordAudit?: boolean;
  }
): Promise<AIBuyerCatalogResponse> {
  if (!merchantId?.trim()) {
    throw new Error("merchantId parameter is required");
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });

  if (!merchant) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  const currency = merchant.currency || "INR";
  const whereClause: { merchantId: string; active?: boolean } = { merchantId };
  if (options?.onlyActive) {
    whereClause.active = true;
  }

  // Single-query fetch
  const products = await prisma.product.findMany({
    where: whereClause,
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      price: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const structuredProducts: AIBuyerProduct[] = products.map((p) => {
    const priceNum = Number(p.price);
    const item: AIBuyerProduct = {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      category: p.category ?? null,
      price: priceNum,
      currency,
      active: p.active,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };

    if (options?.includeJsonLd) {
      item.jsonLd = buildProductJsonLd(
        {
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: priceNum,
          active: p.active,
        },
        currency,
        { includeAvailability: true }
      );
    }

    return item;
  });

  const readiness = calculateReadinessScore(structuredProducts);

  if (options?.recordAudit) {
    try {
      await prisma.auditEvent.create({
        data: {
          merchantId,
          eventType: "AI_BUYER_CATALOG_VIEWED",
          actor: AuditActor.AGENT,
          metadata: {
            totalProducts: structuredProducts.length,
            activeProducts: structuredProducts.filter((p) => p.active).length,
            readinessScore: readiness.readinessScore,
            viewedAt: new Date().toISOString(),
          },
        },
      });
    } catch {
      // Non-blocking audit write
    }
  }

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      currency,
    },
    catalogSummary: {
      totalProducts: structuredProducts.length,
      activeProducts: structuredProducts.filter((p) => p.active).length,
      readinessScore: readiness.readinessScore,
    },
    products: structuredProducts,
  };
}

// ---------------------------------------------------------------------------
// 1B. CANONICAL JSON-LD & SAFE PUBLIC CATALOG
// ---------------------------------------------------------------------------

/**
 * Canonical JSON-LD builder for machine-readable products.
 * Strictly maps from authoritative database values without fabricating
 * synthetic inventory, fake availability, or hallucinated reviews/ratings.
 */
export function buildProductJsonLd(
  product: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    price: number;
    active?: boolean;
  },
  currency: string,
  options?: {
    includeAvailability?: boolean;
  }
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    identifier: product.id,
    name: product.name,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: currency,
    },
  };

  if (product.description) {
    jsonLd.description = product.description;
  }
  if (product.category) {
    jsonLd.category = product.category;
  }

  // Only include availability when explicitly requested by private dashboard API
  if (options?.includeAvailability && product.active !== undefined) {
    (jsonLd.offers as Record<string, unknown>).availability = product.active
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";
  }

  return jsonLd;
}

/**
 * Normalizes a merchant store name into a URL-safe public slug.
 */
export function slugifyMerchantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Safely resolves a merchant for public catalog discovery without exposing internal IDs.
 * Supports resolution by public slug, merchant ID, or exact store name.
 */
export async function resolvePublicMerchant(
  identifier: string
): Promise<PublicMerchantInfo | null> {
  if (!identifier || typeof identifier !== "string") return null;
  const clean = identifier.trim();
  if (!clean) return null;

  // 1. Direct ID lookup (authoritative DB cuid)
  const byId = await prisma.merchant.findUnique({
    where: { id: clean },
    select: { id: true, name: true, currency: true },
  });
  if (byId) {
    return {
      id: byId.id,
      name: byId.name,
      currency: byId.currency || "INR",
      slug: slugifyMerchantName(byId.name),
    };
  }

  // 2. Direct name match (e.g., if identifier matches store name)
  const nameCandidate = clean.replace(/-/g, " ");
  const byName = await prisma.merchant.findFirst({
    where: {
      name: {
        equals: nameCandidate,
        mode: "insensitive",
      },
    },
    select: { id: true, name: true, currency: true },
  });
  if (byName) {
    return {
      id: byName.id,
      name: byName.name,
      currency: byName.currency || "INR",
      slug: slugifyMerchantName(byName.name),
    };
  }

  // 3. Match across merchants via normalized slug
  const merchants = await prisma.merchant.findMany({
    select: { id: true, name: true, currency: true },
    take: 100,
  });
  const matched = merchants.find(
    (m) => slugifyMerchantName(m.name) === clean.toLowerCase()
  );
  if (matched) {
    return {
      id: matched.id,
      name: matched.name,
      currency: matched.currency || "INR",
      slug: slugifyMerchantName(matched.name),
    };
  }

  return null;
}

/**
 * Returns an unauthenticated, strictly allowlisted, machine-readable product catalog
 * for external AI buyers.
 * 
 * BOUNDARY RULES:
 * 1. Read-only: performs zero mutations, charges zero funds, creates zero actions.
 * 2. Active products only: inactive products are strictly excluded.
 * 3. Strictly allowlisted: zero customer PII, zero credentials, zero internal operational metadata.
 * 4. Authoritative price: always uses Product.price from PostgreSQL.
 * 5. Grounded JSON-LD: reuses canonical builder without fabricated schema.org inventory.
 */
export async function getAIPublicCatalog(
  identifier: string,
  options?: {
    includeJsonLd?: boolean;
  }
): Promise<AIPublicCatalogResponse> {
  if (!identifier?.trim()) {
    throw new PublicCatalogError("Merchant identifier parameter is required", 400);
  }

  const merchant = await resolvePublicMerchant(identifier);
  if (!merchant) {
    throw new PublicCatalogError(`Merchant not found with identifier: '${identifier}'`, 404);
  }

  const currency = merchant.currency || "INR";
  const includeJsonLd = options?.includeJsonLd !== false;

  // STRICT PRISMA SELECT: ONLY ACTIVE PRODUCTS, ONLY SAFE PUBLIC FIELDS
  const products = await prisma.product.findMany({
    where: {
      merchantId: merchant.id,
      active: true,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      price: true,
      active: true,
    },
  });

  const publicProducts: AIPublicProduct[] = products.map((p) => {
    const priceNum = Number(p.price);
    const item: AIPublicProduct = {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      category: p.category ?? null,
      price: priceNum,
      currency,
      active: true,
    };

    if (includeJsonLd) {
      item.jsonLd = buildProductJsonLd(
        {
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          price: priceNum,
          active: true,
        },
        currency,
        { includeAvailability: false }
      );
    }

    return item;
  });

  return {
    success: true,
    merchant: {
      name: merchant.name,
      currency,
      slug: merchant.slug,
    },
    totalProducts: publicProducts.length,
    products: publicProducts,
  };
}


// ---------------------------------------------------------------------------
// 2. AI BUYER READINESS SCORE CALCULATION
// ---------------------------------------------------------------------------

/**
 * Pure deterministic calculation of AI Buyer Readiness from product objects.
 * 
 * FORMULA:
 * Product Completeness Weighting:
 * - Product Name present (non-empty): 25%
 * - Valid Price (> 0): 25%
 * - Category present (non-empty): 20%
 * - Description present (>= 10 chars): 20%
 * - Active Inventory status (active === true): 10%
 * 
 * Score = Average(Product Completeness) * 100
 */
export function calculateReadinessScore(
  products: Array<{
    name: string;
    description: string | null;
    category: string | null;
    price: number;
    active: boolean;
  }>
): {
  readinessScore: number;
  totalProducts: number;
  activeProducts: number;
  productsWithDescription: number;
  productsWithCategory: number;
  productsWithValidPrice: number;
  completeProducts: number;
  needsAttentionCount: number;
  missingMetadataWarnings: string[];
  checklist: AIBuyerReadinessReport["checklist"];
} {
  const total = products.length;
  if (total === 0) {
    return {
      readinessScore: 0,
      totalProducts: 0,
      activeProducts: 0,
      productsWithDescription: 0,
      productsWithCategory: 0,
      productsWithValidPrice: 0,
      completeProducts: 0,
      needsAttentionCount: 0,
      missingMetadataWarnings: ["Catalog is empty. Import products to enable AI buyer discovery."],
      checklist: {
        productNames: { complete: false, count: 0, total: 0, percentage: 0 },
        prices: { complete: false, count: 0, total: 0, percentage: 0 },
        categories: { complete: false, count: 0, total: 0, percentage: 0 },
        descriptions: { complete: false, count: 0, total: 0, percentage: 0 },
        activeInventory: { complete: false, count: 0, total: 0, percentage: 0 },
      },
    };
  }

  let nameCount = 0;
  let priceCount = 0;
  let catCount = 0;
  let descCount = 0;
  let activeCount = 0;
  let completeCount = 0;
  let missingDescCount = 0;
  let missingCatCount = 0;
  let inactiveCount = 0;

  let totalCompletenessSum = 0;

  for (const p of products) {
    let itemScore = 0;

    // 1. Name: 25 points
    if (p.name && p.name.trim().length > 0) {
      itemScore += 25;
      nameCount++;
    }

    // 2. Price: 25 points
    if (typeof p.price === "number" && !isNaN(p.price) && p.price > 0) {
      itemScore += 25;
      priceCount++;
    }

    // 3. Category: 20 points
    if (p.category && p.category.trim().length > 0) {
      itemScore += 20;
      catCount++;
    } else {
      missingCatCount++;
    }

    // 4. Description: 20 points
    if (p.description && p.description.trim().length >= 10) {
      itemScore += 20;
      descCount++;
    } else {
      missingDescCount++;
    }

    // 5. Active: 10 points
    if (p.active === true) {
      itemScore += 10;
      activeCount++;
    } else {
      inactiveCount++;
    }

    totalCompletenessSum += itemScore;

    if (itemScore === 100) {
      completeCount++;
    }
  }

  const readinessScore = Math.round(totalCompletenessSum / total);
  const needsAttentionCount = total - completeCount;

  const missingMetadataWarnings: string[] = [];
  if (missingDescCount > 0) {
    missingMetadataWarnings.push(
      `${missingDescCount} product${missingDescCount === 1 ? "" : "s"} missing detailed descriptions (>= 10 chars).`
    );
  }
  if (missingCatCount > 0) {
    missingMetadataWarnings.push(
      `${missingCatCount} product${missingCatCount === 1 ? "" : "s"} missing categorization.`
    );
  }
  if (inactiveCount > 0) {
    missingMetadataWarnings.push(
      `${inactiveCount} product${inactiveCount === 1 ? "" : "s"} marked inactive and hidden from AI buyers.`
    );
  }

  return {
    readinessScore,
    totalProducts: total,
    activeProducts: activeCount,
    productsWithDescription: descCount,
    productsWithCategory: catCount,
    productsWithValidPrice: priceCount,
    completeProducts: completeCount,
    needsAttentionCount,
    missingMetadataWarnings,
    checklist: {
      productNames: {
        complete: nameCount === total,
        count: nameCount,
        total,
        percentage: Math.round((nameCount / total) * 100),
      },
      prices: {
        complete: priceCount === total,
        count: priceCount,
        total,
        percentage: Math.round((priceCount / total) * 100),
      },
      categories: {
        complete: catCount === total,
        count: catCount,
        total,
        percentage: Math.round((catCount / total) * 100),
      },
      descriptions: {
        complete: descCount === total,
        count: descCount,
        total,
        percentage: Math.round((descCount / total) * 100),
      },
      activeInventory: {
        complete: activeCount === total,
        count: activeCount,
        total,
        percentage: Math.round((activeCount / total) * 100),
      },
    },
  };
}

/**
 * Calculates the full AI Buyer Readiness Report for a merchant.
 */
export async function calculateAIBuyerReadiness(
  merchantId: string
): Promise<AIBuyerReadinessReport> {
  if (!merchantId?.trim()) {
    throw new Error("merchantId parameter is required");
  }

  const products = await prisma.product.findMany({
    where: { merchantId },
    select: {
      name: true,
      description: true,
      category: true,
      price: true,
      active: true,
    },
  });

  const calculation = calculateReadinessScore(
    products.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      price: Number(p.price),
      active: p.active,
    }))
  );

  return {
    merchantId,
    readinessScore: calculation.readinessScore,
    totalProducts: calculation.totalProducts,
    activeProducts: calculation.activeProducts,
    productsWithDescription: calculation.productsWithDescription,
    productsWithCategory: calculation.productsWithCategory,
    productsWithValidPrice: calculation.productsWithValidPrice,
    completeProducts: calculation.completeProducts,
    needsAttentionCount: calculation.needsAttentionCount,
    formula:
      "Completeness per product = (Name * 0.25) + (Price * 0.25) + (Category * 0.20) + (Description * 0.20) + (Active * 0.10). Readiness Score = Average completeness across all catalog items.",
    checklist: calculation.checklist,
    missingMetadataWarnings: calculation.missingMetadataWarnings,
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 3. AI BUYER PRODUCT DISCOVERY
// ---------------------------------------------------------------------------

/**
 * Parses natural language query to extract potential numeric budget constraint.
 * E.g., "laptop sleeve under ₹2,000" -> 2000, "under 500 rs" -> 500.
 */
function extractBudgetFromQuery(query: string): number | undefined {
  const match = query.match(/(?:under|below|less\s+than|max|budget\s+of)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/i);
  if (match && match[1]) {
    const val = parseFloat(match[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0) return val;
  }
  return undefined;
}

/**
 * Discovers and ranks merchant products matching an AI Buyer's natural language request.
 * 
 * SAFETY INVARIANTS:
 * 1. The LLM only receives compact, authoritative product attributes.
 * 2. Any recommended product IDs are strictly verified against real active merchant products.
 * 3. Product prices are strictly read from Product.price in PostgreSQL.
 * 4. Deterministic fallback matching executes if AI is unavailable or produces no matches.
 */
export async function discoverProductsForAIBuyer(input: {
  merchantId: string;
  query: string;
  budget?: number;
  category?: string;
}): Promise<ProductDiscoveryResponse> {
  const { merchantId, query } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId parameter is required");
  }
  if (!query?.trim()) {
    throw new Error("query parameter is required");
  }

  const effectiveBudget = input.budget ?? extractBudgetFromQuery(query);
  const effectiveCategory = input.category?.trim();

  // 1. Authoritative active product fetch
  const activeProducts = await prisma.product.findMany({
    where: {
      merchantId,
      active: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      price: true,
      active: true,
    },
  });

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { currency: true },
  });
  const currency = merchant?.currency || "INR";

  if (activeProducts.length === 0) {
    return {
      success: true,
      query,
      budget: effectiveBudget,
      category: effectiveCategory,
      matchedCount: 0,
      totalCatalogCount: 0,
      matches: [],
      summary: "No active products available in this merchant's catalog.",
      searchedAt: new Date().toISOString(),
    };
  }

  // Create a map of active products for strict O(1) verification
  const productMap = new Map(
    activeProducts.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price: Number(p.price),
        active: p.active,
      },
    ])
  );

  // 2. Perform AI Semantic Matching
  const primaryConfig = getPrimaryModelConfig();
  const fallbackConfig = getFallbackModelConfig();
  const activeConfig = primaryConfig || fallbackConfig;

  let aiMatches: Array<{
    productId: string;
    matchScore: number;
    matchReason: string;
    whyItMatches: string[];
  }> = [];

  if (activeConfig) {
    try {
      const compactCatalog = activeProducts.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category ?? "General",
        price: Number(p.price),
        description: p.description ?? "",
      }));

      const prompt = `You are an AI Buyer Product Discovery Engine for an agentic commerce network.
A customer has submitted the following shopping query:
"${query}"

Merchant Active Catalog:
${JSON.stringify(compactCatalog, null, 2)}

TASK:
1. Identify up to 5 products from the catalog that best satisfy the customer's intent, category, and budget.
2. For each matched product, explain why it matches strictly using its factual attributes (category, use-case, price).
3. Return ONLY a JSON array in the exact schema below.

Output Schema:
[
  {
    "productId": "id_from_catalog",
    "matchScore": 0.95,
    "matchReason": "Clear summary of why this matches the query",
    "whyItMatches": [
      "Factual bullet point 1",
      "Factual bullet point 2"
    ]
  }
]`;

      const aiRes = await generateText({
        model: activeConfig.model,
        prompt,
        maxRetries: 0,
      });

      const text = aiRes.text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          aiMatches = parsed;
        }
      }
    } catch {
      // Graceful fallback to deterministic keyword matcher
    }
  }

  // 3. Strict Backend Verification & Discarding of Invalid / Hallucinated Products
  const verifiedMatches: ProductDiscoveryMatch[] = [];
  const matchedProductIds = new Set<string>();

  for (const rawMatch of aiMatches) {
    if (!rawMatch || typeof rawMatch.productId !== "string") continue;
    const realProd = productMap.get(rawMatch.productId);
    if (!realProd) continue; // DISCARD: Does not exist or not active
    if (matchedProductIds.has(realProd.id)) continue; // DISCARD duplicate

    // Budget check if specified
    if (effectiveBudget !== undefined && realProd.price > effectiveBudget) {
      continue; // Discard products outside requested budget
    }

    // Category check if specified
    if (
      effectiveCategory &&
      realProd.category &&
      !realProd.category.toLowerCase().includes(effectiveCategory.toLowerCase())
    ) {
      continue;
    }

    const whyList =
      Array.isArray(rawMatch.whyItMatches) && rawMatch.whyItMatches.length > 0
        ? rawMatch.whyItMatches.map((w) => String(w).trim()).filter(Boolean)
        : [
            realProd.category ? `Matches category: ${realProd.category}` : "Catalog product match",
            `Authoritative price ₹${realProd.price.toLocaleString("en-IN")}${
              effectiveBudget ? ` is within budget of ₹${effectiveBudget.toLocaleString("en-IN")}` : ""
            }`,
          ];

    verifiedMatches.push({
      productId: realProd.id,
      name: realProd.name,
      description: realProd.description,
      category: realProd.category,
      price: realProd.price,
      currency,
      active: realProd.active,
      matchScore: typeof rawMatch.matchScore === "number" ? Math.min(1, Math.max(0, rawMatch.matchScore)) : 0.85,
      matchReason:
        typeof rawMatch.matchReason === "string" && rawMatch.matchReason.trim()
          ? rawMatch.matchReason.trim()
          : `Matches user request "${query}" with category "${realProd.category || "General"}" at ₹${realProd.price}.`,
      whyItMatches: whyList,
    });

    matchedProductIds.add(realProd.id);
  }

  // 4. Deterministic Keyword & Token Matcher Fallback
  if (verifiedMatches.length === 0) {
    const queryTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !["under", "less", "than", "need", "want", "looking", "for"].includes(t));

    for (const prod of activeProducts) {
      if (matchedProductIds.has(prod.id)) continue;
      const priceNum = Number(prod.price);

      // Budget check
      if (effectiveBudget !== undefined && priceNum > effectiveBudget) {
        continue;
      }

      const nameLower = prod.name.toLowerCase();
      const descLower = (prod.description || "").toLowerCase();
      const catLower = (prod.category || "").toLowerCase();

      let hits = 0;
      for (const token of queryTokens) {
        if (nameLower.includes(token)) hits += 3;
        if (catLower.includes(token)) hits += 2;
        if (descLower.includes(token)) hits += 1;
      }

      if (hits > 0 || queryTokens.length === 0) {
        const score = Math.min(0.95, Number((0.5 + (hits / Math.max(queryTokens.length * 3, 1)) * 0.45).toFixed(2)));
        const whyBullets = [
          prod.category ? `Matches category: ${prod.category}` : "Catalog item",
          `Authoritative price ₹${priceNum.toLocaleString("en-IN")}${
            effectiveBudget ? ` (within budget of ₹${effectiveBudget.toLocaleString("en-IN")})` : ""
          }`,
        ];

        verifiedMatches.push({
          productId: prod.id,
          name: prod.name,
          description: prod.description,
          category: prod.category,
          price: priceNum,
          currency,
          active: prod.active,
          matchScore: score,
          matchReason: `Discovered based on product name, category (${prod.category || "General"}), and price matching.`,
          whyItMatches: whyBullets,
        });

        matchedProductIds.add(prod.id);
      }
    }
  }

  // Sort matches by matchScore descending
  verifiedMatches.sort((a, b) => b.matchScore - a.matchScore);

  const summary =
    verifiedMatches.length > 0
      ? `Discovered ${verifiedMatches.length} matching product${verifiedMatches.length === 1 ? "" : "s"} for "${query}".`
      : `No products found matching "${query}".`;

  // 5. Record Audit Event
  try {
    await prisma.auditEvent.create({
      data: {
        merchantId,
        eventType: "AI_PRODUCT_DISCOVERY",
        actor: AuditActor.AGENT,
        metadata: {
          query,
          budget: effectiveBudget ?? null,
          category: effectiveCategory ?? null,
          matchedCount: verifiedMatches.length,
          matchedProductIds: verifiedMatches.map((m) => m.productId),
          searchedAt: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    query,
    budget: effectiveBudget,
    category: effectiveCategory,
    matchedCount: verifiedMatches.length,
    totalCatalogCount: activeProducts.length,
    matches: verifiedMatches,
    summary,
    searchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 4. AI BUYER PURCHASE INTENT
// ---------------------------------------------------------------------------

/**
 * Creates a bounded purchase-intent record for an AI Buyer request.
 * 
 * FINANCIAL SAFETY BOUNDARY:
 * - Does NOT charge the buyer or deduct funds.
 * - Always reads authoritative price from Product.price in PostgreSQL.
 * - Confirms merchant ownership and active product status.
 * - Explicitly marks `requiresConfirmation: true` and indicates Razorpay payment link execution.
 */
export async function createAIBuyerPurchaseIntent(input: {
  merchantId: string;
  productId: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<PurchaseIntentResponse> {
  const { merchantId, productId } = input;

  if (!merchantId?.trim() || !productId?.trim()) {
    throw new Error("merchantId and productId are required parameters");
  }

  // Authoritatively load product and merchant
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      merchantId,
    },
    include: {
      merchant: {
        select: {
          id: true,
          name: true,
          currency: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error(`Product '${productId}' not found or does not belong to merchant '${merchantId}'`);
  }

  if (!product.active) {
    throw new Error(`Product '${product.name}' is currently inactive and cannot be purchased`);
  }

  const authoritativePrice = Number(product.price);
  const amountInPaise = Math.round(authoritativePrice * 100);
  const currency = product.merchant.currency || "INR";
  const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Record Audit Event
  try {
    await prisma.auditEvent.create({
      data: {
        merchantId,
        eventType: "AI_PURCHASE_INTENT_CREATED",
        actor: AuditActor.AGENT,
        metadata: {
          intentId,
          productId: product.id,
          productName: product.name,
          authoritativePrice,
          currency,
          customerEmail: input.customerEmail ?? null,
          createdAt: new Date().toISOString(),
        },
      },
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    intentId,
    merchantId,
    productId: product.id,
    productName: product.name,
    description: product.description,
    category: product.category,
    authoritativePrice,
    amountInPaise,
    currency,
    status: "READY_FOR_CONFIRMATION",
    requiresConfirmation: true,
    paymentNotice:
      "Payment requires explicit buyer confirmation via Razorpay. No funds are deducted automatically.",
    createdAt: new Date().toISOString(),
  };
}
