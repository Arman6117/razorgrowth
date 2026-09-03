import { prisma } from "../prisma";
import {
  OpportunityType,
  OpportunityStatus,
  AuditActor,
} from "../generated/prisma/enums";
import {
  computeMerchantGrowthSnapshot,
  MerchantGrowthSnapshot,
} from "./snapshot";
import {
  getPrimaryModelConfig,
  getFallbackModelConfig,
  isProviderAvailabilityOrQuotaError,
} from "../agent/orchestrator";
import { generateText } from "ai";

export interface GrowthEvidence {
  sourceProductName?: string;
  targetProductName: string;
  sourcePrice?: number;
  targetPrice: number;
  sourceCustomers?: number;
  customersTogether?: number;
  eligibleCustomerCount: number;
  attachRate?: number;
  upgradeRate?: number;
  dormantCustomerCount?: number;
  repeatPurchaseRate?: number;
  sampleSize: number;
  [key: string]: unknown;
}

export interface RankedGrowthOpportunity {
  id?: string;
  merchantId: string;
  type: OpportunityType;
  title: string;
  explanation: string;
  strategicInsight?: string;
  sourceProductId?: string;
  targetProductId: string;
  recommendedProductName: string;
  targetCustomerCount: number;
  estimatedValue: number;
  confidence: number;
  evidence: GrowthEvidence;
  score: number;
  scoringBreakdown: {
    normalizedEstimatedValue: number;
    evidenceStrength: number;
    confidence: number;
    formula: string;
  };
  status: OpportunityStatus;
  createdAt?: Date;
}

export interface GrowthAnalysisResult {
  success: boolean;
  merchantId: string;
  merchantName: string;
  analyzedAt: string;
  snapshot: MerchantGrowthSnapshot;
  opportunities: RankedGrowthOpportunity[];
  topRecommendation: RankedGrowthOpportunity | null;
  totalPipelineValue: number;
  totalEligibleCustomers: number;
  aiEnhanced: boolean;
  aiProvider?: string;
  aiModel?: string;
  message: string;
}

/**
 * Transparent deterministic ranking formula:
 * score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)
 *
 * Parameters:
 * - normalizedEstimatedValue: candidate.estimatedValue / max(all candidate estimatedValues) [0.0 - 1.0]
 * - evidenceStrength: min(sampleSize / 50, 1.0) [0.0 - 1.0]
 * - confidence: clamp(candidate.confidence, 0.0, 1.0) [0.0 - 1.0]
 */
