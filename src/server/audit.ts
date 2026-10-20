import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { isExpectedDatabaseError, reportRuntimeError } from "@/server/runtime-errors";

export type AuditActor = { id: string; username: string };

/** Context and all resulting row snapshots commit or roll back together. */
export async function auditTransaction<T>(
  actor: AuditActor | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  module = "业务事务",
): Promise<T> {
  const requestId = randomUUID();
  try {
    return await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('rz.actor_id', ${actor?.id ?? ""}, true), set_config('rz.actor_name', ${actor?.username ?? "系统"}, true), set_config('rz.request_id', ${requestId}, true)`;
      return work(tx);
    }, options);
  } catch (error) {
    // Validation/optimistic conflicts return before this point; expected
    // uniqueness, reference and missing-record failures are not incidents.
    if (!isExpectedDatabaseError(error)) await reportRuntimeError(error, { module, action: "BUSINESS_WRITE_FAILED", requestId });
    throw error;
  }
}

export function businessTransaction(module: string) {
  return <T>(actor: AuditActor | undefined, work: (tx: Prisma.TransactionClient) => Promise<T>, options?: Parameters<typeof auditTransaction>[2]) =>
    auditTransaction(actor, work, options, module);
}
