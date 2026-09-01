import { NextRequest, NextResponse } from "next/server";
import {
  extractSessionToken,
  destroySession,
  buildClearSessionCookieHeader,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sessionToken = extractSessionToken(req);
    if (sessionToken) {
      await destroySession(sessionToken);
    }

    const clearCookieHeader = buildClearSessionCookieHeader();
    const headers = new Headers();
    headers.append("Set-Cookie", clearCookieHeader);

    return NextResponse.json(
      {
        success: true,
        message: "Logged out successfully",
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Failed to logout cleanly" },
      { status: 500 }
    );
  }
}