export function calculateOpportunityScore(
  candidate: {
    estimatedValue: number;
    confidence: number;
    evidence: GrowthEvidence;
  },
  maxEstimatedValue: number
): {
  score: number;
  breakdown: {
    normalizedEstimatedValue: number;
    evidenceStrength: number;
    confidence: number;
    formula: string;
  };
} {
  const normVal =
    maxEstimatedValue > 0
      ? Math.min(candidate.estimatedValue / maxEstimatedValue, 1.0)
      : 0;
  const sampleSize = candidate.evidence.sampleSize || 1;
  const evidenceStrength = Math.min(sampleSize / 50, 1.0);
  const confidence = Math.min(Math.max(candidate.confidence, 0), 1.0);

  const score = Number(
    (normVal * 0.5 + evidenceStrength * 0.3 + confidence * 0.2).toFixed(4)
  );

  return {
    score,
    breakdown: {
      normalizedEstimatedValue: Number(normVal.toFixed(4)),
      evidenceStrength: Number(evidenceStrength.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      formula: "score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)",
    },
  };
}

/**
 * Deterministically generates evidence-backed growth opportunities from snapshot facts.
 */
export function generateDeterministicOpportunities(
  snapshot: MerchantGrowthSnapshot
): RankedGrowthOpportunity[] {
  const candidates: Array<Omit<RankedGrowthOpportunity, "score" | "scoringBreakdown">> = [];
  const { merchantId, products, productPairs, customers } = snapshot;

  const productMap = new Map(products.map((p) => [p.id, p]));

  // 1. CROSS-SELL Candidates
  for (const pair of productPairs) {
    if (pair.attachRate < 0.05 || pair.sourceOnlyBuyersCount === 0) continue;
    const sourceProd = productMap.get(pair.sourceProductId);
    const targetProd = productMap.get(pair.targetProductId);
    if (!sourceProd || !targetProd || !targetProd.active) continue;

    const eligibleCustomerCount = pair.sourceOnlyBuyersCount;
    const expectedRevenue = Number(
      (eligibleCustomerCount * targetProd.price * pair.attachRate).toFixed(2)
    );

    const evidence: GrowthEvidence = {
      sourceProductName: sourceProd.name,
      targetProductName: targetProd.name,
      sourcePrice: sourceProd.price,
      targetPrice: targetProd.price,
      sourceCustomers: pair.sourceBuyersCount,
      customersTogether: pair.coPurchasersCount,
      eligibleCustomerCount,
      attachRate: pair.attachRate,
      sampleSize: pair.sourceBuyersCount,
    };

    const attachPct = (pair.attachRate * 100).toFixed(1);
    const explanation = `${pair.sourceBuyersCount} customers purchased ${sourceProd.name}. Historical transactions show ${pair.coPurchasersCount} of them also purchased ${targetProd.name} (${attachPct}% attach rate). Recommending ${targetProd.name} (₹${targetProd.price.toLocaleString("en-IN")}) to the remaining ${eligibleCustomerCount} buyers could yield ~₹${expectedRevenue.toLocaleString("en-IN")}.`;

    candidates.push({
      merchantId,
      type: OpportunityType.CROSS_SELL,
      title: `Cross-sell: ${sourceProd.name} → ${targetProd.name}`,
      explanation,
      sourceProductId: sourceProd.id,
      targetProductId: targetProd.id,
      recommendedProductName: targetProd.name,
      targetCustomerCount: eligibleCustomerCount,
      estimatedValue: expectedRevenue,
      confidence: pair.attachRate,
      evidence,
      status: OpportunityStatus.NEW,
    });
  }

  // 2. UPSELL Candidates (Higher price tier in same/related category)
  for (const sourceProd of products) {
    if (!sourceProd.active || sourceProd.uniqueBuyersCount < 2) continue;

    // Find higher-priced products in the same or complementary category
    const upgradeTargets = products.filter(
      (p) =>
        p.id !== sourceProd.id &&
        p.active &&
        p.price > sourceProd.price &&
        (p.category === sourceProd.category || sourceProd.category === "Computers" || sourceProd.category === "Laptops")
    );

    for (const targetProd of upgradeTargets) {
      const pair = productPairs.find(
        (pp) => pp.sourceProductId === sourceProd.id && pp.targetProductId === targetProd.id
      );

      const upgradeBuyers = pair?.coPurchasersCount || 0;
      const upgradeRate =
        sourceProd.uniqueBuyersCount > 0
          ? Number((upgradeBuyers / sourceProd.uniqueBuyersCount).toFixed(4))
          : 0;

      const nonUpgradedBuyers = Math.max(0, sourceProd.uniqueBuyersCount - upgradeBuyers);
      if (nonUpgradedBuyers === 0) continue;

      const effectiveRate = Math.max(upgradeRate, 0.1);
      const estimatedValue = Number(
        (nonUpgradedBuyers * targetProd.price * effectiveRate).toFixed(2)
      );

      const evidence: GrowthEvidence = {
        sourceProductName: sourceProd.name,
        targetProductName: targetProd.name,
        sourcePrice: sourceProd.price,
        targetPrice: targetProd.price,
        sourceCustomers: sourceProd.uniqueBuyersCount,
        customersTogether: upgradeBuyers,
        eligibleCustomerCount: nonUpgradedBuyers,
        upgradeRate: effectiveRate,
        sampleSize: sourceProd.uniqueBuyersCount,
      };

      const explanation = `${sourceProd.uniqueBuyersCount} buyers purchased ${sourceProd.name} (₹${sourceProd.price.toLocaleString("en-IN")}). High-tier upgrade ${targetProd.name} (₹${targetProd.price.toLocaleString("en-IN")}) has an observed ${((effectiveRate) * 100).toFixed(1)}% conversion propensity. Reaching ${nonUpgradedBuyers} eligible customer accounts has an estimated pipeline of ₹${estimatedValue.toLocaleString("en-IN")}.`;

      candidates.push({
        merchantId,
        type: OpportunityType.UPSELL,
        title: `Upsell: ${sourceProd.name} → Premium ${targetProd.name}`,
        explanation,
        sourceProductId: sourceProd.id,
        targetProductId: targetProd.id,
        recommendedProductName: targetProd.name,
        targetCustomerCount: nonUpgradedBuyers,
        estimatedValue,
        confidence: effectiveRate,
        evidence,
        status: OpportunityStatus.NEW,
      });
    }
  }

  // 3. REACTIVATION Candidates (Dormant customers re-engaged with top-selling product)
  if (customers.dormantCount > 0 && products.length > 0) {
    const topSeller = [...products]
      .filter((p) => p.active)
      .sort((a, b) => b.unitsSold - a.unitsSold)[0];

    if (topSeller && topSeller.unitsSold > 0) {
      const repeatRate =
        customers.withPurchases > 0
          ? Number((customers.repeatBuyers / customers.withPurchases).toFixed(4))
          : 0.15;

      const estimatedValue = Number(
        (customers.dormantCount * topSeller.price * Math.max(repeatRate, 0.1)).toFixed(2)
      );

      const evidence: GrowthEvidence = {
        targetProductName: topSeller.name,
        targetPrice: topSeller.price,
        dormantCustomerCount: customers.dormantCount,
        repeatPurchaseRate: repeatRate,
        eligibleCustomerCount: customers.dormantCount,
        sampleSize: customers.dormantCount,
      };

      const explanation = `${customers.dormantCount} registered customers have been inactive over 30 days. Based on the store's ${(repeatRate * 100).toFixed(1)}% repeat purchase rate, re-engaging them with catalog top-seller ${topSeller.name} (₹${topSeller.price.toLocaleString("en-IN")}) targets ₹${estimatedValue.toLocaleString("en-IN")} in reactivation revenue.`;

      candidates.push({
        merchantId,
        type: OpportunityType.REACTIVATION,
        title: `Reactivate ${customers.dormantCount} Dormant Buyers with ${topSeller.name}`,
        explanation,
        targetProductId: topSeller.id,
        recommendedProductName: topSeller.name,
        targetCustomerCount: customers.dormantCount,
        estimatedValue,
        confidence: Math.max(repeatRate, 0.1),
        evidence,
        status: OpportunityStatus.NEW,
      });
    }
  }

  // Rank all candidates deterministically
  const maxEstimatedValue = Math.max(...candidates.map((c) => c.estimatedValue), 1);

  const rankedOpportunities: RankedGrowthOpportunity[] = candidates.map((c) => {
    const { score, breakdown } = calculateOpportunityScore(c, maxEstimatedValue);
    return {
      ...c,
      score,
      scoringBreakdown: breakdown,
    };
  });

  rankedOpportunities.sort((a, b) => b.score - a.score);

  return rankedOpportunities;
}

/**
 * Core AI Growth Intelligence Analyzer.
 * 1. Computes deterministic merchant snapshot.
 * 2. Formulates evidence-backed candidate opportunities with deterministic scoring.
 * 3. Prompts LLM for merchant-facing strategic commentary and enriched explanations (with instant fallback).
 * 4. Persists / syncs opportunities with database.
 * 5. Records AI_GROWTH_ANALYSIS_COMPLETED AuditEvent.
 */
export async function analyzeMerchantGrowthIntelligence(
  merchantId: string
): Promise<GrowthAnalysisResult> {
  if (!merchantId?.trim()) {
    throw new Error("merchantId parameter is required");
  }

  // 1. Build deterministic snapshot
  const snapshot = await computeMerchantGrowthSnapshot(merchantId);
  if (!snapshot) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  // 2. Generate deterministic evidence-backed opportunities
  const opportunities = generateDeterministicOpportunities(snapshot);

  let aiEnhanced = false;
  let aiProvider: string | undefined = undefined;
  let aiModel: string | undefined = undefined;

  // 3. Enrich with LLM reasoning if configured
  const primaryConfig = getPrimaryModelConfig();
  const fallbackConfig = getFallbackModelConfig();
  let activeConfig = primaryConfig || fallbackConfig;

  if (activeConfig && opportunities.length > 0) {
    try {
      const topOppsSummary = opportunities.slice(0, 4).map((o, idx) => ({
        rank: idx + 1,
        type: o.type,
        title: o.title,
        recommendedProduct: o.recommendedProductName,
        targetCustomerCount: o.targetCustomerCount,
        estimatedValue: o.estimatedValue,
        confidencePct: `${(o.confidence * 100).toFixed(1)}%`,
        score: o.score,
        evidence: o.evidence,
      }));

      const prompt = `You are RazorGrowth's AI Growth Intelligence Engine.
Analyze the following merchant transaction snapshot and the top pre-computed evidence-backed opportunities.

Merchant Snapshot:
- Merchant: "${snapshot.merchantName}"
- Total Customers: ${snapshot.customers.total} (${snapshot.customers.withPurchases} active buyers, ${snapshot.customers.repeatBuyers} repeat buyers, ${snapshot.customers.dormantCount} dormant)
- Total Paid Orders: ${snapshot.orders.paid} (Total Revenue: ₹${snapshot.orders.totalRealizedRevenue}, AOV: ₹${snapshot.orders.averageOrderValue})
- Active Products: ${snapshot.products.length}

Ranked Opportunities (Authoritative Deterministic Data):
${JSON.stringify(topOppsSummary, null, 2)}

TASK:
Provide brief, sharp, 1-2 sentence strategic insights for each opportunity rank (1 to ${topOppsSummary.length}), and a 2-sentence executive summary for the merchant.
Format as JSON:
{
  "executiveSummary": "...",
  "insights": {
    "1": "...",
    "2": "..."
  }
}
DO NOT CHANGE ANY NUMBERS OR PRICES. Ground all commentary in the provided facts.`;

      const response = await generateText({
        model: activeConfig.model,
        prompt,
        maxRetries: 0,
      });

      let parsedAi: { executiveSummary?: string; insights?: Record<string, string> } | null = null;
      try {
        const text = response.text.trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedAi = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback gracefully
      }

      if (parsedAi?.insights) {
        aiEnhanced = true;
        aiProvider = activeConfig.providerName;
        aiModel = activeConfig.modelName;

        for (let i = 0; i < Math.min(opportunities.length, 4); i++) {
          const insight = parsedAi.insights[String(i + 1)];
          if (insight) {
            opportunities[i].strategicInsight = insight;
          }
        }
      }
    } catch (llmErr) {
      console.warn(
        `[GrowthIntelligence] LLM enrichment skipped (${llmErr instanceof Error ? llmErr.message : String(llmErr)}). Using deterministic explainability.`
      );
    }
  }

  // 4. Persist / sync Opportunities in database
  const existingDbOpps = await prisma.opportunity.findMany({
    where: { merchantId },
  });

  const existingMap = new Map<string, (typeof existingDbOpps)[0]>();
  for (const o of existingDbOpps) {
    if (o.sourceProductId && o.targetProductId) {
      existingMap.set(`${o.type}:${o.sourceProductId}:${o.targetProductId}`, o);
    } else if (o.targetProductId) {
      existingMap.set(`${o.type}:${o.targetProductId}`, o);
    }
  }

  for (const opp of opportunities) {
    const key = opp.sourceProductId
      ? `${opp.type}:${opp.sourceProductId}:${opp.targetProductId}`
      : `${opp.type}:${opp.targetProductId}`;

    const existing = existingMap.get(key);
    if (existing) {
      // Update with latest authoritative evidence and estimated revenue
      const updated = await prisma.opportunity.update({
        where: { id: existing.id },
        data: {
          confidence: opp.confidence,
          estimatedRevenue: opp.estimatedValue,
          evidence: opp.evidence as any,
          description: opp.explanation,
        },
      });
      opp.id = updated.id;
      opp.status = updated.status;
      opp.createdAt = updated.createdAt;
    } else {
      // Create new persisted Opportunity
      const created = await prisma.opportunity.create({
        data: {
          merchantId,
          type: opp.type,
          title: opp.title,
          description: opp.explanation,
          sourceProductId: opp.sourceProductId,
          targetProductId: opp.targetProductId,
          confidence: opp.confidence,
          estimatedRevenue: opp.estimatedValue,
          evidence: opp.evidence as any,
          status: OpportunityStatus.NEW,
        },
      });
      opp.id = created.id;
      opp.status = created.status;
      opp.createdAt = created.createdAt;
      existingMap.set(key, created);
    }
  }

  // 5. Record AI_GROWTH_ANALYSIS_COMPLETED AuditEvent
  await prisma.auditEvent.create({
    data: {
      merchantId,
      eventType: "AI_GROWTH_ANALYSIS_COMPLETED",
      actor: AuditActor.AGENT,
      metadata: {
        opportunityCount: opportunities.length,
        topOpportunity: opportunities[0]?.title || null,
        totalPipelineValue: opportunities.reduce((s, o) => s + o.estimatedValue, 0),
        totalEligibleCustomers: opportunities.reduce((s, o) => s + o.targetCustomerCount, 0),
        analyzedAt: new Date().toISOString(),
        aiEnhanced,
        aiProvider: aiProvider || "deterministic_engine",
        aiModel: aiModel || "heuristic_v3",
        analysisVersion: "phase3",
      },
    },
  });

  const totalPipelineValue = Number(
    opportunities.reduce((acc, o) => acc + o.estimatedValue, 0).toFixed(2)
  );
  const totalEligibleCustomers = opportunities.reduce(
    (acc, o) => acc + o.targetCustomerCount,
    0
  );

  return {
    success: true,
    merchantId,
    merchantName: snapshot.merchantName,
    analyzedAt: new Date().toISOString(),
    snapshot,
    opportunities,
    topRecommendation: opportunities[0] || null,
    totalPipelineValue,
    totalEligibleCustomers,
    aiEnhanced,
    aiProvider,
    aiModel,
    message: `AI Growth Intelligence analyzed ${snapshot.orders.paid} paid orders and identified ${opportunities.length} ranked revenue opportunities totaling ₹${totalPipelineValue.toLocaleString("en-IN")}.`,
  };
}
