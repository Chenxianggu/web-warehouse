import { auditTransaction, type AuditActor } from "@/server/audit";

export async function updateCustomerRecord(id: number, code: string, fullName: string, actor?: AuditActor) {
  return auditTransaction(actor, async (tx) => {
    const old = await tx.customer.findUnique({ where: { id }, select: { code: true } });
    if (!old) return false;
    await tx.customer.update({ where: { id }, data: { code, fullName } });
    if (old.code !== code) {
      // Copy shared addresses to the new code. Other directory records using
      // the original code must keep their addresses, including overlapping ones.
      const receivers = await tx.receiverHistory.findMany({ where: { customerCode: old.code }, select: { receiver: true } });
      if (receivers.length) await tx.receiverHistory.createMany({ data: receivers.map(({ receiver }) => ({ customerCode: code, receiver })), skipDuplicates: true });
      if (await tx.customer.count({ where: { code: old.code } }) === 0) await tx.receiverHistory.deleteMany({ where: { customerCode: old.code } });
    }
    return true;
  });
}

export async function deleteCustomerRecord(id: number, actor?: AuditActor) {
  return auditTransaction(actor, async (tx) => {
    const customer = await tx.customer.delete({ where: { id } });
    if (await tx.customer.count({ where: { code: customer.code } }) === 0) await tx.receiverHistory.deleteMany({ where: { customerCode: customer.code } });
  });
}
