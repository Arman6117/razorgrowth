import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  createGrowthAction,
  createGrowthActionsForCustomers,
  getGrowthAction,
} from "../lib/actions/growth-action";
import {
  GrowthActionStatus,
  OpportunityType,
  OpportunityStatus,
  AuditActor,
} from "../lib/generated/prisma/enums";

describe("GROWTH ACTION CONCURRENT CREATION & DUPLICATE SAFETY", () => {
  let merchantAId: string;
  let merchantBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let productB1Id: string;
  let productB2Id: string;

  async function createEligibleCustomer(merchantId: string, name: string, sourceProductId: string) {
    const customer = await prisma.customer.create({
      data: {
        merchantId,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      },
    });

    const order = await prisma.order.create({
      data: {
        merchantId,
        customerId: customer.id,
        status: "PAID",
        total: 50000,
        currency: "INR",
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: sourceProductId,
        quantity: 1,
        unitPrice: 50000,
      },
    });

    return customer;
  }

  async function createTestOpportunity(merchantId: string, title: string, sourceProductId: string, targetProductId: string) {
    return prisma.opportunity.create({
      data: {
        merchantId,
        type: OpportunityType.CROSS_SELL,
        title,
        description: "Creation race test opportunity",
        sourceProductId,
        targetProductId,
        confidence: 0.85,
        estimatedRevenue: 2500,
        evidence: {},
        status: OpportunityStatus.APPROVED,
      },
    });
  }

  before(async () => {
    // Create Merchants
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Creation Race Merchant A",
        email: `create_race_merchantA_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: "Creation Race Merchant B",
        email: `create_race_merchantB_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // Create Products for Merchant A
    const productA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Merchant A Source Laptop",
        price: 50000,
        category: "Computers",
        active: true,
      },
    });
    productA1Id = productA1.id;

    const productA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Merchant A Target Mouse",
        price: 2000,
        category: "Accessories",
        active: true,
      },
    });
    productA2Id = productA2.id;

    // Create Products for Merchant B
    const productB1 = await prisma.product.create({
      data: {
        merchantId: merchantBId,
        name: "Merchant B Source Laptop",
        price: 50000,
        category: "Computers",
        active: true,
      },
    });
    productB1Id = productB1.id;

    const productB2 = await prisma.product.create({
      data: {
        merchantId: merchantBId,
        name: "Merchant B Target Mouse",
        price: 2000,
        category: "Accessories",
        active: true,
      },
    });
    productB2Id = productB2.id;
  });

  after(async () => {
    // Cleanup
    await prisma.auditEvent.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.growthAction.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.opportunity.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { merchantId: { in: [merchantAId, merchantBId] } } },
    });
    await prisma.order.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.customer.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.product.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [merchantAId, merchantBId] } },
    });

    await prisma.$disconnect();
  });

  it("A: Single creation happy path — creates exactly one GrowthAction and AuditEvent", async () => {
    const customer = await createEligibleCustomer(merchantAId, "Single Customer A", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Single Opp A", productA1Id, productA2Id);

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    assert.equal(action.status, GrowthActionStatus.PENDING_APPROVAL);
    assert.equal(action.opportunityId, opp.id);

    const audits = await prisma.auditEvent.findMany({
      where: { actionId: action.id, eventType: "GROWTH_ACTION_CREATED" },
    });
    assert.equal(audits.length, 1, "Exactly one GROWTH_ACTION_CREATED audit event must be created");
  });

  it("B: Existing duplicate — sequential creation returns existing in-flight action idempotently", async () => {
    const customer = await createEligibleCustomer(merchantAId, "Single Customer B", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Single Opp B", productA1Id, productA2Id);

    const first = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    const second = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    assert.equal(first.id, second.id, "Second call must return the exact existing action");

    const count = await prisma.growthAction.count({
      where: {
        merchantId: merchantAId,
        opportunityId: opp.id,
      },
    });
    assert.equal(count, 1, "Only one action must exist in database");

    const audits = await prisma.auditEvent.findMany({
      where: { actionId: first.id, eventType: "GROWTH_ACTION_CREATED" },
    });
    assert.equal(audits.length, 1, "No duplicate audit event created on idempotent return");
  });

  it("C: Single creation race — two simultaneous createGrowthAction calls for the same customer", async () => {
    const customer = await createEligibleCustomer(merchantAId, "Race Customer C", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Race Opp C", productA1Id, productA2Id);

    // Trigger 2 concurrent creation calls simultaneously
    const results = await Promise.all([
      createGrowthAction({
        merchantId: merchantAId,
        opportunityId: opp.id,
        customerId: customer.id,
        targetProductId: productA2Id,
        sourceProductId: productA1Id,
      }),
      createGrowthAction({
        merchantId: merchantAId,
        opportunityId: opp.id,
        customerId: customer.id,
        targetProductId: productA2Id,
        sourceProductId: productA1Id,
      }),
    ]);

    assert.equal(results[0].id, results[1].id, "Both racing calls must resolve to the SAME GrowthAction ID");

    // Verify exactly ONE GrowthAction was created in DB
    const allActions = await prisma.growthAction.findMany({
      where: {
        merchantId: merchantAId,
        opportunityId: opp.id,
      },
    });
    assert.equal(allActions.length, 1, "Exactly one GrowthAction must exist in DB");

    // Verify exactly ONE creation audit event was created
    const audits = await prisma.auditEvent.findMany({
      where: { actionId: allActions[0].id, eventType: "GROWTH_ACTION_CREATED" },
    });
    assert.equal(audits.length, 1, "Exactly ONE creation audit event exists, zero duplicate audits");
  });

  it("D: Bulk creation happy path — creates expected number of actions using set-based batch", async () => {
    const customer1 = await createEligibleCustomer(merchantAId, "Bulk Cust 1", productA1Id);
    const customer2 = await createEligibleCustomer(merchantAId, "Bulk Cust 2", productA1Id);
    const customer3 = await createEligibleCustomer(merchantAId, "Bulk Cust 3", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Bulk Opp D", productA1Id, productA2Id);

    const result = await createGrowthActionsForCustomers({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerIds: [customer1.id, customer2.id, customer3.id],
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    assert.equal(result.createdCount, 3);
    assert.equal(result.duplicateCount, 0);
    assert.equal(result.actionIds.length, 3);

    const actionsInDb = await prisma.growthAction.findMany({
      where: { opportunityId: opp.id },
    });
    assert.equal(actionsInDb.length, 3);

    const audits = await prisma.auditEvent.findMany({
      where: { actionId: { in: result.actionIds }, eventType: "GROWTH_ACTION_CREATED" },
    });
    assert.equal(audits.length, 3, "Exactly 3 audit events created for 3 actions");
  });

  it("E: Bulk duplicate protection — running bulk creation twice skips duplicates", async () => {
    const customer1 = await createEligibleCustomer(merchantAId, "Bulk Cust 4", productA1Id);
    const customer2 = await createEligibleCustomer(merchantAId, "Bulk Cust 5", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Bulk Opp E", productA1Id, productA2Id);

    const firstResult = await createGrowthActionsForCustomers({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerIds: [customer1.id, customer2.id],
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });
    assert.equal(firstResult.createdCount, 2);

    const secondResult = await createGrowthActionsForCustomers({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerIds: [customer1.id, customer2.id],
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });
    assert.equal(secondResult.createdCount, 0, "Second bulk run must create 0 new actions");
    assert.equal(secondResult.duplicateCount, 2, "Second bulk run must identify 2 duplicates");
    assert.equal(secondResult.actionIds.length, 0);

    const actionsInDb = await prisma.growthAction.findMany({
      where: { opportunityId: opp.id },
    });
    assert.equal(actionsInDb.length, 2, "Total actions in DB remains 2");
  });

  it("F: Concurrent bulk creation — two simultaneous bulk creation requests for same opportunity", async () => {
    const customer1 = await createEligibleCustomer(merchantAId, "Race Bulk Cust 1", productA1Id);
    const customer2 = await createEligibleCustomer(merchantAId, "Race Bulk Cust 2", productA1Id);
    const customer3 = await createEligibleCustomer(merchantAId, "Race Bulk Cust 3", productA1Id);
    const opp = await createTestOpportunity(merchantAId, "Race Bulk Opp F", productA1Id, productA2Id);

    // Run 2 simultaneous bulk creation requests for the same 3 customers
    const [res1, res2] = await Promise.all([
      createGrowthActionsForCustomers({
        merchantId: merchantAId,
        opportunityId: opp.id,
        customerIds: [customer1.id, customer2.id, customer3.id],
        targetProductId: productA2Id,
        sourceProductId: productA1Id,
      }),
      createGrowthActionsForCustomers({
        merchantId: merchantAId,
        opportunityId: opp.id,
        customerIds: [customer1.id, customer2.id, customer3.id],
        targetProductId: productA2Id,
        sourceProductId: productA1Id,
      }),
    ]);

    const totalCreated = res1.createdCount + res2.createdCount;
    const totalDuplicates = res1.duplicateCount + res2.duplicateCount;

    assert.equal(totalCreated, 3, "Across both racing calls, exactly 3 actions must be created");
    assert.equal(totalDuplicates, 3, "Across both racing calls, exactly 3 duplicates must be caught");

    // Total actions in DB must be exactly 3
    const actionsInDb = await prisma.growthAction.findMany({
      where: { opportunityId: opp.id },
    });
    assert.equal(actionsInDb.length, 3, "Zero duplicate actions in DB");

    // Total audit events must be exactly 3
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: { in: actionsInDb.map((a) => a.id) },
        eventType: "GROWTH_ACTION_CREATED",
      },
    });
    assert.equal(audits.length, 3, "Audit trail reflects exactly 3 created actions, zero duplicate audits");
  });

  it("G: Tenant isolation — Merchant A and Merchant B can create actions independently without collisions", async () => {
    const customerA = await createEligibleCustomer(merchantAId, "Tenant Cust A", productA1Id);
    const oppA = await createTestOpportunity(merchantAId, "Tenant Opp A", productA1Id, productA2Id);

    const customerB = await createEligibleCustomer(merchantBId, "Tenant Cust B", productB1Id);
    const oppB = await createTestOpportunity(merchantBId, "Tenant Opp B", productB1Id, productB2Id);

    const [actionA, actionB] = await Promise.all([
      createGrowthAction({
        merchantId: merchantAId,
        opportunityId: oppA.id,
        customerId: customerA.id,
        targetProductId: productA2Id,
        sourceProductId: productA1Id,
      }),
      createGrowthAction({
        merchantId: merchantBId,
        opportunityId: oppB.id,
        customerId: customerB.id,
        targetProductId: productB2Id,
        sourceProductId: productB1Id,
      }),
    ]);

    assert.ok(actionA.id);
    assert.ok(actionB.id);
    assert.notEqual(actionA.id, actionB.id);
    assert.equal(actionA.merchantId, merchantAId);
    assert.equal(actionB.merchantId, merchantBId);
  });

  it("H: Existing eligibility rules remain intact (ineligible customers rejected)", async () => {
    // Customer who NEVER bought source product
    const ineligibleCust = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Ineligible Customer",
        email: `inelig_${Date.now()}@test.com`,
      },
    });

    const opp = await createTestOpportunity(merchantAId, "Ineligible Opp", productA1Id, productA2Id);

    await assert.rejects(
      async () => {
        await createGrowthAction({
          merchantId: merchantAId,
          opportunityId: opp.id,
          customerId: ineligibleCust.id,
          targetProductId: productA2Id,
          sourceProductId: productA1Id,
        });
      },
      /not eligible for this opportunity/
    );
  });
});
