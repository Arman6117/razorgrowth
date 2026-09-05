import React from "react";
import { Key, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MerchantInfo, RazorpayConnectionInfo } from "@/lib/dashboard/types";

interface StoreIntegrationProps {
  merchant: MerchantInfo | null;
  connectionInfo: RazorpayConnectionInfo | null;
  syncingType: "customers" | "orders" | "all" | null;
  onOpenConnectModal: () => void;
  onDisconnectRazorpay: () => void;
  onSyncData: (type: "customers" | "orders" | "all") => void;
  onOpenCsvModal: () => void;
}

export function StoreIntegration({
  merchant,
  connectionInfo,
  syncingType,
  onOpenConnectModal,
  onDisconnectRazorpay,
  onSyncData,
  onOpenCsvModal,
}: StoreIntegrationProps) {
  return (
    <Card className="p-5 space-y-4 bg-card border-border">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Key className="w-4 h-4 text-neutral-500" />
            Commerce Data Ingestion & Gateway
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect Razorpay test credentials to ingest order history and issue payment links.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs select-none">
          <span className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-[11px]">
            Customers: <strong>{merchant?.counts.customers || 0}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-[11px]">
            Orders: <strong>{merchant?.counts.orders || 0}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-[11px]">
            Products: <strong>{merchant?.counts.products || 0}</strong>
          </span>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Razorpay Connection Card */}
        <div className="p-4 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Razorpay Gateway
              </span>
              {connectionInfo?.connected ? (
                <span className="text-[10px] px-2 py-0.5 font-medium rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center gap-1 select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected (Test)
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 font-medium rounded-md bg-neutral-200/70 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 select-none">
                  Not Connected
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
              {connectionInfo?.connected ? (
                <>
                  <p className="font-mono text-[11px] text-foreground">
                    {connectionInfo.connection?.keyId.slice(0, 12)}...
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Last Synced: {connectionInfo.connection?.lastSyncedAt ? new Date(connectionInfo.connection.lastSyncedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "Never"}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Connect Razorpay Key ID and Secret to synchronize customers, verify orders, and dispatch payment links.
                </p>
              )}
            </div>
          </div>

          <div className="pt-2">
            {connectionInfo?.connected ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onDisconnectRazorpay}
                className="w-full text-xs"
              >
                Disconnect Gateway
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={onOpenConnectModal}
                className="w-full text-xs"
              >
                Connect Razorpay
              </Button>
            )}
          </div>
        </div>

        {/* Data Sync Card */}
        <div className="p-4 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border flex flex-col justify-between space-y-3">
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Transaction Synchronization
            </span>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Fetch authoritative customer records and transaction orders directly from Razorpay APIs.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("customers")}
              className="text-xs px-1.5"
            >
              {syncingType === "customers" ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Syncing</span>
                </>
              ) : (
                "Customers"
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("orders")}
              className="text-xs px-1.5"
            >
              {syncingType === "orders" ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Syncing</span>
                </>
              ) : (
                "Orders"
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("all")}
              className="text-xs px-1.5"
            >
              {syncingType === "all" ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>All</span>
                </>
              ) : (
                "Sync All"
              )}
            </Button>
          </div>
        </div>

        {/* Product Catalog Import Card */}
        <div className="p-4 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border flex flex-col justify-between space-y-3">
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Product Catalog Ingestion
            </span>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Import and maintain authoritative product pricing and category metadata via CSV.
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCsvModal}
              className="w-full text-xs"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import Product CSV
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
