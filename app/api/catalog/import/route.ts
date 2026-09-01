import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface ParsedProductRow {
  name: string;
  description?: string;
  category?: string;
  price: number;
  active: boolean;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseProductCSV(csvText: string): ParsedProductRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must contain at least a header row and one product row");
  }

  const headerLine = parseCSVLine(lines[0].toLowerCase());
  const nameIdx = headerLine.indexOf("name");
  const priceIdx = headerLine.indexOf("price");
  const descIdx = headerLine.indexOf("description");
  const catIdx = headerLine.indexOf("category");
  const activeIdx = headerLine.indexOf("active");

  if (nameIdx === -1 || priceIdx === -1) {
    throw new Error("CSV header must contain at least 'name' and 'price' columns");
  }

  const rows: ParsedProductRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const rawName = cols[nameIdx];
    const rawPrice = cols[priceIdx];

    if (!rawName) continue;

    const price = parseFloat(rawPrice.replace(/[^0-9.]/g, ""));
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price '${rawPrice}' on row ${i + 1}`);
    }

    const description = descIdx !== -1 ? cols[descIdx] || undefined : undefined;
    const category = catIdx !== -1 ? cols[catIdx] || undefined : undefined;
    const rawActive = activeIdx !== -1 ? (cols[activeIdx] || "").toLowerCase() : "true";
    const active = rawActive !== "false" && rawActive !== "0" && rawActive !== "no";

    rows.push({
      name: rawName,
      description,
      category,
      price,
      active,
    });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    let csvContent = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      csvContent = body.csvData || body.csv || "";
    } else if (contentType.includes("multipart/form-data") || contentType.includes("form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (file && typeof file === "object" && "text" in file) {
        csvContent = await (file as Blob).text();
      } else {
        csvContent = (formData.get("csvData") as string) || "";
      }
    } else {
      csvContent = await req.text();
    }

    if (!csvContent.trim()) {
      return NextResponse.json(
        { error: "No CSV content provided. Provide 'csvData' in JSON or upload a CSV file." },
        { status: 400 }
      );
    }

    const parsedRows = parseProductCSV(csvContent);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "No valid product records found in CSV" },
        { status: 400 }
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    const importedProducts = [];

    // Deterministic upsert on existing products for this merchant
    for (const row of parsedRows) {
      const existing = await prisma.product.findFirst({
        where: {
          merchantId,
          name: {
            equals: row.name,
            mode: "insensitive",
          },
        },
      });

      if (existing) {
        const updated = await prisma.product.update({
          where: { id: existing.id },
          data: {
            description: row.description ?? existing.description,
            category: row.category ?? existing.category,
            price: row.price,
            active: row.active,
          },
        });
        updatedCount++;
        importedProducts.push(updated);
      } else {
        const created = await prisma.product.create({
          data: {
            merchantId,
            name: row.name,
            description: row.description,
            category: row.category,
            price: row.price,
            active: row.active,
          },
        });
        createdCount++;
        importedProducts.push(created);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Catalog import complete: ${createdCount} products added, ${updatedCount} updated.`,
        createdCount,
        updatedCount,
        totalProcessed: parsedRows.length,
        products: importedProducts,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to import catalog";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
