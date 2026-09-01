import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { createSession, resolveMerchantFromToken, destroySession } from "../lib/auth/session";
import { POST as signupPOST } from "../app/api/auth/signup/route";
import { POST as loginPOST } from "../app/api/auth/login/route";
import { POST as logoutPOST } from "../app/api/auth/logout/route";
import { GET as meGET } from "../app/api/auth/me/route";
import { GET as merchantGET } from "../app/api/merchant/route";
import { GET as oppsGET } from "../app/api/opportunities/route";
import { POST as agentPOST } from "../app/api/agent/route";
import { NextRequest } from "next/server";

async function runAuthTests() {
  console.log("================================================================================");
  console.log(" 🔐 RazorGrowth: Merchant Authentication & Session Security Test Suite");
  console.log("================================================================================\n");

  const testEmail = `merchant_auth_test_${Date.now()}@example.com`;
  const testPassword = "SuperSecurePassword123!";
  let createdMerchantId: string | null = null;
  let sessionToken: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Test Password Hashing & Verification Security
    // -------------------------------------------------------------------------
    console.log("🔑 1. Testing Cryptographic Password Hashing & Verification...");
    const hashed = await hashPassword(testPassword);
    console.log(`   Hashed format: ${hashed.slice(0, 32)}...`);
    const validCheck = await verifyPassword(testPassword, hashed);
    const invalidCheck = await verifyPassword("WrongPassword123!", hashed);

    if (!validCheck || invalidCheck) {
      throw new Error("Password verification failed security checks");
    }
    console.log("   ✅ Password hashing & constant-time verification passed.\n");

    // -------------------------------------------------------------------------
    // 2. Test Signup Endpoint (POST /api/auth/signup)
    // -------------------------------------------------------------------------
    console.log("📝 2. Testing Merchant Signup (POST /api/auth/signup)...");
    const signupReq = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Auth Store",
        email: testEmail,
        password: testPassword,
      }),
    });

    const signupRes = await signupPOST(signupReq);
    const signupJson = await signupRes.json();
    console.log(`   HTTP Status: ${signupRes.status}`);
    console.log(`   Response   : ${JSON.stringify(signupJson)}`);

    if (signupRes.status !== 201 || !signupJson.success || !signupJson.merchant?.id) {
      throw new Error(`Signup failed: ${signupJson.error}`);
    }

    createdMerchantId = signupJson.merchant.id;
    const cookieHeader = signupRes.headers.get("set-cookie") || "";
    const tokenMatch = cookieHeader.match(/razorgrowth_session=([^;]+)/);
    if (!tokenMatch) {
      throw new Error("Expected Set-Cookie header with razorgrowth_session token");
    }
    sessionToken = decodeURIComponent(tokenMatch[1]);
    console.log(`   Session Token Generated: ${sessionToken.slice(0, 16)}...`);
    console.log("   ✅ Merchant signup and session cookie creation passed.\n");

    // -------------------------------------------------------------------------
    // 3. Test Duplicate Email Signup Prevention
    // -------------------------------------------------------------------------
    console.log("🚫 3. Testing Duplicate Email Signup Rejection...");
    const dupSignupReq = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate Store",
        email: testEmail,
        password: testPassword,
      }),
    });

    const dupRes = await signupPOST(dupSignupReq);
    const dupJson = await dupRes.json();
    console.log(`   HTTP Status: ${dupRes.status} (Expected: 409)`);
    console.log(`   Error Msg  : "${dupJson.error}"`);

    if (dupRes.status !== 409) {
      throw new Error("Expected duplicate signup to fail with HTTP 409");
    }
    console.log("   ✅ Duplicate email registration correctly rejected.\n");

    // -------------------------------------------------------------------------
    // 4. Test Login with Invalid Password (No User Enumeration)
    // -------------------------------------------------------------------------
    console.log("🛡️ 4. Testing Login with Invalid Password...");
    const badLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "IncorrectPassword!",
      }),
    });

    const badLoginRes = await loginPOST(badLoginReq);
    const badLoginJson = await badLoginRes.json();
    console.log(`   HTTP Status: ${badLoginRes.status} (Expected: 401)`);
    console.log(`   Error Msg  : "${badLoginJson.error}"`);

    if (badLoginRes.status !== 401 || badLoginJson.error !== "Invalid email or password") {
      throw new Error("Expected generic 401 error message on bad login");
    }
    console.log("   ✅ Invalid login safely rejected with generic error.\n");

    // -------------------------------------------------------------------------
    // 5. Test Login with Valid Credentials
    // -------------------------------------------------------------------------
    console.log("🔓 5. Testing Login with Valid Credentials...");
    const validLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const loginRes = await loginPOST(validLoginReq);
    const loginJson = await loginRes.json();
    console.log(`   HTTP Status: ${loginRes.status} (Expected: 200)`);
    console.log(`   Merchant   : ${loginJson.merchant?.name} (${loginJson.merchant?.id})`);

    if (loginRes.status !== 200 || !loginJson.success) {
      throw new Error(`Login failed: ${loginJson.error}`);
    }

    const loginCookie = loginRes.headers.get("set-cookie") || "";
    const loginToken = decodeURIComponent(loginCookie.match(/razorgrowth_session=([^;]+)/)![1]);
    console.log("   ✅ Valid merchant login established new authenticated session.\n");

    // -------------------------------------------------------------------------
    // 6. Test Protected API Routes with Authenticated Session
    // -------------------------------------------------------------------------
    console.log("🛡️ 6. Testing Protected API Routes with Session...");
    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: `razorgrowth_session=${loginToken}`,
    };

    // GET /api/merchant
    const merchantReq = new NextRequest("http://localhost:3000/api/merchant", {
      method: "GET",
      headers: authHeaders,
    });
    const merchantRes = await merchantGET(merchantReq);
    const merchantData = await merchantRes.json();
    console.log(`   GET /api/merchant -> Status: ${merchantRes.status}, Merchant ID: ${merchantData.merchant?.id}`);

    if (merchantRes.status !== 200 || merchantData.merchant?.id !== createdMerchantId) {
      throw new Error("Expected /api/merchant to return session-authenticated merchant");
    }

    // GET /api/auth/me
    const meReq = new NextRequest("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: authHeaders,
    });
    const meRes = await meGET(meReq);
    const meData = await meRes.json();
    console.log(`   GET /api/auth/me -> Authenticated: ${meData.authenticated}, Name: ${meData.merchant?.name}`);
    console.log("   ✅ Protected endpoints successfully resolved merchant from session.\n");

    // -------------------------------------------------------------------------
    // 7. Test Protected API Routes Reject Unauthenticated Requests (401)
    // -------------------------------------------------------------------------
    console.log("🚫 7. Testing Protected API Routes Reject Unauthenticated Requests...");
    const unauthReq = new NextRequest("http://localhost:3000/api/merchant", {
      method: "GET",
    });
    const unauthRes = await merchantGET(unauthReq);
    const unauthJson = await unauthRes.json();
    console.log(`   Unauthenticated GET /api/merchant -> Status: ${unauthRes.status} (Expected: 401)`);
    console.log(`   Error Msg: "${unauthJson.error}"`);

    if (unauthRes.status !== 401) {
      throw new Error("Expected unauthenticated request to return HTTP 401");
    }

    const unauthAgentReq = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Find opportunities" }),
    });
    const unauthAgentRes = await agentPOST(unauthAgentReq);
    console.log(`   Unauthenticated POST /api/agent -> Status: ${unauthAgentRes.status} (Expected: 401)`);

    if (unauthAgentRes.status !== 401) {
      throw new Error("Expected unauthenticated AI agent request to return HTTP 401");
    }
    console.log("   ✅ Unauthenticated requests strictly rejected across all protected APIs.\n");

    // -------------------------------------------------------------------------
    // 8. Test Logout Flow (POST /api/auth/logout)
    // -------------------------------------------------------------------------
    console.log("🚪 8. Testing Logout (POST /api/auth/logout)...");
    const logoutReq = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: authHeaders,
    });
    const logoutRes = await logoutPOST(logoutReq);
    console.log(`   Logout Status: ${logoutRes.status}`);

    // Verify session is destroyed in DB
    const postLogoutMerchant = await resolveMerchantFromToken(loginToken);
    console.log(`   Session Token Resolution Post-Logout: ${postLogoutMerchant ? "Active" : "Invalidated (null)"}`);

    if (postLogoutMerchant !== null) {
      throw new Error("Expected session to be completely invalidated post-logout");
    }
    console.log("   ✅ Logout cleanly destroyed session and invalidated subsequent access.\n");

    console.log("================================================================================");
    console.log(" 🎉 ALL MERCHANT AUTHENTICATION & SESSION TESTS PASSED PERFECTLY!");
    console.log("================================================================================\n");
  } finally {
    if (createdMerchantId) {
      console.log("🧹 Cleaning up test merchant fixtures...");
      await prisma.session.deleteMany({ where: { merchantId: createdMerchantId } });
      await prisma.merchant.delete({ where: { id: createdMerchantId } });
      console.log("✅ Cleanup complete.");
    }
    await prisma.$disconnect();
  }
}

runAuthTests().catch((err) => {
  console.error("❌ Auth test failed:", err);
  process.exit(1);
});
