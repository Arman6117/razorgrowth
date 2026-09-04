import React from "react";
import { Key, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-500" />
            Store Integration & Data Ingestion
          </h3>
          <p className="text-xs text-neutral-500">
            Connect Razorpay Test Mode and synchronize transaction history or import product catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Customers: <strong>{merchant?.counts.customers || 0}</strong>
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Orders: <strong>{merchant?.counts.orders || 0}</strong>
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Products: <strong>{merchant?.counts.products || 0}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Razorpay Connection Card */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Razorpay Gateway
              </span>
              {connectionInfo?.connected ? (
                <span className="text-[10px] px-2 py-0.5 font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected (Test)
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 font-semibold rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                  Not Connected
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
              {connectionInfo?.connected ? (
                <>
                  <p className="font-mono text-neutral-800 dark:text-neutral-200">
                    {connectionInfo.connection?.keyId.slice(0, 12)}...
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Last Synced: {connectionInfo.connection?.lastSyncedAt ? new Date(connectionInfo.connection.lastSyncedAt).toLocaleString() : "Never"}
                  </p>
                </>
              ) : (
                <p className="text-neutral-400">
                  Connect your Razorpay Test Key ID & Secret to sync live orders and send payment links.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {connectionInfo?.connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnectRazorpay}
                className="w-full text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 cursor-pointer"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onOpenConnectModal}
                className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Connect Razorpay
              </Button>
            )}
          </div>
        </div>

        {/* Data Sync Card */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
          <div>
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Razorpay Data Sync
            </span>
            <p className="mt-1 text-xs text-neutral-500">
              Fetch customer records and transaction orders directly from Razorpay APIs.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("customers")}
              className="text-xs px-2 cursor-pointer"
            >
              {syncingType === "customers" ? "Syncing..." : "Customers"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("orders")}
              className="text-xs px-2 cursor-pointer"
            >
              {syncingType === "orders" ? "Syncing..." : "Orders"}
            </Button>
            <Button
              size="sm"
              disabled={syncingType !== null}
              onClick={() => onSyncData("all")}
              className="text-xs px-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 cursor-pointer"
            >
              {syncingType === "all" ? "Syncing..." : "Sync All"}
            </Button>
          </div>
        </div>

        {/* Product Catalog Import Card */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
          <div>
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Product Catalog
            </span>
            <p className="mt-1 text-xs text-neutral-500">
              Import products with prices and categories using simple CSV ingestion.
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCsvModal}
              className="w-full text-xs gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Product CSV
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
