/**
 * Server-derived staff identity + capability assertion for manufacturing writes.
 * The actor is resolved by the API route via requireCapability() and passed in —
 * it is NEVER constructed from client-supplied input. Every manufacturing write
 * asserts its capability here (defense-in-depth alongside the route guard).
 */
import { hasCapability, type Capability } from "@/lib/auth/capabilities";

export interface StaffActor {
  userId: string;
  role: string;
}

export class ForbiddenError extends Error {
  constructor(cap: Capability) {
    super(`Forbidden — needs the ${cap} capability.`);
    this.name = "ForbiddenError";
  }
}

export function assertCap(actor: StaffActor | null | undefined, cap: Capability): asserts actor is StaffActor {
  if (!actor?.userId || !hasCapability(actor.role, cap)) throw new ForbiddenError(cap);
}
