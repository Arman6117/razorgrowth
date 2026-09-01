import { prisma } from "../prisma";
import { razorpayMerchantRequest } from "./client";
import { OrderStatus } from "../generated/prisma/enums";

export interface RazorpayCustomerItem {
  id: string;
  name?: string | null;
  email?: string | null;
  contact?: string | null;
  created_at: number;
}

export interface RazorpayCustomerListResponse {
  entity: string;
  count: number;
  items: RazorpayCustomerItem[];
}

export interface RazorpayOrderItem {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt?: string | null;
  status: "created" | "attempted" | "paid";
  notes?: Record<string, string>;
  created_at: number;
}

export interface RazorpayOrderListResponse {
  entity: string;
  count: number;
  items: RazorpayOrderItem[];
}

/**
 * Synchronizes customer records from Razorpay Customers API into local database.
 * Scoped strictly to the specified merchantId.
 * Idempotent: uses upsert on unique([merchantId, email]).
 */
export async function syncCustomers(merchantId: string) {
  let skip = 0;
  const count = 100;
  let totalFound = 0;
  let syncedCount = 0;
  let updatedCount = 0;

  while (true) {
    const response = await razorpayMerchantRequest<RazorpayCustomerListResponse>(
      merchantId,
      `/customers?count=${count}&skip=${skip}`
    );

    const items = response.items || [];
    if (items.length === 0) break;

    totalFound += items.length;

    for (const item of items) {
      const email = (item.email?.trim() || "").toLowerCase() ||
        (item.contact ? `${item.contact}@customer.razorpay` : `cust_${item.id.slice(-8)}@customer.razorpay`);
      const name = item.name?.trim() || "Razorpay Customer";

      const existing = await prisma.customer.findUnique({
        where: {
          merchantId_email: {
            merchantId,
            email,
          },
        },
      });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { name },
        });
        updatedCount++;
      } else {
        await prisma.customer.create({
          data: {
            merchantId,
            name,
            email,
          },
        });
        syncedCount++;
      }
    }

    if (items.length < count) break;
    skip += count;
  }

  return {
    success: true,
    totalFound,
    syncedCount,
    updatedCount,
  };
}

/**
 * Synchronizes transaction/order-level data from Razorpay Orders API into local database.
 * Scoped strictly to the specified merchantId.
 */
export async function syncOrders(merchantId: string) {
  let skip = 0;
  const count = 100;
  let totalFound = 0;
  let syncedCount = 0;

  // Retrieve or create a fallback customer if order has no explicit customer
  let defaultCustomer = await prisma.customer.findFirst({
    where: { merchantId },
  });

  if (!defaultCustomer) {
    defaultCustomer = await prisma.customer.create({
      data: {
        merchantId,
        name: "Store Customer",
        email: `guest_${merchantId.slice(-6)}@store.local`,
      },
    });
  }

  while (true) {
    const response = await razorpayMerchantRequest<RazorpayOrderListResponse>(
      merchantId,
      `/orders?count=${count}&skip=${skip}`
    );

    const items = response.items || [];
    if (items.length === 0) break;

    totalFound += items.length;

    for (const item of items) {
      let targetCustomerId = defaultCustomer.id;

      // Check if notes contain customerId or customerEmail
      const notes = item.notes || {};
      const noteCustomerId = notes.customerId?.trim();
      const noteEmail = (notes.customerEmail || notes.email || "").trim().toLowerCase();

      if (noteCustomerId) {
        const found = await prisma.customer.findFirst({
          where: { id: noteCustomerId, merchantId },
        });
        if (found) targetCustomerId = found.id;
      } else if (noteEmail) {
        let found = await prisma.customer.findUnique({
          where: { merchantId_email: { merchantId, email: noteEmail } },
        });
        if (!found) {
          found = await prisma.customer.create({
            data: {
              merchantId,
              name: notes.customerName || "Store Customer",
              email: noteEmail,
            },
          });
        }
        targetCustomerId = found.id;
      }

      // Map status
      let orderStatus: OrderStatus = OrderStatus.PENDING;
      if (item.status === "paid") {
        orderStatus = OrderStatus.PAID;
      }

      const totalInRupees = item.amount / 100;
      const orderCreatedAt = new Date(item.created_at * 1000);

      // Avoid duplicate order ingestion if order with same customer, total, and timestamp exists
      const existingOrder = await prisma.order.findFirst({
        where: {
          merchantId,
          customerId: targetCustomerId,
          total: totalInRupees,
          createdAt: {
            gte: new Date(orderCreatedAt.getTime() - 2000),
            lte: new Date(orderCreatedAt.getTime() + 2000),
          },
        },
      });

      if (existingOrder) {
        if (existingOrder.status !== orderStatus) {
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: { status: orderStatus },
          });
        }
      } else {
        await prisma.order.create({
          data: {
            merchantId,
            customerId: targetCustomerId,
            total: totalInRupees,
            currency: item.currency || "INR",
            status: orderStatus,
            createdAt: orderCreatedAt,
          },
        });
        syncedCount++;
      }
    }

    if (items.length < count) break;
    skip += count;
  }

  return {
    success: true,
    totalFound,
    syncedCount,
  };
}

/**
 * Runs customer and order sync in sequence and updates lastSyncedAt on connection.
 */
export async function syncAll(merchantId: string) {
  const customerResult = await syncCustomers(merchantId);
  const orderResult = await syncOrders(merchantId);

  const lastSyncedAt = new Date();

  await prisma.razorpayConnection.updateMany({
    where: { merchantId },
    data: { lastSyncedAt },
  });

  return {
    success: true,
    customers: customerResult,
    orders: orderResult,
    lastSyncedAt,
  };
}
