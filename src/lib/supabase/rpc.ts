import { createAdminClient } from "./admin";

/**
 * Call a Postgres RPC via the service-role PostgREST client. The rpc call MUST be a
 * method call on the client (`db.rpc(...)`) so `this` stays bound — extracting the
 * function detaches it and PostgREST fails on `this.url`. Cast contained here so
 * RPCs not present in the generated Database types remain callable.
 */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = createAdminClient() as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string } | null }>;
  };
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
