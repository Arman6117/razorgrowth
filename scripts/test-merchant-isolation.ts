import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { createSession } from "../lib/auth/session";
import { GET as merchantGET } from "../app/api/merchant/route";
import { GET as oppsGET } from "../app/api/opportunities/route";
import { GET as oppCustomersGET } from "../app/api/opportunities/[id]/customers/route";
import { GET as actionsGET, POST as createActionPOST } from "../app/api/growth-actions/route";
import { GET as singleActionGET } from "../app/api/growth-actions/[id]/route";
import { POST as approveActionPOST } from "../app/api/growth-actions/[id]/approve/route";
import { POST as executeActionPOST } from "../app/api/growth-actions/[id]/execute/route";
import { POST as agentPOST } from "../app/api/agent/route";
import { NextRequest } from "next/server";
import { OpportunityType, GrowthActionType, GrowthActionStatus } from "../lib/generated/prisma/enums";

async function runMerchantIsolationTests() {
  console.log("================================================================================");
  console.log(" 🛡️ RazorGrowth: Multi-Tenant Merchant Isolation & Security Test Suite");
  console.log("================================================================================\n");

  const merchantA_Email = `merchant_a_${Date.now()}@alpha.test`;
  const merchantB_Email = `merchant_b_${Date.now()}@beta.test`;
  const password = "Password123!";

  let merchantA: any = null;
  let merchantB: any = null;
  let sessionA: any = null;
  let sessionB: any = null;

  const cleanupIds = {
    merchantIds: [] as string[],
    productIds: [] as string[],
    customerIds: [] as string[],
    opportunityIds: [] as string[],
    actionIds: [] as string[],
  };

  try {
    const passwordHash = await hashPassword(password);

    // 1. Create Merchant A & Merchant B
    console.log("🏢 1. Creating Isolated Merchants (Merchant A & Merchant B)...");
    merchantA = await prisma.merchant.create({
      data: {
        name: "Alpha Electronics",
        email: merchantA_Email,
        passwordHash,
        currency: "INR",
      },
    });
    cleanupIds.merchantIds.push(merchantA.id);

    merchantB = await prisma.merchant.create({
      data: {
        name: "Beta Fashion",
        email: merchantB_Email,
        passwordHash,
        currency: "INR",
      },
    });
    cleanupIds.merchantIds.push(merchantB.id);

    sessionA = await createSession(merchantA.id);
    sessionB = await createSession(merchantB.id);

    console.log(`   Merchant A: "${merchantA.name}" (${merchantA.id})`);
    console.log(`   Merchant B: "${merchantB.name}" (${merchantB.id})\n`);

    // 2. Create Products for Merchant A and Merchant B
    console.log("📦 2. Creating Tenant-Isolated Products and Customers...");
    const prodA1 = await prisma.product.create({
      data: { merchantId: merchantA.id, name: "Alpha Laptop", price: 50000, active: true },
    });
    const prodA2 = await prisma.product.create({
      data: { merchantId: merchantA.id, name: "Alpha Mouse", price: 1500, active: true },
    });
    cleanupIds.productIds.push(prodA1.id, prodA2.id);

    const prodB1 = await prisma.product.create({
      data: { merchantId: merchantB.id, name: "Beta Jacket", price: 4000, active: true },
    });
    const prodB2 = await prisma.product.create({
      data: { merchantId: merchantB.id, name: "Beta Shoes", price: 3000, active: true },
    });
    cleanupIds.productIds.push(prodB1.id, prodB2.id);

    // Create Customers
    const custA = await prisma.customer.create({
      data: { merchantId: merchantA.id, name: "Alpha Customer 1", email: `c1_${Date.now()}@alpha.test` },
    });
    cleanupIds.customerIds.push(custA.id);

    const custB = await prisma.customer.create({
      data: { merchantId: merchantB.id, name: "Beta Customer 1", email: `c1_${Date.now()}@beta.test` },
    });
    cleanupIds.customerIds.push(custB.id);

    // Create eligible paid orders
    const orderA = await prisma.order.create({
      data: {
        merchantId: merchantA.id,
        customerId: custA.id,
        status: "PAID",
        total: 50000,
        currency: "INR",
        items: {
          create: [{ productId: prodA1.id, quantity: 1, unitPrice: 50000 }],
        },
      },
    });

    const orderB = await prisma.order.create({
      data: {
        merchantId: merchantB.id,
        customerId: custB.id,
        status: "PAID",
        total: 4000,
        currency: "INR",
        items: {
          create: [{ productId: prodB1.id, quantity: 1, unitPrice: 4000 }],
        },
      },
    });

    // Create Opportunity for Merchant A and Merchant B
    const oppA = await prisma.opportunity.create({
      data: {
        merchantId: merchantA.id,
        type: OpportunityType.CROSS_SELL,
        title: "Alpha Cross-sell",
        description: "Alpha Laptop to Alpha Mouse",
        sourceProductId: prodA1.id,
        targetProductId: prodA2.id,
        confidence: 0.8,
        estimatedRevenue: 15000,
        evidence: {},
      },
    });
    cleanupIds.opportunityIds.push(oppA.id);

    const oppB = await prisma.opportunity.create({
      data: {
        merchantId: merchantB.id,
        type: OpportunityType.CROSS_SELL,
        title: "Beta Cross-sell",
        description: "Beta Jacket to Beta Shoes",
        sourceProductId: prodB1.id,
        targetProductId: prodB2.id,
        confidence: 0.85,
        estimatedRevenue: 30000,
        evidence: {},
      },
    });
    cleanupIds.opportunityIds.push(oppB.id);

    // Create GrowthAction for Merchant B
    const actionB = await prisma.growthAction.create({
      data: {
        merchantId: merchantB.id,
        opportunityId: oppB.id,
        type: GrowthActionType.CREATE_PAYMENT_LINK,
        status: GrowthActionStatus.PENDING_APPROVAL,
        parameters: {
          customerId: custB.id,
          targetProductId: prodB2.id,
          amountInRupees: 3000,
          amountInPaise: 300000,
        },
      },
    });
    cleanupIds.actionIds.push(actionB.id);

    console.log("   ✅ Tenant fixtures created.\n");

    const headersA = {
      "Content-Type": "application/json",
      Cookie: `razorgrowth_session=${sessionA.sessionToken}`,
    };

    const headersB = {
      "Content-Type": "application/json",
      Cookie: `razorgrowth_session=${sessionB.sessionToken}`,
    };

    // -------------------------------------------------------------------------
    // 3. Test: Merchant A can access A's data
    // -------------------------------------------------------------------------
    console.log("🔍 3. Verifying Merchant A Access to Own Data...");
    const getMerchantARes = await merchantGET(new NextRequest("http://localhost:3000/api/merchant", { headers: headersA }));
    const dataA = await getMerchantARes.json();
    console.log(`   GET /api/merchant for A -> Status: ${getMerchantARes.status}, Resolved: "${dataA.merchant?.name}"`);

    if (getMerchantARes.status !== 200 || dataA.merchant?.id !== merchantA.id) {
      throw new Error("Merchant A failed to retrieve own profile via session");
    }
    console.log("   ✅ Merchant A successfully accesses Merchant A data.\n");

    // -------------------------------------------------------------------------
    // 4. Test: Merchant A attempts to access Merchant B's Opportunity Customers
    // -------------------------------------------------------------------------
    console.log("🛡️ 4. Testing Parameter Tampering: Merchant A requests Merchant B's Opportunity Customers...");
    const attackReq1 = new NextRequest(`http://localhost:3000/api/opportunities/${oppB.id}/customers`, {
      headers: headersA, // Authenticated as A, but requesting B's opportunity
    });
    const attackRes1 = await oppCustomersGET(attackReq1, { params: Promise.resolve({ id: oppB.id }) });
    console.log(`   Status: ${attackRes1.status} (Expected: 404 Not Found)`);

    if (attackRes1.status !== 404) {
      throw new Error(`Security violation: Merchant A was able to access Merchant B's opportunity customers (HTTP ${attackRes1.status})`);
    }
    console.log("   ✅ Server strictly blocked cross-tenant opportunity inspection.\n");

    // -------------------------------------------------------------------------
    // 5. Test: Merchant A attempts to view Merchant B's GrowthAction
    // -------------------------------------------------------------------------
    console.log("🛡️ 5. Testing URL Tampering: Merchant A attempts to fetch Merchant B's GrowthAction...");
    const attackReq2 = new NextRequest(`http://localhost:3000/api/growth-actions/${actionB.id}`, {
      headers: headersA,
    });
    const attackRes2 = await singleActionGET(attackReq2, { params: Promise.resolve({ id: actionB.id }) });
    console.log(`   Status: ${attackRes2.status} (Expected: 404 Not Found)`);

    if (attackRes2.status !== 404) {
      throw new Error(`Security violation: Merchant A was able to access Merchant B's GrowthAction (HTTP ${attackRes2.status})`);
    }
    console.log("   ✅ Server strictly blocked cross-tenant GrowthAction fetch.\n");

    // -------------------------------------------------------------------------
    // 6. Test: Merchant A attempts to APPROVE Merchant B's GrowthAction
    // -------------------------------------------------------------------------
    console.log("🛡️ 6. Testing Unauthorized State Mutation: Merchant A attempts to APPROVE Merchant B's Action...");
    const attackReq3 = new NextRequest(`http://localhost:3000/api/growth-actions/${actionB.id}/approve`, {
      method: "POST",
      headers: headersA,
      body: JSON.stringify({ actionId: actionB.id }),
    });
    const attackRes3 = await approveActionPOST(attackReq3, { params: Promise.resolve({ id: actionB.id }) });
    console.log(`   Status: ${attackRes3.status} (Expected: 404 Not Found)`);

    if (attackRes3.status !== 404) {
      throw new Error(`Security violation: Merchant A was able to approve Merchant B's GrowthAction (HTTP ${attackRes3.status})`);
    }
    console.log("   ✅ Server strictly blocked cross-tenant GrowthAction approval.\n");

    // -------------------------------------------------------------------------
    // 7. Test: Merchant A attempts to CREATE an action forcing Merchant B's ID in body
    // -------------------------------------------------------------------------
    console.log("🛡️ 7. Testing Body Spoofing: Merchant A submits creation request with merchantId='B' in JSON body...");
    const attackReq4 = new NextRequest(`http://localhost:3000/api/growth-actions`, {
      method: "POST",
      headers: headersA,
      body: JSON.stringify({
        merchantId: merchantB.id, // Client spoofing attempt
        opportunityId: oppA.id,
        customerId: custA.id,
        targetProductId: prodA2.id,
      }),
    });
    const attackRes4 = await createActionPOST(attackReq4);
    const createdActionData = await attackRes4.json();
    console.log(`   Status: ${attackRes4.status}`);
    console.log(`   Created Action Owner: ${createdActionData.action?.merchantId} (Expected: Merchant A's ID)`);

    if (createdActionData.action?.merchantId !== merchantA.id) {
      throw new Error("Security violation: Server respected client-supplied merchantId instead of session merchant");
    }
    cleanupIds.actionIds.push(createdActionData.action.id);
    console.log("   ✅ Server completely ignored spoofed merchantId and enforced session identity.\n");

    // -------------------------------------------------------------------------
    // 8. Test: Merchant B can access B's own data and approve B's action
    // -------------------------------------------------------------------------
    console.log("🔍 8. Verifying Merchant B Authorized Access to Own Data...");
    const approveReqB = new NextRequest(`http://localhost:3000/api/growth-actions/${actionB.id}/approve`, {
      method: "POST",
      headers: headersB,
      body: JSON.stringify({ actionId: actionB.id }),
    });
    const approveResB = await approveActionPOST(approveReqB, { params: Promise.resolve({ id: actionB.id }) });
    console.log(`   Merchant B approving own action -> Status: ${approveResB.status} (Expected: 200 OK)`);

    if (approveResB.status !== 200) {
      throw new Error("Merchant B was unexpectedly blocked from approving own action");
    }
    console.log("   ✅ Merchant B successfully approved own action.\n");

    console.log("================================================================================");
    console.log(" 🎉 ALL MULTI-TENANT ISOLATION & SECURITY CHECKS PASSED 100%!");
    console.log("================================================================================\n");
  } finally {
    console.log("🧹 Cleaning up multi-tenant test fixtures...");
    if (cleanupIds.actionIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { actionId: { in: cleanupIds.actionIds } } });
      await prisma.growthAction.deleteMany({ where: { id: { in: cleanupIds.actionIds } } });
    }
    if (cleanupIds.opportunityIds.length > 0) {
      await prisma.opportunity.deleteMany({ where: { id: { in: cleanupIds.opportunityIds } } });
    }
    if (cleanupIds.merchantIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { order: { merchantId: { in: cleanupIds.merchantIds } } } });
      await prisma.order.deleteMany({ where: { merchantId: { in: cleanupIds.merchantIds } } });
    }
    if (cleanupIds.customerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: cleanupIds.customerIds } } });
    }
    if (cleanupIds.productIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: cleanupIds.productIds } } });
    }
    if (cleanupIds.merchantIds.length > 0) {
      await prisma.session.deleteMany({ where: { merchantId: { in: cleanupIds.merchantIds } } });
      await prisma.merchant.deleteMany({ where: { id: { in: cleanupIds.merchantIds } } });
    }
    console.log("✅ Cleanup complete.");
    await prisma.$disconnect();
  }
}

runMerchantIsolationTests().catch((err) => {
  console.error("❌ Isolation test failed:", err);
  process.exit(1);
});
