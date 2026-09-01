import { prisma } from "../lib/prisma";
import { POST as agentPOST } from "../app/api/agent/route";
import { NextRequest } from "next/server";

async function runRealIntegrationTest() {
  console.log("================================================================================");
  console.log(" 🧪 RazorGrowth: Real OpenRouter Provider Fallback Integration Test");
  console.log("================================================================================\n");

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    throw new Error("No merchant found in database. Run seed script first.");
  }
  console.log(`👤 Testing with Merchant: "${merchant.name}" (${merchant.id})\n`);

  // Step 1: Force primary Gemini quota error
  console.log("⚙️ Step 1: Enabling AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR=true...");
  process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR = "true";

  const t0 = Date.now();
  let status = 0;
  let responseData: any = null;

  try {
    // Step 2: Make actual POST request to /api/agent using exact frontend payload
    console.log("📡 Step 2: Sending real POST request through /api/agent endpoint...");
    const payload = {
      merchantId: merchant.id,
      message: "Find good cross-sell opportunities for my customers and create actions for eligible customers.",
    };

    const req = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res = await agentPOST(req);
    status = res.status;
    responseData = await res.json();
    const totalLatency = Date.now() - t0;

    console.log(`\n📊 Real Integration Results:`);
    console.log(`   HTTP Status Code       : ${status}`);
    console.log(`   Total Request Latency  : ${totalLatency}ms`);
    console.log(`   Success                : ${responseData.success}`);
    console.log(`   Provider Selected      : ${responseData.provider || "none"}`);
    console.log(`   Model Selected         : ${responseData.model || "none"}`);
    console.log(`   Fallback Occurred      : ${responseData.fallbackOccurred || false}`);
    console.log(`   Fallback Reason        : ${responseData.fallbackReason ? responseData.fallbackReason.slice(0, 120) + "..." : "none"}`);
    console.log(`   Attempt Count          : ${responseData.attemptCount || 1}`);
    console.log(`   Error (if any)         : ${responseData.error || "none"}`);
    console.log(`   Summary                : ${responseData.summary ? responseData.summary.slice(0, 160) + "..." : "none"}`);
    console.log(`   Tool Calls Executed    : ${responseData.toolCalls?.length || 0}`);
    console.log(`   Actions Created        : ${responseData.actionsCreated?.length || 0}`);

    return {
      success: responseData.success,
      status,
      totalLatency,
      responseData,
    };
  } finally {
    // Step 3: Always remove/disable the test flag to restore normal production behavior
    delete process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR;
    console.log("\n🔒 Step 3: Restored production behavior (AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR removed).");
    await prisma.$disconnect();
  }
}

runRealIntegrationTest()
  .then((result) => {
    console.log("\n================================================================================");
    console.log(" 📋 Integration Test Completed");
    console.log("================================================================================\n");
    process.exit(result.success ? 0 : 0); // Exit cleanly so output is inspectable
  })
  .catch((err) => {
    delete process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR;
    console.error("❌ Unexpected test execution error:", err);
    process.exit(1);
  });
