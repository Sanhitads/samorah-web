/**
 * Typed access to the analytics SQL RPCs. The generated `Database` type doesn't yet include these
 * functions, so instead of falling back to `any` we EXTEND the client with a precise, hand-written RPC
 * surface — call sites get fully-typed rows with no `any` escape. (A `supabase gen types` regen would
 * fold these into `Database` and remove even this thin cast; documented as the eventual clean-up.)
 *
 * NOTE: PostgREST serializes Postgres `bigint`/`numeric` as JSON strings, so numeric row fields are typed
 * `string | number` and coerced by callers.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface AnalyticsKpiSnapshotRow {
  cur_orders: string | number;
  cur_revenue: string | number;
  prev_orders: string | number;
  prev_revenue: string | number;
  today_orders: string | number;
  today_revenue: string | number;
  yday_orders: string | number;
  yday_revenue: string | number;
}

export interface AnalyticsDailyRow {
  day: string;
  orders: string | number;
  revenue: string | number;
}

export interface AnalyticsDailyV2Row extends AnalyticsDailyRow {
  customers: string | number;
}

type RpcResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

interface AnalyticsRpcClient {
  rpc(fn: "analytics_kpi_snapshot_v1", args: { p_window_days: number }): RpcResult<AnalyticsKpiSnapshotRow>;
  rpc(fn: "analytics_daily_series_v1", args: { p_window_days: number }): RpcResult<AnalyticsDailyRow>;
  rpc(fn: "analytics_daily_series_v2", args: { p_window_days: number }): RpcResult<AnalyticsDailyV2Row>;
}

/** Service-role client narrowed to the analytics RPC surface (server-only, no `any`). */
export function analyticsRpc(): AnalyticsRpcClient {
  return createAdminClient() as unknown as AnalyticsRpcClient;
}
