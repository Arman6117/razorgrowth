import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAIPublicCatalog, PublicCatalogError } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

/**
 * Zod schema for validating public catalog discovery query parameters.
 */
export const PublicCatalogQuerySchema = z
  .object({
    merchant: z.string().trim().min(1).optional(),
    merchantId: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    includeJsonLd: z
      .enum(["true", "false"])
      .optional()
      .transform((val) => val !== "false"),
  })
  .refine(
    (data) => Boolean(data.merchant || data.merchantId || data.slug),
    {
      message: "A merchant identifier (merchant, merchantId, or slug) is required",
      path: ["merchant"],
    }
  );

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryObj = {
      merchant: searchParams.get("merchant") || undefined,
      merchantId: searchParams.get("merchantId") || undefined,
      slug: searchParams.get("slug") || undefined,
      includeJsonLd: searchParams.get("includeJsonLd") || undefined,
    };

    const parsed = PublicCatalogQuerySchema.safeParse(queryObj);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json(
        { error: `Invalid request parameters: ${errorMsg}` },
        { status: 400 }
      );
    }

    const { merchant, merchantId, slug, includeJsonLd } = parsed.data;
    // Preferred contract: GET /api/ai/catalog/public?merchant=<publicIdentifier>
    // Backward-compatible demo/internal parameters: slug, merchantId
    const identifier = merchant || slug || merchantId;

    if (!identifier) {
      return NextResponse.json(
        { error: "A merchant identifier (merchant, merchantId, or slug) is required" },
        { status: 400 }
      );
    }

    const catalog = await getAIPublicCatalog(identifier, {
      includeJsonLd,
    });

    return NextResponse.json(catalog, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    if (error instanceof PublicCatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve public catalog";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
