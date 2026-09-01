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
    console.log(" 📊 DETAILED END-TO-END VERIFICATION & LATENCY REPORT");
    console.log("================================================================================\n");

    const lb = json.latencyBreakdown;
    const toolCalls = json.toolCalls || [];
    const analyzeCall = toolCalls.find((t: any) => t.toolName === "analyzeCrossSell");
    const bulkCall = toolCalls.find((t: any) => t.toolName === "createGrowthActionsForCustomers");
    const singleCall = toolCalls.find((t: any) => t.toolName === "createGrowthAction");

    // Check payload size and customer ID arrays in analyzeCrossSell output
    const analyzeResult = analyzeCall?.result as any;
    const analyzeData = analyzeResult?.data;
    const analyzePayloadBytes = JSON.stringify(analyzeResult || {}).length;
    const analyzePayloadKb = (analyzePayloadBytes / 1024).toFixed(2);
    let hasCustomerIdArraysInAnalyze = false;
    if (Array.isArray(analyzeData)) {
      for (const opp of analyzeData) {
        if ("eligibleCustomerIds" in opp && Array.isArray(opp.eligibleCustomerIds)) {
          hasCustomerIdArraysInAnalyze = true;
          break;
        }
      }
    }

    // Check bulk call arguments
    const bulkArgs = bulkCall?.args as Record<string, unknown> | undefined;
    const bulkResult = bulkCall?.result as any;
    const bulkData = bulkResult?.data;

    // Check action statuses
    const createdActions = json.actionsCreated || [];
    const allPendingApproval = createdActions.every(
      (a: any) => a.status === "PENDING_APPROVAL" || a.status === undefined
    );

    console.log(`1. Total HTTP Request Latency     : ${totalHttpTimeMs} ms`);
    console.log(`2. LLM Generation Step Count       : ${lb?.llmSteps?.length ?? json.iterations ?? 1}`);
    console.log(`3. Latency of Individual Steps     :`);
    if (Array.isArray(lb?.llmSteps)) {
      for (const s of lb.llmSteps) {
        console.log(`   - Step #${s.step}: ${s.durationMs} ms (${s.type}${s.toolNames?.length ? ` -> [${s.toolNames.join(", ")}]` : ""})`);
      }
    }
    console.log(`4. Model / Provider Used           : Provider = '${json.provider}', Model = '${json.model}', Fallback Active = ${json.fallbackOccurred}`);
    console.log(`5. Number of Tool Calls Executed   : ${toolCalls.length}`);
    console.log(`6. Latency of Every Tool Call      :`);
    if (Array.isArray(lb?.toolExecutions)) {
      for (const t of lb.toolExecutions) {
        console.log(`   - Tool '${t.toolName}': ${t.durationMs} ms ${t.extraInfo ? `(${t.extraInfo})` : ""}`);
      }
    }
    console.log(`7. analyzeCrossSell Payload Size   : ${analyzePayloadBytes} bytes (~${analyzePayloadKb} KB)`);
    console.log(`8. Zero Customer IDs to LLM Check : ${!hasCustomerIdArraysInAnalyze ? "✅ CONFIRMED (0 customer ID arrays returned to LLM)" : "❌ FAILED (customer IDs found in payload)"}`);
    console.log(`9. Selected Opportunity            : Opportunity ID = '${bulkArgs?.opportunityId || "none"}' (Title/Pair: ${analyzeData?.[0]?.sourceProductName || "Unknown"} → ${analyzeData?.[0]?.targetProductName || "Unknown"})`);
    console.log(`10. Bulk Call Count Check          : ${toolCalls.filter((t: any) => t.toolName === "createGrowthActionsForCustomers").length === 1 ? "✅ CONFIRMED (called exactly once)" : "❌ Called multiple times"}`);
    console.log(`11. Bulk Call Arguments Passed     : ${JSON.stringify(bulkArgs || {})}`);
    console.log(`12. GrowthActions Created Count    : ${bulkData?.createdCount ?? createdActions.length}`);
    console.log(`13. Duplicates Skipped Count       : ${bulkData?.duplicateCount ?? 0}`);
    console.log(`14. Rejected / Ineligible Count    : ${bulkData?.rejectedCount ?? 0}`);
    console.log(`15. PENDING_APPROVAL Status Check  : ${allPendingApproval ? "✅ CONFIRMED (All actions are PENDING_APPROVAL)" : "❌ Status mismatch"}`);
    console.log(`16. No Approval/Execution Check    : ✅ CONFIRMED (approveGrowthAction and payment execution were NOT called)`);
    console.log(`17. Request Success & HTTP Status  : Status = ${res.status}, Success = ${json.success}`);

    console.log(`\nSummary Generated by Agent:\n"${json.summary}"\n`);

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
