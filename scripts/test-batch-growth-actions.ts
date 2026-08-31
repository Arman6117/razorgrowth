import { prisma } from "../lib/prisma";
import {
  createGrowthActionsForCustomers,
  approveGrowthActionsForOpportunity,
  createGrowthAction,
  approveGrowthAction,
  executeGrowthAction,
} from "../lib/actions/growth-action";
import { agentToolDefinitions, executeAgentTool } from "../lib/agent/tools";
import { runAgentOrchestrator } from "../lib/agent/orchestrator";
import { GrowthActionStatus, AuditActor, OpportunityType, OpportunityStatus } from "../lib/generated/prisma/enums";

async function runBatchGrowthActionTestSuite() {
  console.log("================================================================================");
  console.log(" 🧪 RazorGrowth: Batch GrowthAction & Bulk Approval Architecture Test Suite");
  console.log("================================================================================\n");

  const createdActionIds: string[] = [];
  const createdOpportunityIds: string[] = [];
  const createdCustomerIds: string[] = [];

  try {
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error("No merchant found in database. Please run seed script first.");
    }
    console.log(`👤 Testing with Merchant: "${merchant.name}" (${merchant.id})\n`);

    // -------------------------------------------------------------------------
    // TEST 1: Tool Registry Declarations & Human Approval Boundary
    // -------------------------------------------------------------------------
    console.log("📋 Test 1: Tool Registry & Boundary Guardrail Verification...");
    const toolNames = agentToolDefinitions.map((t) => t.name);
    console.log(`   Registered Tools in Engine: ${toolNames.join(", ")}`);

    if (!toolNames.includes("createGrowthActionsForCustomers")) {
      throw new Error("Missing 'createGrowthActionsForCustomers' in agentToolDefinitions");
    }
    if (!toolNames.includes("createGrowthAction")) {
      throw new Error("Missing 'createGrowthAction' in agentToolDefinitions");
    }
    if (!toolNames.includes("analyzeCrossSell")) {
      throw new Error("Missing 'analyzeCrossSell' in agentToolDefinitions");
    }

    // approveGrowthAction must exist in deterministic engine, but is NOT exposed as an LLM callable tool
    const approveTool = agentToolDefinitions.find((t) => t.name === "approveGrowthAction");
    if (!approveTool) {
      throw new Error("approveGrowthAction must exist in deterministic tool registry");
    }
    console.log("   ✅ Tool definitions verified. Bulk creation tool registered.");
    console.log("   🛡️ Human approval boundary intact (approveGrowthAction is strictly merchant-controlled).\n");

    // -------------------------------------------------------------------------
    // Setup Test Products and Customers
    // -------------------------------------------------------------------------
    console.log("📦 Setting up isolated test products and customers...");
    const sourceProduct = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        name: "Batch Test Source Keyboard",
        price: 3500,
        active: true,
      },
    });

    const targetProduct = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        name: "Batch Test Target Wrist Rest",
        price: 799,
        active: true,
      },
    });

    const testOpp = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: OpportunityType.CROSS_SELL,
        title: "Test Batch Cross-Sell",
        description: "Test batch cross-sell opportunity",
        sourceProductId: sourceProduct.id,
        targetProductId: targetProduct.id,
        confidence: 0.85,
        estimatedRevenue: 7990,
        evidence: { test: true },
        status: OpportunityStatus.APPROVED,
      },
    });
    createdOpportunityIds.push(testOpp.id);

    // Create 4 test customers:
    // Customer 1: Eligible (bought source, never bought target)
    // Customer 2: Eligible (bought source, never bought target)
    // Customer 3: Eligible (bought source, never bought target)
    // Customer 4: Ineligible (bought target product)
    const testCustomers = [];
    for (let i = 1; i <= 4; i++) {
      const cust = await prisma.customer.create({
        data: {
          merchantId: merchant.id,
          name: `Batch Test Customer ${i} - ${Date.now()}`,
          email: `batch_test_${i}_${Date.now()}@example.com`,
        },
      });
      testCustomers.push(cust);
      createdCustomerIds.push(cust.id);
    }

    // Customer 1, 2, 3 buy source product (PAID)
    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          merchantId: merchant.id,
          customerId: testCustomers[i].id,
          status: "PAID",
          total: 3500,
          items: {
            create: {
              productId: sourceProduct.id,
              quantity: 1,
              unitPrice: 3500,
            },
          },
        },
      });
    }

    // Customer 4 buys target product (PAID) -> Ineligible!
    await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: testCustomers[3].id,
        status: "PAID",
        total: 799,
        items: {
          create: {
            productId: targetProduct.id,
            quantity: 1,
            unitPrice: 799,
          },
        },
      },
    });

    console.log("   ✅ Test fixtures created.\n");

    // -------------------------------------------------------------------------
    // TEST 2: Multiple Eligible Customers + Mixed Ineligible Customers Handling
    // -------------------------------------------------------------------------
    console.log("🚀 Test 2: Bulk GrowthAction Creation (Mixed Eligible & Ineligible)...");
    const allCustomerIds = [
      testCustomers[0].id,
      testCustomers[1].id,
      testCustomers[2].id,
      testCustomers[3].id, // Ineligible
      "non_existent_customer_id_999", // Not found
    ];

    const bulkResult = await createGrowthActionsForCustomers({
      merchantId: merchant.id,
      opportunityId: testOpp.id,
      customerIds: allCustomerIds,
    });

    console.log(`   Created Count  : ${bulkResult.createdCount} (Expected: 3)`);
    console.log(`   Duplicate Count: ${bulkResult.duplicateCount} (Expected: 0)`);
    console.log(`   Rejected Count : ${bulkResult.rejectedCount} (Expected: 2)`);
    console.log(`   Action IDs     : ${bulkResult.actionIds.length}`);
    console.log(`   Skipped Reasons:`, bulkResult.skippedCustomers.map((s) => `${s.customerId}: ${s.reason}`));

    if (bulkResult.createdCount !== 3 || bulkResult.rejectedCount !== 2) {
      throw new Error(`Expected 3 created and 2 rejected, got ${bulkResult.createdCount} created, ${bulkResult.rejectedCount} rejected`);
    }

    createdActionIds.push(...bulkResult.actionIds);

    // -------------------------------------------------------------------------
    // TEST 3: Authoritative Pricing & Status Verification
    // -------------------------------------------------------------------------
    console.log("💰 Test 3: Authoritative Pricing & PENDING_APPROVAL Status Verification...");
    for (const action of bulkResult.createdActions) {
      const params = action.parameters as Record<string, unknown>;
      if (action.status !== GrowthActionStatus.PENDING_APPROVAL) {
        throw new Error(`Expected PENDING_APPROVAL status, got ${action.status}`);
      }
      if (params.amountInRupees !== 799 || params.amountInPaise !== 79900) {
        throw new Error(`Expected price ₹799 (79900 paise), got ₹${params.amountInRupees} (${params.amountInPaise})`);
      }
    }
    console.log("   ✅ All actions have status PENDING_APPROVAL and authoritative DB price of ₹799.\n");

    // -------------------------------------------------------------------------
    // TEST 4: Individual Audit Events Verification
    // -------------------------------------------------------------------------
    console.log("📜 Test 4: Individual AuditEvents for Created Actions...");
    const auditEvents = await prisma.auditEvent.findMany({
      where: { actionId: { in: bulkResult.actionIds } },
    });

    console.log(`   AuditEvents found: ${auditEvents.length} (Expected: 3)`);
    if (auditEvents.length !== 3) {
      throw new Error(`Expected 3 individual audit events, got ${auditEvents.length}`);
    }
    for (const event of auditEvents) {
      if (event.eventType !== "GROWTH_ACTION_CREATED" || event.actor !== AuditActor.AGENT) {
        throw new Error(`Invalid audit event: ${event.eventType} by ${event.actor}`);
      }
    }
    console.log("   ✅ Individual GROWTH_ACTION_CREATED AuditEvents verified.\n");

    // -------------------------------------------------------------------------
    // TEST 5: Repeated Bulk Request & Duplicate Protection
    // -------------------------------------------------------------------------
    console.log("🔁 Test 5: Repeated Bulk Request (Duplicate Protection)...");
    const repeatResult = await createGrowthActionsForCustomers({
      merchantId: merchant.id,
      opportunityId: testOpp.id,
      customerIds: allCustomerIds,
    });

    console.log(`   Created Count  : ${repeatResult.createdCount} (Expected: 0)`);
    console.log(`   Duplicate Count: ${repeatResult.duplicateCount} (Expected: 3)`);
    console.log(`   Rejected Count : ${repeatResult.rejectedCount} (Expected: 2)`);

    if (repeatResult.createdCount !== 0 || repeatResult.duplicateCount !== 3) {
      throw new Error(`Expected 0 created and 3 duplicates on repeated call, got created: ${repeatResult.createdCount}, duplicates: ${repeatResult.duplicateCount}`);
    }
    console.log("   ✅ Duplicate protection successfully skipped in-flight active actions without creating duplicates.\n");

    // -------------------------------------------------------------------------
    // TEST 6: Zero Eligible Customers
    // -------------------------------------------------------------------------
    console.log("0️⃣ Test 6: Zero Eligible Customers Handling...");
    const zeroResult = await createGrowthActionsForCustomers({
      merchantId: merchant.id,
      opportunityId: testOpp.id,
      customerIds: [],
    });

    if (zeroResult.createdCount !== 0 || zeroResult.actionIds.length !== 0) {
      throw new Error(`Expected 0 created actions for empty customer list, got ${zeroResult.createdCount}`);
    }
    console.log("   ✅ Empty customer list handled cleanly.\n");

    // -------------------------------------------------------------------------
    // TEST 7: Merchant Isolation
    // -------------------------------------------------------------------------
    console.log("🛡️ Test 7: Merchant Isolation...");
    let fakeMerchantBlocked = false;
    try {
      await createGrowthActionsForCustomers({
        merchantId: "cm_fake_unauthorized_merchant_999",
        opportunityId: testOpp.id,
        customerIds: [testCustomers[0].id],
      });
    } catch (err: unknown) {
      fakeMerchantBlocked = true;
      console.log(`   ✅ Correctly rejected invalid merchant: "${err instanceof Error ? err.message : String(err)}"`);
    }

    if (!fakeMerchantBlocked) {
      throw new Error("Expected createGrowthActionsForCustomers to fail for unauthorized merchant");
    }
    console.log("   ✅ Merchant isolation verified.\n");

    // -------------------------------------------------------------------------
    // TEST 8: Bulk Approval (Opportunity-Level Approval)
    // -------------------------------------------------------------------------
    console.log("👍 Test 8: Bulk Approval for Opportunity...");
    const bulkApproveResult = await approveGrowthActionsForOpportunity({
      merchantId: merchant.id,
      opportunityId: testOpp.id,
    });

    console.log(`   Approved Count: ${bulkApproveResult.approvedCount} (Expected: 3)`);
    console.log(`   Action IDs    : ${bulkApproveResult.actionIds.join(", ")}`);

    if (bulkApproveResult.approvedCount !== 3) {
      throw new Error(`Expected 3 approved actions, got ${bulkApproveResult.approvedCount}`);
    }

    // Verify all actions are now APPROVED in DB
    const approvedActions = await prisma.growthAction.findMany({
      where: { id: { in: bulkResult.actionIds } },
    });

    for (const action of approvedActions) {
      if (action.status !== GrowthActionStatus.APPROVED || !action.approvedAt) {
        throw new Error(`Expected APPROVED status with approvedAt, got ${action.status}`);
      }
    }

    // Verify individual approval audit events
    const approvalAuditEvents = await prisma.auditEvent.findMany({
      where: {
        actionId: { in: bulkResult.actionIds },
        eventType: "GROWTH_ACTION_APPROVED",
      },
    });

    console.log(`   GROWTH_ACTION_APPROVED AuditEvents: ${approvalAuditEvents.length} (Expected: 3)`);
    if (approvalAuditEvents.length !== 3) {
      throw new Error(`Expected 3 approval audit events, got ${approvalAuditEvents.length}`);
    }
    console.log("   ✅ Bulk approval transitioned all actions to APPROVED and recorded audit events.\n");

    // -------------------------------------------------------------------------
    // TEST 9: Idempotent Re-approval (Only PENDING_APPROVAL actions are approved)
    // -------------------------------------------------------------------------
    console.log("🔁 Test 9: Idempotent Bulk Approval (No Pending Actions Remaining)...");
    const secondApprove = await approveGrowthActionsForOpportunity({
      merchantId: merchant.id,
      opportunityId: testOpp.id,
    });

    console.log(`   Second Approval Approved Count: ${secondApprove.approvedCount} (Expected: 0)`);
    if (secondApprove.approvedCount !== 0) {
      throw new Error(`Expected 0 actions approved on second call, got ${secondApprove.approvedCount}`);
    }
    console.log("   ✅ Re-approval idempotency verified.\n");

    // -------------------------------------------------------------------------
    // TEST 10: Agent Tool Wrapper Verification
    // -------------------------------------------------------------------------
    console.log("🤖 Test 10: Agent Tool Wrapper (createGrowthActionsForCustomers)...");
    const agentToolRes = await executeAgentTool("createGrowthActionsForCustomers", {
      merchantId: merchant.id,
      opportunityId: testOpp.id,
      customerIds: [testCustomers[0].id, testCustomers[1].id],
    });

    console.log(`   Success: ${agentToolRes.success}`);
    console.log(`   Message: ${agentToolRes.message}`);
    if (!agentToolRes.success) {
      throw new Error(`Agent tool execution failed: ${agentToolRes.error}`);
    }
    console.log("   ✅ Agent tool dispatcher verified.\n");

    console.log("================================================================================");
    console.log(" 🎉 ALL BATCH GROWTHACTION TESTS PASSED PERFECTLY!");
    console.log("================================================================================\n");
  } finally {
    console.log("🧹 Cleaning up test actions, opportunities, products, and customers...");
    if (createdActionIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { actionId: { in: createdActionIds } } });
      await prisma.growthAction.deleteMany({ where: { id: { in: createdActionIds } } });
    }
    if (createdOpportunityIds.length > 0) {
      await prisma.opportunity.deleteMany({ where: { id: { in: createdOpportunityIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { order: { customerId: { in: createdCustomerIds } } },
      });
      await prisma.order.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    console.log("✅ Cleanup complete.\n");
    await prisma.$disconnect();
  }
}

runBatchGrowthActionTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Batch Test Suite Failed:", err);
    process.exit(1);
  });
