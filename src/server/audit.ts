import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";

export type AuditActor = { id: string; username: string };

/** Context and all resulting row snapshots commit or roll back together. */
export async function auditTransaction<T>(
  actor: AuditActor | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('rz.actor_id', ${actor?.id ?? ""}, true), set_config('rz.actor_name', ${actor?.username ?? "系统"}, true), set_config('rz.request_id', ${randomUUID()}, true)`;
    return work(tx);
  }, options);
}
