import { AuditEventItem } from "@/components/audit-timeline";

export interface MerchantInfo {
  id: string;
  name: string;
  email: string;
  currency: string;
  counts: {
    customers: number;
    products: number;
    orders: number;
    opportunities: number;
    growthActions: number;
    actionsByStatus: Record<string, number>;
    realizedRevenue?: number;
  };
}

export interface OpportunityItem {
  id: string;
  merchantId: string;
  sourceProductId: string;
  sourceProductName: string;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  sourceCustomers: number;
  customersTogether: number;
  eligibleCustomerCount: number;
  eligibleCustomerIds: string[];
  crossSellRate: number;
  expectedRevenue: number;
  status: string;
  actionCount: number;
  createdAt: string;
}

export interface CustomerItem {
  id: string;
  name: string;
  email: string;
  totalPaidOrders: number;
  totalSpend: number;
  existingAction: {
    id: string;
    status: string;
    type: string;
    parameters: Record<string, unknown>;
    approvedAt?: string | null;
    executedAt?: string | null;
    createdAt: string;
  } | null;
}

export interface GrowthActionDetail {
  id: string;
  merchantId: string;
  opportunityId: string;
  type: string;
  status: string;
  parameters: {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    targetProductId?: string;
    targetProductName?: string;
    sourceProductId?: string;
    amountInRupees?: number;
    amountInPaise?: number;
    currency?: string;
    paymentLinkId?: string;
    shortUrl?: string;
    paymentLinkStatus?: string;
    [key: string]: unknown;
  };
  approvedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  opportunity: {
    id: string;
    title: string;
    sourceProduct?: { name: string; price: number };
    targetProduct?: { name: string; price: number };
  };
  auditEvents: AuditEventItem[];
}

export interface RazorpayConnectionInfo {
  connected: boolean;
  connection?: {
    keyId: string;
    mode: string;
    connectedAt: string;
    lastSyncedAt?: string | null;
  } | null;
}

export interface ToastNotification {
  type: "success" | "error" | "info";
  message: string;
}
