import { getPrisma } from "@/server/db";
import { serializeCustomerOrders } from "@/server/customer-orders";
import { orderSearchSchema, type OrderSearchFilter, type OrderSearchPage } from "@/features/order-search/schema";
import type { Prisma } from "@/generated/prisma/client";

export async function searchCustomerOrders(input: OrderSearchFilter): Promise<OrderSearchPage> {
  const filter = orderSearchSchema.parse(input);
  const where: Prisma.CustomerOrderWhereInput = {
    ...(filter.orderNo ? { orderNo: { contains: filter.orderNo, mode: "insensitive" } } : {}),
    ...(filter.customer ? { OR: [
      { customerCode: { contains: filter.customer, mode: "insensitive" } },
      { customerName: { contains: filter.customer, mode: "insensitive" } },
    ] } : {}),
    ...(filter.startDate && filter.endDate ? { orderDate: {
      gte: new Date(`${filter.startDate}T00:00:00Z`),
      lte: new Date(`${filter.endDate}T00:00:00Z`),
    } } : {}),
  };
  const result = await getPrisma().$transaction(async (tx) => {
    const total = await tx.customerOrder.count({ where });
    const page = Math.min(filter.page, Math.max(1, Math.ceil(total / filter.pageSize)));
    const orders = await tx.customerOrder.findMany({
      where, orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * filter.pageSize, take: filter.pageSize,
      include: { items: { orderBy: { id: "asc" } } },
    });
    return { orders, total, page };
  }, { isolationLevel: "RepeatableRead" });
  return { data: await serializeCustomerOrders(result.orders), total: result.total, page: result.page, pageSize: filter.pageSize };
}
