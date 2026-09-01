import { prisma } from "../lib/prisma";
import { POST as agentRoutePOST } from "../app/api/agent/route";
import { NextRequest } from "next/server";

async function measureAgentLatency() {
  console.log("================================================================================");
  console.log(" ⏱️ RazorGrowth: End-to-End Latency Instrumentation & Profiling");
  console.log("================================================================================\n");

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    throw new Error("No merchant found in DB. Please run seed script first.");
  }
  console.log(`👤 Profiling for Merchant: "${merchant.name}" (${merchant.id})`);

  const promptMessage = "Find the strongest cross-sell opportunity and create growth actions for all eligible customers.";
  console.log(`📝 Exact Prompt: "${promptMessage}"\n`);

  const createdActionIds: string[] = [];

  try {
    const tHttpStart = performance.now();

    const req = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId: merchant.id,
        message: promptMessage,
      }),
    });

    const res = await agentRoutePOST(req);
    const tHttpEnd = performance.now();
    const totalHttpTimeMs = Math.round(tHttpEnd - tHttpStart);

    const json = await res.json();

    if (json.actionsCreated && Array.isArray(json.actionsCreated)) {
      for (const act of json.actionsCreated) {
        if (act.actionId) createdActionIds.push(act.actionId);
        else if (act.id) createdActionIds.push(act.id);
      }
    }

    console.log("\n================================================================================");
    console.log(" 📊 DETAILED PROFILING REPORT");
    console.log("================================================================================\n");

    console.log(`1. HTTP Route Overall:`);
    console.log(`   - HTTP Status Code : ${res.status}`);
    console.log(`   - Success          : ${json.success}`);
    console.log(`   - Total HTTP Time  : ${totalHttpTimeMs} ms`);

    const lb = json.latencyBreakdown;
    if (lb) {
      console.log(`\n2. Orchestrator Pipeline Breakdown:`);
      console.log(`   - DB Merchant Lookup : ${lb.dbMerchantCheckMs} ms`);
      console.log(`   - Orchestrator Total : ${lb.orchestratorTotalMs} ms`);
      console.log(`   - Response Synthesis : ${lb.synthesisMs} ms`);

      console.log(`\n3. LLM Generation Steps (${lb.llmSteps?.length || 0} steps):`);
      let totalLlmMs = 0;
      if (Array.isArray(lb.llmSteps)) {
        for (const s of lb.llmSteps) {
          totalLlmMs += s.durationMs;
          console.log(`   - Step #${s.step}: [${s.provider} / ${s.model}] -> ${s.durationMs} ms (${s.type}${s.toolNames?.length ? ` -> ${s.toolNames.join(", ")}` : ""})`);
        }
      }
      console.log(`   * Total LLM Time     : ${totalLlmMs} ms`);

      console.log(`\n4. Deterministic Tool Executions (${lb.toolExecutions?.length || 0} calls):`);
      let totalToolMs = 0;
      if (Array.isArray(lb.toolExecutions)) {
        for (const t of lb.toolExecutions) {
          totalToolMs += t.durationMs;
          console.log(`   - Tool '${t.toolName}': ${t.durationMs} ms ${t.payloadSizeKb ? `(Payload: ${t.payloadSizeKb} KB)` : ""} ${t.extraInfo ? `(${t.extraInfo})` : ""}`);
        }
      }
      console.log(`   * Total Tool Time    : ${totalToolMs} ms`);
    }

    console.log(`\n5. Workflow Artifacts & Results:`);
    console.log(`   - Opportunities Found : ${json.opportunitiesFound?.length || 0}`);
    console.log(`   - Tool Calls Recorded : ${json.toolCalls?.map((tc: any) => tc.toolName).join(" → ") || "none"}`);
    console.log(`   - Actions Created     : ${json.actionsCreated?.length || 0}`);
    console.log(`   - Summary Text Length : ${json.summary?.length || 0} chars`);
    console.log(`   - Summary Preview     : "${json.summary?.slice(0, 160).replace(/\n/g, " ")}..."`);

    return {
      success: json.success,
      totalHttpTimeMs,
      json,
    };
  } finally {
    if (createdActionIds.length > 0) {
      console.log(`\n🧹 Cleaning up ${createdActionIds.length} generated test actions...`);
      await prisma.auditEvent.deleteMany({ where: { actionId: { in: createdActionIds } } });
      await prisma.growthAction.deleteMany({ where: { id: { in: createdActionIds } } });
      console.log("✅ Cleanup complete.");
    }
    await prisma.$disconnect();
  }
}

measureAgentLatency()
  .then(() => {
    console.log("\n================================================================================\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Profiling failed:", err);
    process.exit(1);
  });
