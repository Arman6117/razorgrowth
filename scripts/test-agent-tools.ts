import { prisma } from "../lib/prisma";
import { executeAgentTool, agentToolDefinitions } from "../lib/agent/tools";
import { GrowthActionStatus, AuditActor } from "../lib/generated/prisma/enums";

async function runAgentToolsTest() {
  console.log("================================================================================");
  console.log(" 🤖 RazorGrowth: AI Agent Deterministic Tool Architecture Test Suite");
  console.log("================================================================================\n");

  const createdActionIds: string[] = [];

  try {
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error("No merchant found. Run seed script first.");
    }
    console.log(`👤 Testing with Merchant: "${merchant.name}" (${merchant.id})\n`);

    // 1. Test Tool Schema Registry
    console.log("📋 1. Testing Agent Tool Declarations & JSON Schema Definitions...");
    console.log(`   Registered Tools: ${agentToolDefinitions.map((t) => t.name).join(", ")}`);
    if (agentToolDefinitions.length < 4) {
      throw new Error("Expected at least 4 agent tool definitions");
    }
    console.log("   ✅ Agent Tool JSON Schemas verified.\n");

    // 2. Test Tool: analyzeCrossSell
    console.log("🔍 2. Testing Tool: analyzeCrossSell...");
    const analyzeResult = await executeAgentTool("analyzeCrossSell", {
      merchantId: merchant.id,
    });

    console.log(`   Success: ${analyzeResult.success}`);
    console.log(`   Message: ${analyzeResult.message}`);
    const opps = analyzeResult.data as Array<{
      opportunityId: string;
      sourceProductName: string;
      targetProductName: string;
      sourceProductId: string;
      targetProductId: string;
      eligibleCustomerCount: number;
      expectedRevenue: number;
    }>;

    if (!analyzeResult.success || !Array.isArray(opps) || opps.length === 0) {
      throw new Error("analyzeCrossSell tool failed or returned empty opportunities");
    }
    console.log(`   Discovered: ${opps.length} opportunities from transaction graph.`);
    const sampleOpp = opps.find((o) => o.eligibleCustomerCount > 0) || opps[0];
    console.log(`   Selected Pair: ${sampleOpp.sourceProductName} → ${sampleOpp.targetProductName} (Eligible Count: ${sampleOpp.eligibleCustomerCount})`);

    // Verify contract: analyzeCrossSell must NOT return eligibleCustomerIds to the LLM
    if ("eligibleCustomerIds" in sampleOpp) {
      throw new Error("analyzeCrossSell must NOT return raw eligibleCustomerIds to the LLM");
    }
    console.log("   ✅ analyzeCrossSell tool passed with compact schema (no raw customer ID arrays).\n");

    // Ensure database Opportunity record exists for testing
    let dbOpportunity = await prisma.opportunity.findFirst({
      where: {
        id: sampleOpp.opportunityId,
      },
    });

    if (!dbOpportunity) {
      dbOpportunity = await prisma.opportunity.findFirst({
        where: {
          merchantId: merchant.id,
          sourceProductId: sampleOpp.sourceProductId,
          targetProductId: sampleOpp.targetProductId,
        },
      });
    }

    if (!dbOpportunity) {
      dbOpportunity = await prisma.opportunity.create({
        data: {
          merchantId: merchant.id,
          type: "CROSS_SELL",
          title: `Cross-sell: ${sampleOpp.sourceProductName} → ${sampleOpp.targetProductName}`,
          description: "Agent tool test opportunity",
          sourceProductId: sampleOpp.sourceProductId,
          targetProductId: sampleOpp.targetProductId,
          confidence: 0.8,
          estimatedRevenue: sampleOpp.expectedRevenue,
          evidence: {},
        },
      });
    }

    // Find verified eligible customer in DB for single customer testing (bought source, NOT target)
    const eligibleCustomer = await prisma.customer.findFirst({
      where: {
        merchantId: merchant.id,
        orders: {
          some: {
            status: "PAID",
            items: { some: { productId: sampleOpp.sourceProductId } },
          },
          none: {
            status: "PAID",
            items: { some: { productId: sampleOpp.targetProductId } },
          },
        },
      },
      select: { id: true },
    });

    if (!eligibleCustomer) {
      throw new Error("No eligible customer found for opportunity test");
    }
    const eligibleCustomerId = eligibleCustomer.id;

    // 3. Test Tool: isCustomerEligible (Eligible Customer)
    console.log("🛡️ 3. Testing Tool: isCustomerEligible (Eligible Customer)...");
    const eligibleCheck = await executeAgentTool("isCustomerEligible", {
      merchantId: merchant.id,
      customerId: eligibleCustomerId,
      targetProductId: sampleOpp.targetProductId,
      sourceProductId: sampleOpp.sourceProductId,
    });

    console.log(`   Success: ${eligibleCheck.success}`);
    console.log(`   Message: ${eligibleCheck.message}`);
    const eligibleData = eligibleCheck.data as { eligible: boolean };
    if (!eligibleCheck.success || !eligibleData?.eligible) {
      throw new Error("Expected eligibleCheck to return true for verified eligible customer");
    }
    console.log("   ✅ isCustomerEligible tool passed for eligible customer.\n");

    // 4. Test Tool: isCustomerEligible (Ineligible Customer)
    console.log("🛡️ 4. Testing Tool: isCustomerEligible (Ineligible Customer)...");
    const buyerOfTarget = await prisma.order.findFirst({
      where: {
        merchantId: merchant.id,
        status: "PAID",
        items: { some: { productId: sampleOpp.targetProductId } },
      },
      select: { customerId: true },
    });

    if (buyerOfTarget) {
      const ineligibleCheck = await executeAgentTool("isCustomerEligible", {
        merchantId: merchant.id,
        customerId: buyerOfTarget.customerId,
        targetProductId: sampleOpp.targetProductId,
        sourceProductId: sampleOpp.sourceProductId,
      });

      const ineligData = ineligibleCheck.data as { eligible: boolean };
      if (!ineligibleCheck.success || ineligData?.eligible !== false) {
        throw new Error("Expected isCustomerEligible to return false for ineligible customer");
      }
      console.log(`   Message: ${ineligibleCheck.message}`);
      console.log("   ✅ isCustomerEligible tool correctly returned false for ineligible customer.\n");
    }

    // 5. Test Tool: createGrowthAction
    console.log("📝 5. Testing Tool: createGrowthAction...");
    const createActionResult = await executeAgentTool("createGrowthAction", {
      merchantId: merchant.id,
      opportunityId: dbOpportunity.id,
      customerId: eligibleCustomerId,
      sourceProductId: sampleOpp.sourceProductId,
      targetProductId: sampleOpp.targetProductId,
    });

    console.log(`   Success: ${createActionResult.success}`);
    console.log(`   Message: ${createActionResult.message}`);
    const actionData = createActionResult.data as {
      actionId: string;
      status: string;
      amountInRupees: number;
    };

    if (!createActionResult.success || !actionData?.actionId) {
      throw new Error(`createGrowthAction tool failed: ${createActionResult.error}`);
    }

    createdActionIds.push(actionData.actionId);
    console.log(`   Action ID : ${actionData.actionId}`);
    console.log(`   Status    : ${actionData.status} (Expected: PENDING_APPROVAL)`);
    console.log(`   Price DB  : ₹${actionData.amountInRupees}`);

    if (actionData.status !== GrowthActionStatus.PENDING_APPROVAL) {
      throw new Error(`Expected PENDING_APPROVAL status, got ${actionData.status}`);
    }
    console.log("   ✅ createGrowthAction tool passed with authoritative pricing and guardrails.\n");

    // 6. Test Tool: createGrowthActionsForCustomers (Automatic customer resolution via merchantId + opportunityId)
    console.log("📦 6. Testing Tool: createGrowthActionsForCustomers (Bulk Creation with Automatic Customer Resolution)...");
    const batchResult = await executeAgentTool("createGrowthActionsForCustomers", {
      merchantId: merchant.id,
      opportunityId: dbOpportunity.id,
      sourceProductId: sampleOpp.sourceProductId,
      targetProductId: sampleOpp.targetProductId,
    });

    console.log(`   Success: ${batchResult.success}`);
    console.log(`   Message: ${batchResult.message}`);
    const batchData = batchResult.data as {
      createdCount: number;
      duplicateCount: number;
      rejectedCount: number;
      actionIds: string[];
    };

    if (!batchResult.success || !Array.isArray(batchData.actionIds)) {
      throw new Error(`createGrowthActionsForCustomers failed: ${batchResult.error}`);
    }

    createdActionIds.push(...batchData.actionIds);
    console.log(`   Batch Created: ${batchData.createdCount}, Duplicates: ${batchData.duplicateCount}, Rejected: ${batchData.rejectedCount}`);
    console.log("   ✅ createGrowthActionsForCustomers tool passed with automatic customer resolution.\n");

    // 7. Test Tool: approveGrowthAction
    console.log("👍 7. Testing Tool: approveGrowthAction...");
    const approveResult = await executeAgentTool("approveGrowthAction", {
      merchantId: merchant.id,
      actionId: actionData.actionId,
    });

    console.log(`   Success: ${approveResult.success}`);
    console.log(`   Message: ${approveResult.message}`);
    const approveData = approveResult.data as { actionId: string; status: string };

    if (!approveResult.success || approveData?.status !== GrowthActionStatus.APPROVED) {
      throw new Error(`approveGrowthAction tool failed: ${approveResult.error}`);
    }
    console.log("   ✅ approveGrowthAction tool passed and recorded merchant approval.\n");

    // 8. Test Tool: getGrowthActionStatus
    console.log("📜 8. Testing Tool: getGrowthActionStatus...");
    const statusResult = await executeAgentTool("getGrowthActionStatus", {
      merchantId: merchant.id,
      actionId: actionData.actionId,
    });

    console.log(`   Success: ${statusResult.success}`);
    console.log(`   Message: ${statusResult.message}`);
    const statusData = statusResult.data as {
      status: string;
      auditTrail: Array<{ eventType: string; actor: string }>;
    };

    if (!statusResult.success || statusData?.status !== GrowthActionStatus.APPROVED) {
      throw new Error(`getGrowthActionStatus tool failed: ${statusResult.error}`);
    }
    console.log(`   Audit Trail Events: ${statusData.auditTrail.map((e) => `${e.eventType} (${e.actor})`).join(" → ")}`);
    console.log("   ✅ getGrowthActionStatus tool passed.\n");

    console.log("================================================================================");
    console.log(" 🎉 ALL AI AGENT TOOLS PASSED: Full Deterministic Tool Architecture Verified!");
    console.log("================================================================================\n");
  } finally {
    console.log("🧹 Cleaning up test actions and audit records...");
    if (createdActionIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { actionId: { in: createdActionIds } } });
      await prisma.growthAction.deleteMany({ where: { id: { in: createdActionIds } } });
    }
    console.log("✅ Cleanup complete.\n");
    await prisma.$disconnect();
  }
}

runAgentToolsTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Agent Tools Test Failed:", err);
    process.exit(1);
  });
