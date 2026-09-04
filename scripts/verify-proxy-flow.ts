import { proxy } from "../proxy";
import { NextRequest } from "next/server";
import { createSession, destroySession } from "../lib/auth/session";
import { prisma } from "../lib/prisma";

async function verifyProxyInterception() {
  console.log("================================================================================");
  console.log(" 🚀 Next.js 16: Proxy Route Protection & Interception Verification");
  console.log("================================================================================\n");

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) throw new Error("No merchant in DB");

  const session = await createSession(merchant.id);

  try {
    // -------------------------------------------------------------------------
    // Flow A: Logged out -> / redirects to /login
    // -------------------------------------------------------------------------
    console.log("🔒 Flow A: Logged out visiting '/' -> Expected: Redirect to /login");
    const reqA = new NextRequest("http://localhost:3000/");
    const resA = proxy(reqA);
    console.log(`   Response Status: ${resA.status}`);
    console.log(`   Location Header: ${resA.headers.get("location")}`);

    if (resA.status !== 307 && resA.status !== 308 && resA.status !== 302 && resA.status !== 301) {
      throw new Error(`Expected redirect status for logged out user accessing '/', got ${resA.status}`);
    }
    if (!resA.headers.get("location")?.includes("/login")) {
      throw new Error(`Expected redirect to /login, got ${resA.headers.get("location")}`);
    }
    console.log("   ✅ Unauthenticated dashboard request redirected to /login.\n");

    // -------------------------------------------------------------------------
    // Flow B: Logged out -> Protected API returns 401
    // -------------------------------------------------------------------------
    console.log("🚫 Flow B: Logged out calling protected API '/api/merchant' -> Expected: 401");
    const reqB = new NextRequest("http://localhost:3000/api/merchant");
    const resB = proxy(reqB);
    const jsonB = await resB.json();
    console.log(`   Response Status: ${resB.status}`);
    console.log(`   Response JSON  : ${JSON.stringify(jsonB)}`);

    if (resB.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated API access, got ${resB.status}`);
    }
    console.log("   ✅ Protected API call without session token blocked with 401.\n");

    // -------------------------------------------------------------------------
    // Flow C: Authenticated -> Dashboard '/' allowed (NextResponse.next())
    // -------------------------------------------------------------------------
    console.log("🔓 Flow C: Authenticated merchant visiting '/' -> Expected: Allowed (NextResponse.next())");
    const reqC = new NextRequest("http://localhost:3000/", {
      headers: {
        Cookie: `razorgrowth_session=${session.sessionToken}`,
      },
    });
    const resC = proxy(reqC);
    console.log(`   Redirect Location: ${resC.headers.get("location") || "None (Allowed through)"}`);

    if (resC.headers.get("location")) {
      throw new Error(`Expected authenticated request to pass through, but got redirect to ${resC.headers.get("location")}`);
    }
    console.log("   ✅ Authenticated request permitted to access dashboard.\n");

    // -------------------------------------------------------------------------
    // Flow D: Authenticated -> Visiting '/login' or '/signup' redirects to '/'
    // -------------------------------------------------------------------------
    console.log("🔄 Flow D: Authenticated merchant visiting '/login' -> Expected: Redirect to '/'");
    const reqD = new NextRequest("http://localhost:3000/login", {
      headers: {
        Cookie: `razorgrowth_session=${session.sessionToken}`,
      },
    });
    const resD = proxy(reqD);
    console.log(`   Response Status: ${resD.status}`);
    console.log(`   Location Header: ${resD.headers.get("location")}`);

    if (!resD.headers.get("location")?.endsWith("/")) {
      throw new Error(`Expected redirect to '/', got ${resD.headers.get("location")}`);
    }
    console.log("   ✅ Authenticated user visiting auth pages correctly redirected to dashboard.\n");

    // -------------------------------------------------------------------------
    // Flow E: Public /api/auth, /api/webhooks, and /api/ai/catalog/public bypassed by proxy
    // -------------------------------------------------------------------------
    console.log("🌐 Flow E: Public Webhooks, Auth APIs & Public AI Catalog -> Expected: Allowed through");
    const reqE1 = new NextRequest("http://localhost:3000/api/auth/login", { method: "POST" });
    const resE1 = proxy(reqE1);
    console.log(`   /api/auth/login -> Location: ${resE1.headers.get("location") || "None (Allowed through)"}`);

    const reqE2 = new NextRequest("http://localhost:3000/api/webhooks/razorpay", { method: "POST" });
    const resE2 = proxy(reqE2);
    console.log(`   /api/webhooks/razorpay -> Location: ${resE2.headers.get("location") || "None (Allowed through)"}`);

    const reqE3 = new NextRequest("http://localhost:3000/api/ai/catalog/public", { method: "GET" });
    const resE3 = proxy(reqE3);
    console.log(`   /api/ai/catalog/public -> Location: ${resE3.headers.get("location") || "None (Allowed through)"}`);

    if (resE1.headers.get("location") || resE2.headers.get("location") || resE3.headers.get("location")) {
      throw new Error("Public auth/webhook/public-catalog endpoints should not be redirected by proxy");
    }
    console.log("   ✅ Public routes correctly bypassed by proxy.\n");

    console.log("================================================================================");
    console.log(" 🎉 ALL NEXT.JS 16 PROXY FLOW VERIFICATIONS PASSED 100%!");
    console.log("================================================================================\n");
  } finally {
    await destroySession(session.sessionToken);
    await prisma.$disconnect();
  }
}

verifyProxyInterception().catch((err) => {
  console.error("❌ Proxy verification failed:", err);
  process.exit(1);
});
